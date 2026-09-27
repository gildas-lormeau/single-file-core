import "./dom.js";

// imageReductionFactor must not resize the image of a `background` attribute (body, table, cells).
// The browser tiles it at its natural size with background-size auto, so a smaller image draws the
// whole pattern smaller. Measured with the CLI at factor 2 on a 200x200 tile, identically in
// Chromium, Firefox and WebKit: the saved tile was 100x100 on body, table and td. Such tiles are
// usually tiny, so leaving them out costs next to nothing. An <img> and an <input type=image> are
// still resized, like before.
//
// resizeImage needs Image and OffscreenCanvas, which Deno has not: the stubs below answer with a
// fixed natural size and encode every image as the bytes "resized", so a resized image is told
// apart from the fetched one by its content.
globalThis.Image = class Image {
	set src(value) {
		this.naturalWidth = 200;
		this.naturalHeight = 200;
		Promise.resolve().then(() => this.onload());
	}
};

globalThis.OffscreenCanvas = class OffscreenCanvas {
	getContext() {
		return { drawImage() { } };
	}
	convertToBlob(options) {
		return Promise.resolve(new globalThis.Blob(["resized"], { type: options.type }));
	}
};

const { capture, captureArchive, html } = await import("./common.js");

const PAGE_URL = "https://example.com/page.html";
const RESIZED = "data:image/png;base64," + btoa("resized");
const TILE = "data:image/png;base64," + btoa("TILE");
const CELL = "data:image/png;base64," + btoa("CELL");

let failed = false;

const page = html("<table id=t background=\"tile.png\"><tr><td id=c background=\"cell.png\">x</td></tr></table><img id=i src=\"image.png\"><input id=n type=image src=\"input.png\">");
const resources = {
	[PAGE_URL]: { body: page },
	"https://example.com/tile.png": { body: "TILE", contentType: "image/png" },
	"https://example.com/cell.png": { body: "CELL", contentType: "image/png" },
	"https://example.com/image.png": { body: "IMAGE", contentType: "image/png" },
	"https://example.com/input.png": { body: "INPUT", contentType: "image/png" }
};

{
	const content = await capture(resources, { url: PAGE_URL, content: page, imageReductionFactor: 2 });
	check("a table background keeps its image", attribute(content, "t", "background"), TILE);
	check("a cell background keeps its image", attribute(content, "c", "background"), CELL);
	check("control: an img is resized", attribute(content, "i", "src"), RESIZED);
	check("control: an input image is resized", attribute(content, "n", "src"), RESIZED);
}

{
	const { resources: archiveResources } = await captureArchive(resources, { url: PAGE_URL, content: page, imageReductionFactor: 2 });
	const contents = [...new Set(archiveResources.images.map(image => new TextDecoder().decode(image.content)))].sort();
	check("archive: the background images keep their bytes, the others are resized", contents.join(","), "CELL,TILE,resized");
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function attribute(content, id, name) {
	const match = content.match(new RegExp("<[a-z]+ [^>]*id=\"?" + id + "\"?[^>]*>"));
	const valueMatch = match && match[0].match(new RegExp(" " + name + "=\"?([^\" >]*)"));
	return valueMatch && valueMatch[1];
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
