// A page archive unpacked and packed again with a standard ZIP tool, or a MAFF file, holds
// directory entries ("frames/", "frames/0/"), which SingleFile itself never writes. The extractor
// took them for resources: seen from the page of a frame, the entry of the folder of that frame has
// an empty relative name, and replacing the empty string in the frame inserted the URL of the entry
// between every character, twice over. A frame of 268 characters came back with 511,099, and a real
// one exhausted the memory (#2062). Directory entries are now skipped: the frame must come back
// with its text, and the page must be the same with and without them.

import "./dom-stub.js";
import * as zip from "../../vendor/zip/zip.js";
globalThis.zip = zip;
const { extract } = await import("../../processors/compression/compression-extract.js");

const FRAME_TEXT = "frame text ".repeat(20);
const FRAME = "<!DOCTYPE html><html><body><p>" + FRAME_TEXT + "</p><img src=images/1.png></body></html>";
const INDEX = "<!DOCTYPE html><html><body><iframe src=frames/0/index.html></iframe></body></html>";
const IMAGE = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);

let failed = false;

const plain = await extractPage(false);
const repacked = await extractPage(true);
check("without directory entries the frame keeps its text", plain.frameText.includes(FRAME_TEXT), true);
check("with directory entries the frame keeps its text", repacked.frameText.includes(FRAME_TEXT), true);
check("with directory entries the frame is not larger", repacked.frameText.length, plain.frameText.length);
check("with directory entries the page is not larger", repacked.docContent.length, plain.docContent.length);
check("the image of the frame is still inlined", /<img src=data:image\/png;base64,/.test(repacked.frameText), true);
check("no directory entry is handed back as a resource", repacked.resources.some(resource => resource.filename.endsWith("/")), false);

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function extractPage(withDirectories) {
	const writer = new zip.ZipWriter(new zip.BlobWriter("application/zip"), { useWebWorkers: false });
	await writer.add("index.html", new zip.TextReader(INDEX));
	if (withDirectories) {
		await writer.add("frames/", undefined, { directory: true });
		await writer.add("frames/0/", undefined, { directory: true });
		await writer.add("frames/0/images/", undefined, { directory: true });
	}
	await writer.add("frames/0/index.html", new zip.TextReader(FRAME));
	await writer.add("frames/0/images/1.png", new zip.Uint8ArrayReader(IMAGE));
	const { docContent, resources } = await extract(await writer.close(), { noBlobURL: true, zipOptions: { useWebWorkers: false } });
	return { docContent, resources, frameText: resources.find(resource => resource.filename == "frames/0/index.html").textContent };
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
