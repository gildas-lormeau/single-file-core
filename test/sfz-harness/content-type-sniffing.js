// `core/util.js` used to trust any Content-Type the server sent and sniff the bytes only when the
// header was missing or `application/octet-stream`. science.org serves its woff2 files as
// `text/plain;charset=UTF-8` — 12 of them — and every one was embedded as `data:text/plain`, which
// costs twice: a browser with no `format()` hint in the `@font-face` rule has nothing left to
// identify the font by, and the SFZ writer deflates a file that is already Brotli-compressed
// because it decides compression from the content type.
//
// The rule now: a magic-byte match wins over the header, and the header is kept only when nothing
// matches. That raises the bar for the sniffer's own rules, which is why `video/mp2t` no longer
// matches on a single `0x47` byte — as a last resort behind a missing header that was tolerable,
// as an override of a correct header it would relabel any video whose first byte is `G`. It now
// wants the sync byte at the 188-byte packet stride, and the case below is the regression guard.
/* global Response */

import "./dom-stub.js";
// util.js pulls in the page-world hooks, which register a document listener as they are evaluated.
// None of it is exercised here; the stubs exist so that importing util.js is possible at all
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || {};
globalThis.Document = globalThis.Document || class { };
globalThis.MutationObserver = globalThis.MutationObserver || class {
	observe() { }
};
const { getInstance } = await import("./../../core/util.js");

const FONT_URL = "https://example.com/font";
const WOFF2 = bytes([0x77, 0x4F, 0x46, 0x32], 64);
const PNG = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 64);
const AVIF = bytes([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], 64);
const WEBP2 = bytes([0x77, 0x70, 0x32, 0x20], 64);
const HEIF_MIF1 = bytes([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x6D, 0x69, 0x66, 0x31], 64);
const NOT_A_TRANSPORT_STREAM = bytes([0x47, 0x53, 0x54, 0x00], 512);

let failed = false;

// [label, bytes, expectedType, the Content-Type the server sent, the type that must reach the data URI]
const CASES = [
	["a woff2 served as text/plain is embedded as font/woff2", WOFF2, "font", "text/plain;charset=UTF-8", "font/woff2"],
	["a woff2 served as font/woff2 is unchanged", WOFF2, "font", "font/woff2", "font/woff2"],
	["a woff2 served with no type at all is embedded as font/woff2", WOFF2, "font", undefined, "font/woff2"],
	["a png served as text/plain is embedded as image/png", PNG, "image", "text/plain", "image/png"],
	["an avif served as application/octet-stream is embedded as image/avif", AVIF, "image", "application/octet-stream", "image/avif"],
	// "mif1" is the generic HEIF brand and an AVIF may carry it too, so it identifies nothing on
	// its own: claiming HEIC here would relabel an AVIF as a format no browser decodes
	["an ambiguous HEIF brand keeps the type the server sent", HEIF_MIF1, "image", "image/avif", "image/avif"],
	// nothing matches these bytes, so the header is all there is and it has to survive
	["a format the sniffer does not know keeps the type the server sent", WEBP2, "image", "image/webp2", "image/webp2"],
	["a format the sniffer does not know and no type falls back to octet-stream", WEBP2, "image", undefined, "application/octet-stream"],
	// the byte is 0x47, the packet stride is not, so this is not a transport stream
	["a video starting with G is not relabelled as mp2t", NOT_A_TRANSPORT_STREAM, "video", "video/quicktime", "video/quicktime"]
];

for (const [label, data, expectedType, sentContentType, expectedContentType] of CASES) {
	const { data: dataURI } = await fetchContent(data, expectedType, sentContentType);
	check(label, readDataURIType(dataURI), expectedContentType);
}

console.log(failed ? "\nsome checks FAILED" : "\nall checks passed");
Deno.exit(failed ? 1 : 0);

function fetchContent(data, expectedType, contentType) {
	const util = getInstance({
		fetch: async () => new Response(data, { headers: contentType ? { "content-type": contentType } : {} })
	});
	return util.getContent(FONT_URL, { asBinary: true, inline: true, expectedType });
}

function readDataURIType(dataURI) {
	const indexSeparator = dataURI.indexOf(";");
	return dataURI.substring("data:".length, indexSeparator == -1 ? dataURI.indexOf(",") : indexSeparator);
}

function bytes(signature, length) {
	const value = new Uint8Array(length);
	value.set(signature);
	return value;
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
