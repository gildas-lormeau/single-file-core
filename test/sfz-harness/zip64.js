// §5.7 states that the page.pdf central-record injection applies its accounting to the zip64
// end of central directory record when one is present, and claimed the combination "has been
// verified on a forced-zip64 build". No such build existed here: the writer has no zip64 lever
// and §8.3 described the specimen only in prose, so nothing checked the branch. It runs only past
// 4 GiB or 65535 entries, which a saved page never reaches, so a defect in it would be invisible.
//
// zipWriter.options is a live reference to the object the ZipWriter was constructed with, so the
// writeEntries callback can force zip64 on without any production change.
import "./dom-stub.js";
import { createArchive } from "../../processors/compression/compression.js";
import { TextReader, ZipReader, BlobReader } from "../../vendor/zip/zip.js";
import { FIXED_DATE, blobBytes } from "./common.js";

const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const EOCD_SIGNATURE = 0x06054b50;

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /X (zip64) >>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const pageData = { doctype: "<!DOCTYPE html>", content: "<html><body>zip64</body></html>", title: "zip64" };
const archiveOptions = { url: "https://example.com/", selfExtractingArchive: true, embeddedPdf: PDF };

const blob = await createArchive(pageData, archiveOptions, "/* zip script stub */", async zipWriter => {
	zipWriter.options.zip64 = true;
	await zipWriter.add("index.html", new TextReader("<html><body>zip64</body></html>"));
	await zipWriter.add("manifest.json", new TextReader("{}"));
}, FIXED_DATE);
const bytes = await blobBytes(blob);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// locate the three records from the end, the way a reader does
let eocd = -1;
for (let index = bytes.length - 22; index >= 0 && eocd == -1; index--) {
	if (view.getUint32(index, true) == EOCD_SIGNATURE) {
		eocd = index;
	}
}
check("the archive ends with an EOCD record", eocd != -1, true);
const locator = eocd - 20;
check("a zip64 locator precedes the EOCD", view.getUint32(locator, true), ZIP64_LOCATOR_SIGNATURE);
const zip64 = Number(view.getBigUint64(locator + 8, true));
check("the locator points at the zip64 record", view.getUint32(zip64, true), ZIP64_EOCD_SIGNATURE);

// §5.7: the EOCD's saturated fields stay at their sentinels, and the writer saturates all of
// them once zip64 is emitted rather than only the one that overflowed
check("the EOCD entry count is a sentinel", view.getUint16(eocd + 8, true), 0xFFFF);
check("the EOCD total count is a sentinel", view.getUint16(eocd + 10, true), 0xFFFF);
check("the EOCD directory size is a sentinel", view.getUint32(eocd + 12, true), 0xFFFFFFFF);
check("the EOCD directory offset is a sentinel", view.getUint32(eocd + 16, true), 0xFFFFFFFF);

// the injection's accounting lands in the zip64 record: three entries, not the writer's two
check("the zip64 record counts the injected record on this disk", Number(view.getBigUint64(zip64 + 24, true)), 3);
check("the zip64 record counts it in the total", Number(view.getBigUint64(zip64 + 32, true)), 3);

// the directory begins at the injected record, which sits ahead of the writer's own directory
const directoryOffset = Number(view.getBigUint64(zip64 + 48, true));
const directorySize = Number(view.getBigUint64(zip64 + 40, true));
check("the zip64 directory offset points at the injected record",
	view.getUint32(directoryOffset, true), 0x02014b50);
check("the first record in the directory is page.pdf",
	new TextDecoder().decode(bytes.subarray(directoryOffset + 46, directoryOffset + 54)), "page.pdf");
check("the directory size covers every record", directoryOffset + directorySize, zip64);

// and the result is still an archive every reader can read
const reader = new ZipReader(new BlobReader(new Blob([bytes])));
const entries = await reader.getEntries();
await reader.close();
check("a reader lists all three entries", entries.map(entry => entry.filename).join(","), "page.pdf,index.html,manifest.json");

Deno.exit(failed ? 1 : 0);
