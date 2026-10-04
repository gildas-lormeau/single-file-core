// The passes that walk stylesheet rules used to descend into @media, @supports, @layer and
// @container only, each with its own copy of that list, and never into a rule nested in a style rule.
// What they skipped they treated as absent: removeUnusedFonts dropped every face of a family named
// only in a nested rule, which is how asteriskmag.com lost Noe Standard on its pull quotes and nav
// links, the url() in @scope and @starting-style stayed remote, and a nested @media print survived
// removeAlternativeMedias. They now share getNestedChildren, which descends into any rule or at-rule
// with a block except @font-face and @keyframes. Each case is paired with the same CSS written flat,
// which every pass handled before, so a case cannot pass on a capture that keeps everything.
import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/nested.html";
const FONT_URL = "https://example.com/t.woff2";
const IMAGE_URL = "https://example.com/i.png";
const FACE = "@font-face{font-family:\"T\";src:url(" + FONT_URL + ") format(\"woff2\")}";
const FACE_Q = "@font-face{font-family:\"T\";src:url(" + FONT_URL + ") format(\"woff2\");unicode-range:U+71}";
const USED_FONTS = [["t", "400", "normal", "normal", "100%"]];

let failed = false;

await checkFont("a family named in a nested rule keeps its face",
	FACE + ".a{color:#000;& p{font-family:\"T\"}}", FACE + ".a p{font-family:\"T\"}");
await checkFont("a family named in an @media nested in a rule keeps its face",
	FACE + ".a p{@media all{font-family:\"T\"}}", FACE + "@media all{.a p{font-family:\"T\"}}");
await checkFont("a family named in @scope keeps its face",
	FACE + "@scope (.a){p{font-family:\"T\"}}", FACE + ".a p{font-family:\"T\"}");
await checkFont("a family named in @starting-style keeps its face",
	FACE + "@starting-style{.a p{font-family:\"T\"}}", FACE + ".a p{font-family:\"T\"}");
await checkFont("a custom property declared in a nested rule is a candidate value",
	FACE + ".b{--f:\"Other\"}.a{& p{--f:\"T\"}}.a p{font-family:var(--f)}", FACE + ".b{--f:\"Other\"}.a p{--f:\"T\"}.a p{font-family:var(--f)}");
await checkFont("the content of a nested pseudo-element counts as drawn text",
	FACE_Q + ".a::before{font-family:\"T\"}.a{&::before{content:\"q\"}}", FACE_Q + ".a::before{font-family:\"T\"}.a::before{content:\"q\"}");

{
	const content = await captureFonts(FACE + ".a p{font-family:\"T\"}", [["other", "400", "normal", "normal", "100%"]]);
	check("control: a face the browser did not draw with is still dropped", countFaces(content), 0);
}

await checkImage("a url() in @scope is embedded",
	"@scope (.a){p{background:url(" + IMAGE_URL + ")}}", ".a p{background:url(" + IMAGE_URL + ")}");
await checkImage("a url() in @starting-style is embedded",
	".a p{transition:background 1s}@starting-style{.a p{background:url(" + IMAGE_URL + ")}}", ".a p{background:url(" + IMAGE_URL + ")}");
await checkImage("a url() in an @media nested in a rule is embedded",
	".a p{@media all{background:url(" + IMAGE_URL + ")}}", "@media all{.a p{background:url(" + IMAGE_URL + ")}}");

await checkPrintMedia("an @media print nested in @supports is removed",
	"@supports (display:grid){@media print{.a p{color:red}}}", "@media print{.a p{color:red}}");
await checkPrintMedia("an @media print nested in a rule is removed",
	".a p{@media print{color:red}}", "@media print{.a p{color:red}}");
{
	const content = await captureMedias("@supports (display:grid){@media screen{.a p{color:red}}}");
	check("control: an @media screen nested in @supports is kept", content.includes("color:red"), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function checkFont(label, nestedStyle, flatStyle) {
	check(label + " (flat control)", countFaces(await captureFonts(flatStyle, USED_FONTS)), 1);
	check(label, countFaces(await captureFonts(nestedStyle, USED_FONTS)), 1);
}

async function checkImage(label, nestedStyle, flatStyle) {
	check(label + " (flat control)", testImageEmbedded(await captureImages(flatStyle)), true);
	check(label, testImageEmbedded(await captureImages(nestedStyle)), true);
}

async function checkPrintMedia(label, nestedStyle, flatStyle) {
	check(label + " (flat control)", (await captureMedias(flatStyle)).includes("color:red"), false);
	check(label, (await captureMedias(nestedStyle)).includes("color:red"), false);
}

async function captureFonts(style, usedFonts) {
	const page = getPage(style);
	const pageResources = new Map([
		[PAGE_URL, { body: page, contentType: "text/html" }],
		[FONT_URL, { body: new Uint8Array(512).fill(65), contentType: "font/woff2" }]
	]);
	return capture(pageResources, { url: PAGE_URL, content: page, removeUnusedFonts: true, usedFonts });
}

async function captureImages(style) {
	const page = getPage(style);
	const pageResources = new Map([
		[PAGE_URL, { body: page, contentType: "text/html" }],
		[IMAGE_URL, { body: new Uint8Array(256).fill(0x21), contentType: "image/png" }]
	]);
	return capture(pageResources, { url: PAGE_URL, content: page });
}

async function captureMedias(style) {
	const page = getPage(style);
	return capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, removeAlternativeMedias: true });
}

function getPage(style) {
	return html("<div class=\"a\"><p>hello world</p></div><div class=\"b\"></div>", "<style>" + style + "</style>");
}

function countFaces(content) {
	return Array.from(content.matchAll(/@font-face\s*\{/g)).length;
}

function testImageEmbedded(content) {
	return !content.includes(IMAGE_URL) && content.includes("data:image/png");
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
