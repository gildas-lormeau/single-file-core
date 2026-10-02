// §4.5's locate step, run against pages the writer produced, with the bootstrap those pages carry.
// The bootstrap is lifted out of the page text and evaluated here with the globals it binds from
// globalThis: a happy-dom document parsed from the page, happy-dom's NodeFilter, the vendor
// inflater, and an XMLHttpRequest whose every request fails, which is how a file: load reaches
// page-text extraction (§4.1). What comes back is the recovered ZIP region as a Blob, preceded by
// as many zero bytes as the file holds before the region, so every offset the central directory
// stores points where it does in the file. It is compared byte for byte with the file from the
// first local header the region holds, or the error the extractor threw is.
//
// Six layouts: the comment rung alone, an element rung alone, and each with a second candidate
// appended -- a duplicate of the same kind, which §7.4 says MUST be refused, a candidate of the
// other kind, which the tie-break settles in favour of the element, and an element bearing the
// identifier that is not a wrapper rung, which is never a candidate.
//
// Then the PDF face, whose hand-built page.pdf record comes first in the central directory and
// whose local header lies outside the region. zip.js 2.22.0 decides on that first record whether
// to shift the offsets of a region read without its prefix, so it shifted nothing and every entry
// failed with "Local file header not found". The padding makes the shift unnecessary: the entries
// are read back with the vendor reader.
//
// Last, the padding computation alone, on synthetic regions: it confirms the central directory
// signature (or the zip64 record signature, expected 56 bytes before the locator) where the shift
// puts it, and pads nothing when it is absent, which leaves the shift to the ZIP library as before.
//
// One shim: a browser's input stream preprocessing turns CR LF and lone CR into LF before the
// tokenizer sees them, which is what the payload's newline codes describe (§5.5), and happy-dom's
// parser does not, so the text is normalized here before it is parsed.
/* global clearTimeout */
import "./dom-stub.js";
import { Window } from "npm:happy-dom@20.14.5";
import { inflateRaw, ZipReader, BlobReader, TextWriter } from "../../vendor/zip/zip.js";
import { makePageData, makeOptions, runProcess, sameBytes } from "./common.js";

const COMPRESSION_SOURCE = await Deno.readTextFile(new URL("../../processors/compression/compression.js", import.meta.url));

const window = new Window();
const DECODER = new TextDecoder("windows-1252");
const LOCAL_HEADER = "PK\x03\x04";
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

class FailingXMLHttpRequest {
	open() { }
	send() {
		setTimeout(() => this.onerror());
	}
	abort() { }
}

function bootstrapOf(text) {
	const start = text.indexOf("async function getContent()");
	const end = text.indexOf(")().then(globalThis.bootstrap)", start);
	return new Function("return " + text.slice(start, end))();
}

async function locate(text) {
	const document = new window.DOMParser().parseFromString(text.replace(/\r\n?/g, "\n"), "text/html");
	Object.assign(globalThis, { document, NodeFilter: window.NodeFilter, zip: { inflateRaw }, XMLHttpRequest: FailingXMLHttpRequest });
	const { error: consoleError } = console;
	console.error = () => { };
	let timer;
	try {
		const blob = await Promise.race([
			bootstrapOf(text)(),
			new Promise((_, reject) => timer = setTimeout(() => reject(new Error("the bootstrap never settled")), 5000))
		]);
		return { blob, bytes: new Uint8Array(await blob.arrayBuffer()) };
	} catch (error) {
		return { error: error.message };
	} finally {
		clearTimeout(timer);
		console.error = consoleError;
	}
}

function isFilesBytes(recovered, bytes) {
	const start = recovered.findIndex(byte => byte != 0);
	return start > 0 && recovered.length <= bytes.length &&
		DECODER.decode(recovered.subarray(start, start + 4)) == LOCAL_HEADER &&
		sameBytes(recovered.subarray(start), bytes.subarray(start, recovered.length));
}

// a stored resource carrying --> pushes the ZIP region off the comment rung and onto the script
// element rung, the first element rung of the ladder
function triggerResource(literal) {
	const content = new Uint8Array(2048).fill(0x21);
	content.set(new TextEncoder().encode(literal), 128);
	return { name: "images/trigger.png", extension: ".png", content, url: "https://example.com/trigger.png" };
}

async function page(seed, resources = [], overrides) {
	const pageData = makePageData(seed, 4 * 1024);
	pageData.resources.images = resources;
	const { bytes } = await runProcess(pageData, makeOptions(overrides));
	const text = DECODER.decode(bytes);
	return { bytes, text };
}

const comment = await page(40);
const element = await page(41, [triggerResource("-->")]);
check("the comment page wraps the region in a comment", comment.text.includes("<!--sfz-data"), true);
check("the element page wraps the region in the script rung", element.text.includes("<script type=sfz-data id=sfz-data>"), true);

for (const [label, { bytes, text }, appended, expected] of [
	["comment rung", comment, "", "region"],
	["comment rung, a second comment appended", comment, "<!--sfz-data-->", "refused"],
	["comment rung, a non-rung element with the identifier appended", comment, "<div id=sfz-data></div>", "region"],
	["element rung", element, "", "region"],
	["element rung, a comment appended: the element wins", element, "<!--sfz-data-->", "region"],
	["element rung, a second rung element appended", element, "<script type=sfz-data id=sfz-data></script>", "refused"]
]) {
	const result = await locate(text + appended);
	if (expected == "region") {
		check(`${label}: extracts`, result.error, undefined);
		check(`${label}: the recovered region is the file's, at its offset`, Boolean(result.bytes) && isFilesBytes(result.bytes, bytes), true);
	} else {
		check(`${label}: is refused`, result.error, "Multiple zip data candidates found");
	}
}

const pdf = await page(43, [], { embeddedPdf: PDF });
const pdfResult = await locate(pdf.text);
check("pdf face: extracts", pdfResult.error, undefined);
check("pdf face: the recovered region is the file's, at its offset", Boolean(pdfResult.bytes) && isFilesBytes(pdfResult.bytes, pdf.bytes), true);
if (pdfResult.blob) {
	const zipReader = new ZipReader(new BlobReader(pdfResult.blob));
	const entries = (await zipReader.getEntries()).filter(entry => entry.filename != "page.pdf");
	const indexEntry = entries.find(entry => entry.filename == "index.html");
	check("pdf face: index.html is listed", Boolean(indexEntry), true);
	let readError;
	try {
		await Promise.all(entries.map(entry => entry.getData(new TextWriter())));
	} catch (error) {
		readError = error.message;
	}
	check("pdf face: every entry but page.pdf reads back", readError, undefined);
	await zipReader.close();
}

const getPrependedDataLength = helperOf(COMPRESSION_SOURCE, "getPrependedDataLength");
const SHIFT = 1000;
check("padding: a region whose stored offset overshoots by the shift", getPrependedDataLength(region()), SHIFT);
check("padding: a region read from its file start", getPrependedDataLength(region({ shift: 0 })), 0);
check("padding: no central directory signature where the shift puts it", getPrependedDataLength(region({ directorySignature: 0 })), 0);
check("padding: no end of central directory record", getPrependedDataLength(region().subarray(0, 60)), 0);
check("padding: a zip64 region", getPrependedDataLength(zip64Region()), SHIFT);
check("padding: a zip64 record with an extensible data sector", getPrependedDataLength(zip64Region({ extensibleDataLength: 4 })), 0);

function helperOf(source, name) {
	const start = source.indexOf("\tfunction " + name + "(");
	const end = source.indexOf("\n\t}\n", start) + 3;
	return new Function("return " + source.slice(start, end))();
}

function region({ shift = SHIFT, directorySignature = 0x02014b50 } = {}) {
	const directoryOffset = 10, directoryLength = 46;
	const bytes = new Uint8Array(directoryOffset + directoryLength + 22);
	const view = new DataView(bytes.buffer);
	view.setUint32(directoryOffset, directorySignature, true);
	const endOfDirectoryOffset = directoryOffset + directoryLength;
	view.setUint32(endOfDirectoryOffset, 0x06054b50, true);
	view.setUint32(endOfDirectoryOffset + 12, directoryLength, true);
	view.setUint32(endOfDirectoryOffset + 16, directoryOffset + shift, true);
	return bytes;
}

function zip64Region({ extensibleDataLength = 0 } = {}) {
	const recordOffset = 10, recordLength = 56 + extensibleDataLength;
	const locatorOffset = recordOffset + recordLength;
	const bytes = new Uint8Array(locatorOffset + 20 + 22);
	const view = new DataView(bytes.buffer);
	view.setUint32(recordOffset, 0x06064b50, true);
	view.setBigUint64(recordOffset + 4, BigInt(recordLength - 12), true);
	view.setUint32(locatorOffset, 0x07064b50, true);
	view.setBigUint64(locatorOffset + 8, BigInt(recordOffset + SHIFT), true);
	const endOfDirectoryOffset = locatorOffset + 20;
	view.setUint32(endOfDirectoryOffset, 0x06054b50, true);
	view.setUint32(endOfDirectoryOffset + 12, 0xFFFFFFFF, true);
	view.setUint32(endOfDirectoryOffset + 16, 0xFFFFFFFF, true);
	return bytes;
}

Deno.exit(failed ? 1 : 0);
