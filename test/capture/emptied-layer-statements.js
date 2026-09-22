import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// A `@layer a { … }` block establishes a's place in the layer order at the point it is written,
// whether or not anything inside it survives. The pass used to remove a block it had emptied, so
// `@layer a { unused } @layer b { … } @layer a { … }` computed the cascade with a below b, kept the
// right declarations, and then saved b before a: the browser read the file with the order reversed
// and applied a's rules over b's. Blue live, red saved in Chromium. An emptied named block is now
// left as the statement `@layer a;`, which is all a block does for the order once it is empty. An
// anonymous layer cannot be named again, so an emptied one is still removed.
const cases = [
	{
		label: "an emptied named layer becomes a statement that keeps its place",
		css: "@layer a { .absent { color: red } } @layer b { p::before { content: \"x\"; color: blue } } @layer a { p::before { content: \"x\"; color: red } }",
		body: "<p>t</p>",
		kept: ["@layer a;@layer b{p::before{content:\"x\";color:blue}}@layer a{p::before{content:\"x\";color:red}}"],
		removed: [".absent"]
	},
	{
		label: "a layer emptied by the cascade becomes a statement too",
		css: "@layer a { p { color: red } } @layer b { p { color: blue } }",
		body: "<p>t</p>",
		kept: ["@layer a;@layer b{p{color:blue}}"],
		removed: ["red"]
	},
	{
		label: "an emptied nested layer becomes a statement inside its parent",
		css: "@layer a { @layer b { .absent { color: red } } p { color: red } }",
		body: "<p>t</p>",
		kept: ["@layer a{@layer b;p{color:red}}"],
		removed: [".absent"]
	},
	{
		label: "an emptied layer inside a conditional group keeps the group",
		css: "@media print { @layer a { .absent { color: red } } } p { color: red }",
		body: "<p>t</p>",
		kept: ["@media print{@layer a;}p{color:red}"],
		removed: [".absent"]
	},
	{
		label: "an emptied anonymous layer is still removed",
		css: "@layer { .absent { color: red } } p { color: blue }",
		body: "<p>t</p>",
		kept: ["p{color:blue}"],
		removed: ["@layer"]
	},
	{
		label: "control: a layer statement written by the author is untouched",
		css: "@layer a, b; @layer b { p { color: blue } } @layer a { p { color: red } }",
		body: "<p>t</p>",
		kept: ["@layer a,b;@layer b{p{color:blue}}@layer a;"],
		removed: ["red"]
	}
];

let failed = false;

for (const testCase of cases) {
	const page = html(testCase.body, "<style>" + testCase.css + "</style>");
	const content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, removeUnusedStyles: true });
	const styleText = content.substring(content.indexOf("<style>"), content.indexOf("</style>"));
	testCase.kept.forEach(fragment => check(testCase.label + ", kept " + fragment, styleText.includes(fragment), true));
	testCase.removed.forEach(fragment => check(testCase.label + ", removed " + fragment, styleText.includes(fragment), false));
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
