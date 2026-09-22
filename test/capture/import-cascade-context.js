import { captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const IMPORT_URL = "https://example.com/imported.css";

// In an archive an imported stylesheet stays a separate file, so the unused-styles pass reaches it
// through the import's own node. Two things were lost on the way. The imported sheet's conditional
// context was rebuilt from the import's media, layer and supports alone and REPLACED the one it
// inherited, so a `<style media="print">` importing `p { color: red }` made it unconditional and
// pruned the screen sheet's `p { color: blue }`: blue live, black saved in Chromium. And the layer
// order was collected from the top-level sheets only, so an imported `@layer a` compared with a later
// local `@layer b` had no known order and ranked last: blue live, red saved. The inherited stack is
// now extended, the imported sheet is walked for layers at the import's position, and an import's
// own `layer()` is a declaration there and a layer for the rules it brings.
//
// The inline page has none of this: the inline helper pastes an import into its sheet as text.
const cases = [
	{
		label: "an import inherits the media of the style element that imports it",
		head: "<style>p { color: blue }</style><style media=\"print\">@import url(\"" + IMPORT_URL + "\");</style>",
		imported: "p { color: red }",
		page: ["p{color:blue}"],
		pageRemoved: [],
		file: ["p{color:red}"]
	},
	{
		label: "an imported layer takes its place in the order before the local layers that follow",
		head: "<style>@import url(\"" + IMPORT_URL + "\");@layer b { p { color: blue } }</style>",
		imported: "@layer a { p { color: red } }",
		page: ["@layer b{p{color:blue}}"],
		pageRemoved: [],
		file: ["@layer a;"],
		fileRemoved: ["red"]
	},
	{
		label: "a layer declared before the import keeps its place ahead of the imported one",
		head: "<style>@layer b;@import url(\"" + IMPORT_URL + "\");@layer b { p { color: blue } }</style>",
		imported: "@layer a { p { color: red } }",
		page: ["@layer b;"],
		pageRemoved: ["blue"],
		file: ["@layer a{p{color:red}}"]
	},
	{
		label: "an import with layer() puts the rules it brings in that layer",
		head: "<style>@import url(\"" + IMPORT_URL + "\") layer(a);@layer b { p { color: blue } }</style>",
		imported: "p { color: red }",
		page: ["@layer b{p{color:blue}}"],
		pageRemoved: [],
		file: [],
		fileRemoved: ["red"]
	},
	{
		label: "an import with layer() declared after a local layer loses to it",
		head: "<style>@layer b;@import url(\"" + IMPORT_URL + "\") layer(a);@layer b { p { color: blue } }</style>",
		imported: "p { color: red }",
		page: ["@layer b;"],
		pageRemoved: ["blue"],
		file: ["p{color:red}"]
	},
	{
		label: "an import's own media joins the inherited context instead of replacing it",
		head: "<style>p { color: blue }</style><style media=\"screen\">@import url(\"" + IMPORT_URL + "\") print;</style>",
		imported: "p { color: red }",
		page: ["p{color:blue}"],
		pageRemoved: [],
		file: ["p{color:red}"]
	}
];

let failed = false;

for (const testCase of cases) {
	const page = html("<p>t</p>", testCase.head);
	const resources = {
		[PAGE_URL]: { body: page },
		[IMPORT_URL]: { body: testCase.imported, contentType: "text/css" }
	};
	const pageData = await captureArchive(resources, { url: PAGE_URL, content: page, removeUnusedStyles: true, compressContent: true });
	const styleText = pageData.content.substring(pageData.content.indexOf("<style"), pageData.content.lastIndexOf("</style>"));
	const fileText = pageData.resources.stylesheets.map(resource => resource.content).join("\n");
	testCase.page.forEach(fragment => check(testCase.label + ", page keeps " + fragment, styleText.includes(fragment), true));
	testCase.pageRemoved.forEach(fragment => check(testCase.label + ", page drops " + fragment, styleText.includes(fragment), false));
	testCase.file.forEach(fragment => check(testCase.label + ", file keeps " + fragment, fileText.includes(fragment), true));
	(testCase.fileRemoved || []).forEach(fragment => check(testCase.label + ", file drops " + fragment, fileText.includes(fragment), false));
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
