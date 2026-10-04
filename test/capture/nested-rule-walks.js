// The passes that walk stylesheet rules used to descend into @media, @supports, @layer and
// @container only, each with its own copy of that list, and never into a rule nested in a style rule.
// What they skipped they treated as absent: removeUnusedFonts dropped every face of a family named
// only in a nested rule, which is how asteriskmag.com lost Noe Standard on its pull quotes and nav
// links, the url() in @scope and @starting-style stayed remote, and a nested @media print survived
// removeAlternativeMedias. They now share getNestedChildren, which descends into any rule or at-rule
// with a block except @font-face and @keyframes. Embedding hands @keyframes, and the declarations
// met in @page and its margin rules, to processStyle whole, where their url() used to stay remote,
// and recognizes @font-face in any case. Each case is paired with the same CSS written flat,
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

// An @font-face is valid at the top level and in @media, @supports, @layer and @container only: in a
// style rule, or in a group rule nested in one, browsers drop it. The walker made the pass read it
// as declared, so bold text drawn by the only valid face, at 400, kept the nested 700 face instead
// and the saved page lost the font. Measured in Chrome 151 with css-corpus/tmp-aster/nested-ff/a.html.
{
	const style = "@font-face{font-family:\"T\";font-weight:400;src:url(" + FONT_URL + ") format(\"woff2\")}" +
		".a{color:#000;@font-face{font-family:\"T\";font-weight:700;src:url(" + FONT_URL + ") format(\"woff2\")}}.a p{font-family:\"T\";font-weight:700}";
	const content = await captureFonts(style, [["t", "700", "normal", "normal", "100%"]]);
	check("a face nested in a style rule does not displace the valid face the browser drew with", /@font-face\s*\{[^}]*font-weight:400/.test(content), true);
	check("and the nested face is dropped from the save", countFaces(content), 1);
}
{
	const style = "@font-face{font-family:\"T\";font-weight:400;src:url(" + FONT_URL + ") format(\"woff2\")}" +
		"@media all{@font-face{font-family:\"T\";font-weight:700;src:url(" + FONT_URL + ") format(\"woff2\")}}.a p{font-family:\"T\";font-weight:700}";
	const content = await captureFonts(style, [["t", "700", "normal", "normal", "100%"]]);
	check("control: the same 700 face in @media is valid and wins", /@font-face\s*\{[^}]*font-weight:400/.test(content), false);
}

await checkImage("a url() in @scope is embedded",
	"@scope (.a){p{background:url(" + IMAGE_URL + ")}}", ".a p{background:url(" + IMAGE_URL + ")}");
await checkImage("a url() in @starting-style is embedded",
	".a p{transition:background 1s}@starting-style{.a p{background:url(" + IMAGE_URL + ")}}", ".a p{background:url(" + IMAGE_URL + ")}");
await checkImage("a url() in an @media nested in a rule is embedded",
	".a p{@media all{background:url(" + IMAGE_URL + ")}}", "@media all{.a p{background:url(" + IMAGE_URL + ")}}");

await checkImage("a url() in @keyframes is embedded",
	".a p{animation:k 1s}@keyframes k{from{background:url(" + IMAGE_URL + ")}}", ".a p{background:url(" + IMAGE_URL + ")}");
await checkImage("a url() in @-webkit-keyframes is embedded",
	".a p{animation:k 1s}@-webkit-keyframes k{from{background:url(" + IMAGE_URL + ")}}", ".a p{background:url(" + IMAGE_URL + ")}");
await checkImage("a url() declared in @page is embedded",
	"@page{background:url(" + IMAGE_URL + ")}", ".a p{background:url(" + IMAGE_URL + ")}");
await checkImage("a url() in a page-margin rule is embedded",
	"@page{@top-left{background:url(" + IMAGE_URL + ")}}", ".a p{background:url(" + IMAGE_URL + ")}");
{
	const style = "@FONT-FACE{font-family:\"T\";src:url(" + FONT_URL + ") format(\"woff2\")}.a p{font-family:\"T\"}";
	const page = getPage(style);
	const pageResources = new Map([
		[PAGE_URL, { body: page, contentType: "text/html" }],
		[FONT_URL, { body: new Uint8Array(512).fill(65), contentType: "font/woff2" }]
	]);
	const content = await capture(pageResources, { url: PAGE_URL, content: page });
	check("an upper-case @FONT-FACE is embedded as a font", !content.includes(FONT_URL) && content.includes("data:font/woff2"), true);
}

// An @font-face nested in a style rule, at any depth, or in @scope, whose body is parsed the same way,
// is dropped by every browser, yet embedding fetched its font, as an image, inside the style rule:
// 39,400 bytes of woff2 a save could never use (css-corpus/tmp-aster/nested-ff/b.html). The rule is
// now removed before anything is fetched. An @font-face in an at-rule the walk does not know to be
// a nested context, such as @starting-style, is left as it was.
for (const [label, style] of [
	["nested in a style rule", ".a{color:#000;@font-face{font-family:\"T\";src:url(" + FONT_URL + ")}}"],
	["nested in an @media nested in a style rule", ".a{@media all{@font-face{font-family:\"T\";src:url(" + FONT_URL + ")}}}"],
	["in @scope", "@scope (.a){@font-face{font-family:\"T\";src:url(" + FONT_URL + ")}}"]
]) {
	const content = await captureFontFile(style);
	check("an @font-face " + label + " is removed and its font not embedded", content.includes("@font-face") || content.includes("data:font/woff2"), false);
}
{
	const content = await captureFontFile("@media all{@font-face{font-family:\"T\";src:url(" + FONT_URL + ")}}");
	check("control: an @font-face in a top-level @media is kept and its font embedded", content.includes("@font-face") && content.includes("data:font/woff2"), true);
}
{
	const content = await captureFontFile("@starting-style{@font-face{font-family:\"T\";src:url(" + FONT_URL + ")}}");
	check("an @font-face in @starting-style is left as it was", content.includes("@font-face"), true);
}

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

async function captureFontFile(style) {
	const page = getPage(style);
	const pageResources = new Map([
		[PAGE_URL, { body: page, contentType: "text/html" }],
		[FONT_URL, { body: new Uint8Array(512).fill(65), contentType: "font/woff2" }]
	]);
	return capture(pageResources, { url: PAGE_URL, content: page });
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
