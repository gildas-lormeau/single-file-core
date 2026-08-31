// Whether an entry is deflated or stored was decided by its extension alone, and the extension is
// only a guess: core/index.js takes it from the content type when the type is in its map and from
// the URL otherwise. CONTENT_TYPE_EXTENSIONS has no entry for text/javascript, so a module served
// as text/javascript from a ".ts" URL — every Vite dev server — was named ".ts", matched
// NO_COMPRESSION_EXTENSIONS, and went into the archive uncompressed: measured on a real capture at
// 2260 bytes where the same bytes named ".js" deflate to 70.
//
// The rule is now: a textual content type is authoritative when the server sent one, and the
// extension list decides everything else. The second half is what the octet-stream rows pin — the
// sniffer in core/util.js only covers image, font, video and audio, so an image format it cannot
// recognize keeps application/octet-stream, and deflating it must stay off the table.

import "./dom-stub.js";
const { process } = await import("./../../processors/compression/compression.js");
const { ZipReader, BlobReader } = await import("./../../vendor/zip/zip.js");

const TEXT = "console.log(\"probe\");\n".repeat(100);
const BINARY = "\x89PNG\r\n\x1a\n" + "\x00\x01\x02\x03".repeat(100);

// [label, extension, contentType, expected compression]
const CASES = [
	["script named .ts, served as text/javascript", ".ts", "text/javascript", "deflate"],
	["script named .js, served as text/javascript", ".js", "text/javascript", "deflate"],
	["script named .ts, served as application/javascript", ".ts", "application/javascript", "deflate"],
	["script named .php, no content type", ".php", undefined, "deflate"],
	["image named .png, served as image/png", ".png", "image/png", "stored"],
	["image named .png, no content type", ".png", undefined, "stored"],
	["image named .avif, sniffing failed", ".avif", "application/octet-stream", "stored"],
	["font named .woff2, served as font/woff2", ".woff2", "font/woff2", "stored"],
	["image named .svg, served as image/svg+xml", ".svg", "image/svg+xml", "deflate"]
];

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

async function getEntries(resource, options = {}) {
	const pageData = {
		title: "fixture",
		doctype: "<!DOCTYPE html>",
		content: "<html><body><p>fixture</p></body></html>",
		resources: { stylesheets: [], images: [resource] }
	};
	const blob = await process(pageData, {
		selfExtractingArchive: false,
		extractDataFromPage: false,
		url: "https://example.com/",
		...options
	}, new Date(1755129600000));
	const reader = new ZipReader(new BlobReader(blob), { useWebWorkers: false });
	const entries = await reader.getEntries();
	await reader.close();
	return entries;
}

for (const [label, extension, contentType, expected] of CASES) {
	const content = expected == "deflate" ? TEXT : BINARY;
	const [entry] = (await getEntries({ name: "resource" + extension, extension, contentType, content }))
		.filter(({ filename }) => filename.startsWith("resource"));
	check(label, entry.compressionMethod === 0 ? "stored" : "deflate", expected);
}

// disableCompression still overrides everything, content type included
const [storedEntry] = (await getEntries({ name: "resource.js", extension: ".js", contentType: "text/javascript", content: TEXT }, { disableCompression: true }))
	.filter(({ filename }) => filename.startsWith("resource"));
check("disableCompression stores a text/javascript entry", storedEntry.compressionMethod === 0 ? "stored" : "deflate", "stored");

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
} else {
	console.log("PASSED");
}
