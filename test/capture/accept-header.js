import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const IMAGE_ACCEPT = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
const ACCEPT_HEADERS = {
	font: "application/font-woff2;q=1.0,application/font-woff;q=0.9,*/*;q=0.8",
	image: IMAGE_ACCEPT,
	stylesheet: "text/css,*/*;q=0.1",
	script: "*/*",
	document: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	video: "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5",
	audio: "audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5"
};

let failed = false;

// The Accept header of a request is looked up by its expected type in `acceptHeaders`, which the
// extensions fill with seven keys. A resource fetched with no expected type, a PDF in an <object> or
// an <embed>, a <track>, used to look up acceptHeaders[null], and fetch turns the undefined it got into
// the literal header "Accept: undefined". It now falls back to "*/*", what a browser sends for a
// request it knows nothing about.
{
	const accepts = {};
	const record = name => ({ onRequest: fetchOptions => accepts[name] = fetchOptions.headers.accept });
	const page = html("<object data=\"doc.pdf\" type=\"application/pdf\"></object><video src=\"clip.mp4\"><track src=\"captions.vtt\"></video><img src=\"image.png\">");
	await capture({
		[PAGE_URL]: { body: page },
		"https://example.com/doc.pdf": { body: "PDF", contentType: "application/pdf", ...record("pdf") },
		"https://example.com/captions.vtt": { body: "WEBVTT", contentType: "text/vtt", ...record("track") },
		"https://example.com/image.png": { body: "PNG", contentType: "image/png", ...record("image") }
	}, { url: PAGE_URL, content: page, acceptHeaders: ACCEPT_HEADERS });
	check("a PDF object is requested with */*", accepts.pdf, "*/*");
	check("a track is requested with */*", accepts.track, "*/*");
	check("an image keeps the header of its type", accepts.image, IMAGE_ACCEPT);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
