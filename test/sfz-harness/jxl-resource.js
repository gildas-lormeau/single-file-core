// The sniffer in core/util.js has recognized JPEG XL for a while, both the ISOBMFF container and
// the bare codestream, but nothing downstream knew the type: CONTENT_TYPE_EXTENSIONS had no entry
// for image/jxl, so a JXL served from a URL without an extension — every image CDN — was written
// into the archive with no extension at all, and the extractor's own table had no `jxl` either, so
// a `.jxl` entry came back to the page as an `application/octet-stream` blob. Both tables now name
// the format; this pins the entry name and the type the extractor hands back.
/* global Response */

import "./dom-stub.js";
import * as zip from "../../vendor/zip/zip.js";
globalThis.zip = zip;
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || {};
globalThis.Document = globalThis.Document || class { };
globalThis.MutationObserver = globalThis.MutationObserver || class {
	observe() { }
};
const { getInstance } = await import("../../core/util.js");
const { process } = await import("../../processors/compression/compression.js");
const { extract } = await import("../../processors/compression/compression-extract.js");

const CODESTREAM = new Uint8Array([0xFF, 0x0A, 0x30, 0x30, 0x30, 0x30]);
const CONTAINER = new Uint8Array([0, 0, 0, 0x0C, 0x4A, 0x58, 0x4C, 0x20, 0x0D, 0x0A, 0x87, 0x0A, 0, 0, 0, 0]);

let failed = false;

const util = getInstance({
	fetch: async () => new Response(CONTAINER, { headers: { "content-type": "application/octet-stream" } })
});
const { contentType } = await util.getContent("https://cdn.example.com/image?id=42", { asBinary: true, inline: true, expectedType: "image" });
check("a JXL container served as octet-stream is sniffed as image/jxl", contentType, "image/jxl");
check("image/jxl maps to the .jxl extension", util.getContentTypeExtension("image/jxl"), ".jxl");
check("a bare JXL codestream is sniffed as image/jxl", (await getInstance({
	fetch: async () => new Response(CODESTREAM, { headers: { "content-type": "image/jpeg" } })
}).getContent("https://cdn.example.com/image", { asBinary: true, inline: true, expectedType: "image" })).contentType, "image/jxl");

const pageBlob = await process({
	title: "fixture",
	doctype: "<!DOCTYPE html>",
	content: "<html><body><img src=\"images/1.jxl\"></body></html>",
	resources: { stylesheets: [], images: [{ name: "images/1.jxl", extension: ".jxl", contentType: "image/jxl", content: String.fromCharCode(...CONTAINER) }] }
}, { selfExtractingArchive: false, extractDataFromPage: false, url: "https://example.com/" }, new Date(1755129600000));
const reader = new zip.ZipReader(new zip.BlobReader(pageBlob), { useWebWorkers: false });
const entries = await reader.getEntries();
await reader.close();
check("the archive holds the image as a .jxl entry", entries.some(entry => entry.filename == "images/1.jxl"), true);
const { docContent } = await extract(pageBlob, { noBlobURL: true, zipOptions: { useWebWorkers: false } });
check("the extractor hands the entry back as image/jxl", /<img src="data:image\/jxl;base64,/.test(docContent), true);

console.log(failed ? "\nsome checks FAILED" : "\nall checks passed");
Deno.exit(failed ? 1 : 0);

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
