// A browser renders an <img>, a CSS background and a frame document from the body of a response
// whatever its status: measured in Chrome, every 4xx and 5xx code with a body is decoded, and only
// 304 (no body) shows nothing. Google's favicon service relies on it, answering 404 with a generic
// globe PNG for any site without a favicon, so every AI Mode capture lost those badges: core treated
// a status of 400 or more as a failed fetch and wrote an empty data: URL where the live page showed
// the globe. Stylesheets, scripts, fonts and media are rejected by the browser on anything but 2xx,
// so for those the status check stays, and the live page is still the oracle.
//
// Frames outside raw mode are serialized from the live DOM and never carry a status; the document
// case here is the raw-page fetch, the one path where core fetches a frame itself.
import { capture, captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const HOST_URL = "https://example.com/host.html";
const FRAME_URL = "https://example.com/frame.html";
const IMAGE_URL = "https://cdn.example.net/favicon.png";
const FONT_URL = "https://cdn.example.net/font.woff2";
const SHEET_URL = "https://cdn.example.net/sheet.css";
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 0x49, 0x48, 0x44, 0x52]);
const WOFF2_BYTES = new Uint8Array([0x77, 0x4F, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const FRAME_MARKER = "frame-body-marker";

let failed = false;

// The case this exists for: a 404 image with an image body is kept, like the browser keeps it.
{
	const { resources } = await captureImage({ body: PNG_BYTES, contentType: "image/png", status: 404 });
	check("a 404 image with an image body is stored", stored(resources.images), 1);
}
{
	const { resources } = await captureImage({ body: PNG_BYTES, contentType: "image/png", status: 503 });
	check("a 503 image with an image body is stored", stored(resources.images), 1);
}
{
	const content = await captureInlineImage({ body: PNG_BYTES, contentType: "image/png", status: 404 });
	check("inline: the 404 image is embedded as a data URL", content.includes("data:image/png;base64,"), true);
}

// The raw-page frame: core fetches the frame document, and a 404 frame page is still a page.
{
	const content = await captureRawHost({ body: html(FRAME_MARKER), status: 404 });
	check("a 404 frame document is kept in raw mode", content.includes(FRAME_MARKER), true);
}

// Controls: the guard still drops what the browser would not use.
{
	const { resources } = await captureImage({ body: "<html>not found</html>", contentType: "text/html", status: 404 });
	check("a 404 image with an HTML body is still dropped", stored(resources.images), 0);
}
{
	const { resources } = await captureImage({ body: PNG_BYTES, contentType: "image/png", status: 200 });
	check("control: a 200 image is stored", stored(resources.images), 1);
}
{
	const { resources } = await captureFont({ body: WOFF2_BYTES, contentType: "font/woff2", status: 404 });
	check("a 404 font is still dropped", stored(resources.fonts), 0);
}
{
	const { resources } = await captureFont({ body: WOFF2_BYTES, contentType: "font/woff2", status: 200 });
	check("control: a 200 font is stored", stored(resources.fonts), 1);
}
{
	const content = await captureSheet({ body: ".x{--m:error-sheet}", contentType: "text/css", status: 404 });
	check("a 404 stylesheet is still dropped", content.includes("error-sheet"), false);
}
{
	const content = await captureSheet({ body: ".x{--m:ok-sheet}", contentType: "text/css", status: 200 });
	check("control: a 200 stylesheet is used", content.includes("ok-sheet"), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}

function captureImage(image) {
	const page = html("<img src=\"" + IMAGE_URL + "\">");
	return captureArchive({ [PAGE_URL]: { body: page }, [IMAGE_URL]: image }, { url: PAGE_URL, content: page });
}

function captureInlineImage(image) {
	const page = html("<img src=\"" + IMAGE_URL + "\">");
	return capture({ [PAGE_URL]: { body: page }, [IMAGE_URL]: image }, { url: PAGE_URL, content: page });
}

function captureFont(font) {
	const page = html("<p style=\"font-family:F\">x</p>", "<style>@font-face{font-family:F;src:url(" + FONT_URL + ")}</style>");
	return captureArchive({ [PAGE_URL]: { body: page }, [FONT_URL]: font }, { url: PAGE_URL, content: page, removeUnusedFonts: false });
}

function captureSheet(sheet) {
	const page = html("<p class=\"x\">x</p>", "<link rel=\"stylesheet\" href=\"" + SHEET_URL + "\">");
	return capture({ [PAGE_URL]: { body: page }, [SHEET_URL]: sheet }, { url: PAGE_URL, content: page });
}

function captureRawHost(frame) {
	const host = html("<iframe src=\"" + FRAME_URL + "\"></iframe>");
	return capture({ [HOST_URL]: { body: host }, [FRAME_URL]: frame }, { url: HOST_URL, saveRawPage: true });
}

// A failed fetch can still leave a named entry with no content, so the count that matters is the
// number of entries carrying bytes.
function stored(entries) {
	return entries.filter(entry => entry.content && entry.content.length).length;
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
