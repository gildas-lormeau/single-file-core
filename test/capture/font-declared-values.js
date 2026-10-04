// Two ways removeUnusedFonts misread the stylesheet text it checks the rendered fonts against.
//
// The content and quotes of pseudo-elements count as drawn text, and they were read lowercased, so
// "Q" drawn only by a ::before counted as "q" and a face whose unicode-range covers only "Q" was
// dropped. The controls pin the range test itself: a face whose range covers a character drawn
// nowhere is still dropped.
//
// A custom property naming a family took the body's computed value as its only value whenever the
// body had one, so a section redefining it, `.dark{--font-heading:...}`, was never seen and the face
// it named was dropped. Every declared value is now a candidate next to the computed one; the
// control pins that a face named by no candidate is still dropped.
import { capture, html } from "./common.js";

const cssTree = await import("../../vendor/css-tree.js");
const fontsMinifier = await import("../../modules/css-fonts-minifier.js");

const PAGE_URL = "https://example.com/values.html";
const FONT_URL = "https://example.com/t.woff2";
const USED_FONTS = [["t", "400", "normal", "normal", "100%"]];

let failed = false;

check("an uppercase character drawn by a ::before keeps the face covering it",
	await countKeptFaces("U+51", ".a::before{font-family:\"T\";content:\"Q\"}"), 1);
check("a non-ASCII uppercase character drawn by a ::before keeps the face covering it",
	await countKeptFaces("U+C9", ".a::before{font-family:\"T\";content:\"\u00c9\"}"), 1);
check("an uppercase character drawn by quotes keeps the face covering it",
	await countKeptFaces("U+51", ".a q{font-family:\"T\";quotes:\"Q\" \"Q\"}", "<q>x</q>"), 1);
check("control: a face covering only a character drawn nowhere is dropped",
	await countKeptFaces("U+51", ".a::before{font-family:\"T\";content:\"q\"}"), 0);

check("a custom property redefined below the root keeps the face of the redefinition",
	await countKeptFaces("", ":root{--f:\"Other\"}.a p{--f:\"T\"}.a p{font-family:var(--f)}"), 1);
check("a custom property redefined below the root keeps the face of the root value",
	await countKeptFaces("", ":root{--f:\"T\"}.a p{--f:\"Other\"}.a{font-family:var(--f)}"), 1);
check("control: a face named by no value of the custom property is dropped",
	await countKeptFaces("", ":root{--f:\"Other\"}.a p{--f:\"Another\"}.a p{font-family:var(--f)}"), 0);

// A capture from here passes no live document, so the pass never reads a computed value and the
// three cases above only exercise the declared ones. These call the pass with the document, the way
// the extensions and the CLI do. happy-dom does not inherit a custom property from :root to the body,
// so the body declares it itself.
check("with a live document, a custom property redefined below the body keeps the face of the redefinition",
	countKeptFacesInDocument("body{--f:\"Other\"}.a p{--f:\"T\"}.a p{font-family:var(--f)}"), 1);
check("with a live document, control: a face named by no value of the custom property is dropped",
	countKeptFacesInDocument("body{--f:\"Other\"}.a p{--f:\"Another\"}.a p{font-family:var(--f)}"), 0);

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function countKeptFaces(unicodeRange, style, markup = "") {
	const face = "@font-face{font-family:\"T\";src:url(" + FONT_URL + ") format(\"woff2\")" + (unicodeRange ? ";unicode-range:" + unicodeRange : "") + "}";
	const page = html("<div class=\"a\"><p>hello world" + markup + "</p></div>", "<style>" + face + style + "</style>");
	const pageResources = new Map([
		[PAGE_URL, { body: page, contentType: "text/html" }],
		[FONT_URL, { body: new Uint8Array(512).fill(65), contentType: "font/woff2" }]
	]);
	const content = await capture(pageResources, { url: PAGE_URL, content: page, removeUnusedFonts: true, usedFonts: USED_FONTS });
	return Array.from(content.matchAll(/@font-face\s*\{/g)).length;
}

function countKeptFacesInDocument(style) {
	const css = "@font-face{font-family:\"T\";src:url(" + FONT_URL + ") format(\"woff2\")}" + style;
	const doc = new globalThis.DOMParser().parseFromString(html("<div class=\"a\"><p>hello world</p></div>", "<style>" + css + "</style>"), "text/html");
	const stylesheet = cssTree.parse(css);
	fontsMinifier.process(doc, new Map([[doc.querySelector("style"), { stylesheet }]]), new Map(), { doc, usedFonts: USED_FONTS });
	return Array.from(cssTree.generate(stylesheet).matchAll(/@font-face\s*\{/g)).length;
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
