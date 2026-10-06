/* global TextEncoder, crypto */

import "./dom.js";

// The manifest option makes core record what it observed while capturing: one entry per resource
// the batch fetched, with the bytes hashed as they arrived, the final URL, the status, a few
// response headers and why the bytes are or are not in the page; one entry per document, top and
// frames, with what the live document told preProcessDoc about its load; and the capture options
// that shape the output. It exists so that a host (the CLI, an extension) can join it with what the
// network layer saw and write a verifiable sidecar, and so the hashes are computed by the same
// code that embeds the bytes.
import { capturePageData, frameData, html, WIN_ID_ATTRIBUTE_NAME } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const STYLESHEET_URL = "https://example.com/style.css";
const IMAGE_URL = "https://cdn.example.net/picture.png";
const MISSING_URL = "https://example.com/missing.png";
const MISSING_SCRIPT_URL = "https://example.com/missing.js";
const FRAME_URL = "https://example.com/frame.html";
const FRAME_SCRIPT_URL = "https://example.com/frame.js";
const STYLESHEET = "body{color:red}";
const IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const FRAME_SCRIPT = "console.log(1)";
const DATE_HEADER = "Tue, 06 Oct 2026 13:55:03 GMT";
const PAGE = html(
	"<link rel=\"stylesheet\" href=\"" + STYLESHEET_URL + "\">" +
	"<img src=\"" + IMAGE_URL + "\"><img src=\"" + IMAGE_URL + "\"><img src=\"" + MISSING_URL + "\">" +
	"<script src=\"" + MISSING_SCRIPT_URL + "\"></script>" +
	"<iframe src=\"" + FRAME_URL + "\" " + WIN_ID_ATTRIBUTE_NAME + "=\"0.1\"></iframe>");
const FRAME_PAGE = html("<script src=\"" + FRAME_SCRIPT_URL + "\"></script>");
const RESOURCES = {
	[PAGE_URL]: { body: PAGE },
	[STYLESHEET_URL]: { body: STYLESHEET, contentType: "text/css", headers: { date: DATE_HEADER, etag: "\"abc\"" } },
	[IMAGE_URL]: { body: IMAGE, contentType: "image/png" },
	[FRAME_SCRIPT_URL]: { body: FRAME_SCRIPT, contentType: "text/javascript" }
};

let failed = false;

{
	const pageData = await capturePageData(RESOURCES, {
		url: PAGE_URL,
		content: PAGE,
		frames: [frameData("0.1", FRAME_URL, FRAME_PAGE)],
		blockScripts: false,
		removeUnusedStyles: false,
		customStylesheet: "p{margin:0}",
		manifest: true
	});
	const manifest = pageData.manifest;
	check("the manifest is returned next to the page", Boolean(manifest), true);
	check("subject: the URL given", manifest.subject.url, PAGE_URL);
	check("time: capture start and end are ISO dates", [manifest.time.captureStarted, manifest.time.captureEnded].every(isIsoDate), true);
	check("options: booleans are recorded", manifest.options.blockScripts, false);
	check("options: the custom stylesheet is recorded", manifest.options.customStylesheet, "p{margin:0}");
	check("options: the option itself is not", "manifest" in manifest.options, false);
	check("options: no non-primitive leaks", Object.values(manifest.options).every(value => ["boolean", "number", "string"].includes(typeof value)), true);
	check("frames: the top document first, then the frame", manifest.frames.map(frame => frame.id), ["0", "0.1"]);
	check("frames: the frame names its parent", manifest.frames[1].parent, "0");
	check("frames: the top document has none", manifest.frames[0].parent, null);
	check("frames: each carries its URL", manifest.frames.map(frame => frame.url), [PAGE_URL, FRAME_URL]);
	const resources = manifest.frames[0].resources;
	const stylesheet = resources.find(entry => entry.url == STYLESHEET_URL);
	const image = resources.find(entry => entry.url == IMAGE_URL);
	const missing = resources.find(entry => entry.url == MISSING_URL);
	check("a text resource: embedded, hashed as fetched", [stylesheet.outcome, stylesheet.sha256], ["embedded", await sha256(new TextEncoder().encode(STYLESHEET))]);
	check("with its size, status, role and type", [stylesheet.size, stylesheet.status, stylesheet.role, stylesheet.contentType], [STYLESHEET.length, 200, "stylesheet", "text/css"]);
	check("with the headers worth cross-checking", stylesheet.headers, { date: DATE_HEADER, etag: "\"abc\"" });
	check("fetched by the page's own fetch", stylesheet.fetchedBy, "page");
	check("a binary resource: hashed on the bytes, not a data URI", image.sha256, await sha256(IMAGE));
	check("referenced twice, fetched once", [image.references, resources.filter(entry => entry.url == IMAGE_URL).length], [2, 1]);
	// an image is embedded whatever its status, so the page shows what the server showed; the record
	// keeps the status, which is how a reader learns that the picture is an error body
	check("a 404 image: embedded, status kept", [missing.outcome, missing.status, missing.size], ["embedded", 404, 0]);
	const missingScript = resources.find(entry => entry.url == MISSING_SCRIPT_URL);
	check("a 404 script: rejected, status kept", [missingScript.outcome, missingScript.status], ["rejected", 404]);
	const frameScript = manifest.frames[1].resources.find(entry => entry.url == FRAME_SCRIPT_URL);
	check("a frame resource is listed under its frame", [frameScript.outcome, frameScript.role], ["embedded", "script"]);
	check("and not under the top document", resources.some(entry => entry.url == FRAME_SCRIPT_URL), false);
	check("output: the saved file is hashed", [manifest.output.sha256, manifest.output.size], [await sha256(new TextEncoder().encode(pageData.content)), new TextEncoder().encode(pageData.content).length]);
	check("output: with its name and type", [manifest.output.filename, manifest.output.mimeType], [pageData.filename, pageData.mimeType]);
	check("the manifest serializes without loss", JSON.parse(JSON.stringify(manifest)).frames.length, 2);
}

{
	const pageData = await capturePageData(RESOURCES, { url: PAGE_URL, content: PAGE, frames: [frameData("0.1", FRAME_URL, FRAME_PAGE)], blockScripts: false, removeUnusedStyles: false });
	check("control: no manifest without the option", "manifest" in pageData, false);
}

{
	const pageData = await capturePageData(RESOURCES, { url: PAGE_URL, content: PAGE, removeFrames: true, blockScripts: false, removeUnusedStyles: false, compressContent: true, manifest: true });
	const content = new Uint8Array(pageData.content);
	check("an archive: the output hash is of the archive bytes", [pageData.manifest.output.sha256, pageData.manifest.output.size], [await sha256(content), content.length]);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function isIsoDate(value) {
	return typeof value == "string" && !isNaN(new Date(value)) && new Date(value).toISOString() == value;
}

async function sha256(bytes) {
	return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(value => value.toString(16).padStart(2, "0")).join("");
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
