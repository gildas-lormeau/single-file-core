import { capture, captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/dir/page.html";
const BASE = "https://example.com/dir/";
const EMPTY = "data:,";
const INLINE_IMAGE = "data:image/png;base64,QUJD";
const PAGE = html(
	"<style>.rule { background: url(rule.png) } @font-face { font-family: f; src: url(font.woff2) } p { font-family: f }</style>" +
	"<img id=relative src=\"a.png\">" +
	"<img id=absolute src=\"https://cdn.example.org/b.png?v=1#frag\">" +
	"<img id=candidates src=\"c.png\" srcset=\"c.png 1x, c2.png 2x\">" +
	"<picture><source id=source srcset=\"wide.png 800w, https://cdn.example.org/wider.png 1600w\" sizes=\"100vw\"><img id=fallback src=\"narrow.png\"></picture>" +
	"<video id=poster poster=\"poster.png\"></video>" +
	"<table id=background background=\"tile.png\"><tr><td>x</td></tr></table>" +
	"<input id=input type=image src=\"input.png\">" +
	"<svg><image id=svgimage href=\"vector.png\" width=10 height=10></image></svg>" +
	"<div id=attribute style=\"background-image:url(attribute.png)\">x</div>" +
	"<div class=rule>x</div><p>text</p>" +
	"<img id=inline src=\"" + INLINE_IMAGE + "\">" +
	"<img id=local src=\"file:///home/user/secret.png\">" +
	"<object id=object type=\"image/svg+xml\" data=\"object.svg\"></object>");
const LINKED = {
	relative: ["src", BASE + "a.png"],
	absolute: ["src", "https://cdn.example.org/b.png?v=1#frag"],
	candidates: ["srcset", BASE + "c.png 1x, " + BASE + "c2.png 2x"],
	source: ["srcset", BASE + "wide.png 800w, https://cdn.example.org/wider.png 1600w"],
	fallback: ["src", BASE + "narrow.png"],
	poster: ["poster", BASE + "poster.png"],
	background: ["background", BASE + "tile.png"],
	input: ["src", BASE + "input.png"],
	svgimage: ["href", BASE + "vector.png"]
};
const IMAGE_NAMES = ["a.png", "c.png", "c2.png", "wide.png", "narrow.png", "poster.png", "tile.png", "input.png", "vector.png", "attribute.png", "rule.png", "object.svg"];

let failed = false;

// `linkBlockedImages` changes what `blockImages` leaves behind: instead of an empty image, the
// address the image came from, made absolute, so the saved page shows its images from the original
// site and weighs what its markup weighs. Asked for in SingleFile #418, #1217 and #1722, and what
// projects embedding core rebuilt by hand from `blockImages` and `saveOriginalURLs`.
//
// A page saved this way is not self-contained, which is why the option is separate and off: opening
// it contacts the original servers, and the policy written into the page has to let those requests
// through.
for (const [label, run] of [["inline", runInline], ["archive", runArchive]]) {
	const { requested, resources } = getResources();
	const content = await run(resources, { blockImages: true, linkBlockedImages: true });
	for (const [id, [name, expected]] of Object.entries(LINKED)) {
		check(label + ": " + id + " keeps the address of its image", attribute(content, id, name), expected);
	}
	check(label + ": the sizes of a linked srcset are kept", attribute(content, "source", "sizes"), "100vw");
	check(label + ": a style attribute keeps its url()", content.includes("url(" + BASE + "attribute.png)"), true);
	check(label + ": a stylesheet rule keeps its url()", content.includes("url(" + BASE + "rule.png)"), true);
	// what is not an address on the web is still emptied: the data of an image is an image, and a
	// file: address names a file of the machine the page was saved on
	check(label + ": an image given as a data: URI is still emptied", attribute(content, "inline", "src"), EMPTY);
	check(label + ": an image at a file: address is still emptied", attribute(content, "local", "src"), EMPTY);
	// an object is loaded under object-src, which stays closed
	check(label + ": an object is still emptied", attribute(content, "object", "data"), EMPTY);
	check(label + ": no image is fetched", requested.filter(name => name != "font.woff2").length, 0);
	check(label + ": the font is still embedded", requested.includes("font.woff2"), true);
	check(label + ": the policy lets the images through", /img-src 'self' data:( blob:)? http: https:;/.test(content), true);
	check(label + ": the policy opens nothing else", (content.match(/https?:;/g) || []).length, 1);
}

// The option alone does nothing, and `blockImages` alone behaves as before: both controls keep the
// policy closed.
for (const [label, run] of [["inline", runInline], ["archive", runArchive]]) {
	{
		const { requested, resources } = getResources();
		const content = await run(resources, { blockImages: true });
		const emptied = Object.entries(LINKED).filter(([id, [name]]) => name != "srcset" && attribute(content, id, name) == EMPTY).length;
		check(label + " control: blockImages alone empties the images", emptied, Object.values(LINKED).filter(([name]) => name != "srcset").length);
		check(label + " control: blockImages alone removes srcset", attribute(content, "candidates", "srcset"), null);
		check(label + " control: blockImages alone fetches no image", requested.filter(name => name != "font.woff2").length, 0);
		check(label + " control: blockImages alone keeps the policy closed", /https?:;/.test(content), false);
	}
	{
		const { requested, resources } = getResources();
		const content = await run(resources, { linkBlockedImages: true });
		check(label + " control: without blockImages the images are fetched", requested.includes("a.png") && requested.includes("rule.png"), true);
		check(label + " control: without blockImages no image keeps its address", content.includes(BASE + "a.png\"") || content.includes(BASE + "a.png "), false);
		check(label + " control: without blockImages the policy stays closed", /https?:;/.test(content), false);
	}
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function getResources() {
	const requested = [];
	const resources = { [PAGE_URL]: { body: PAGE } };
	for (const name of IMAGE_NAMES) {
		resources[BASE + name] = { body: "IMAGE", contentType: name.endsWith(".svg") ? "image/svg+xml" : "image/png", onRequest: () => requested.push(name) };
	}
	resources["https://cdn.example.org/b.png?v=1"] = { body: "IMAGE", contentType: "image/png", onRequest: () => requested.push("b.png") };
	resources["https://cdn.example.org/wider.png"] = { body: "IMAGE", contentType: "image/png", onRequest: () => requested.push("wider.png") };
	resources[BASE + "font.woff2"] = { body: "FONT", contentType: "font/woff2", onRequest: () => requested.push("font.woff2") };
	return { requested, resources };
}

function runInline(resources, options) {
	return capture(resources, { url: PAGE_URL, content: PAGE, insertMetaCSP: true, removeUnusedStyles: false, removeUnusedFonts: false, ...options });
}

async function runArchive(resources, options) {
	const pageData = await captureArchive(resources, { url: PAGE_URL, content: PAGE, insertMetaCSP: true, removeUnusedStyles: false, removeUnusedFonts: false, ...options });
	return pageData.content + [...pageData.resources.stylesheets.values()].map(stylesheet => stylesheet.content).join("\n");
}

function attribute(content, id, name) {
	const match = content.match(new RegExp("<[a-z]+ [^>]*id=\"?" + id + "\"?[ >][^>]*>?"));
	const valueMatch = match && match[0].match(new RegExp(" " + name + "=(?:\"([^\"]*)\"|([^\" >]*))"));
	return valueMatch && (valueMatch[1] !== undefined ? valueMatch[1] : valueMatch[2]).replace(/&amp;/g, "&");
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
