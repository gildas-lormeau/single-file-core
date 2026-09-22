import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// The layer model of CSS Cascade 5 §6.4, which the pass approximated four ways. A layer name is a
// list of segments and a dotted name is the nested form, so `@layer a.b` and `@layer a { @layer b }`
// are one layer, where the pass kept `a.b` as a single segment unrelated to `a`. The rules written
// directly in a layer form an implicit sublayer AFTER its nested layers, so for normal declarations
// they beat the nested layers and for important ones they lose; the pass ranked the deeper stack
// later, the reverse. Each anonymous `@layer { }` is a distinct layer, where the pass gave them all
// one placeholder name. And a layer declared inside a `@media` or `@supports` block joins the order
// only if the condition holds, so its position is uncertain until an unconditional declaration
// settles it; the pass took the first declaration whatever its condition, so `@media not all {
// @layer a {} } @layer b {} @layer a {}` put a before b where the browser puts it after. Two layers
// whose relative order is uncertain now keep every declaration of the property they compete on.
// Each divergence was measured live against saved in Chromium with the external reviewer's script.
const cases = [
	{
		label: "a layer's own rules beat its nested layer",
		css: "@layer a { p { color: red } @layer b { p { color: blue } } }",
		body: "<p>t</p>",
		kept: ["@layer a{p{color:red}@layer b;}"],
		removed: ["blue"]
	},
	{
		label: "a nested layer beats its parent's own rules when both are important",
		css: "@layer a { p { color: red !important } @layer b { p { color: blue !important } } }",
		body: "<p>t</p>",
		kept: ["@layer a{@layer b{p{color:blue!important}}}"],
		removed: ["red"]
	},
	{
		label: "a dotted name is the nested layer",
		css: "@layer a { @layer b { p { color: red } } } @layer a.b { p { color: blue } }",
		body: "<p>t</p>",
		kept: ["@layer a.b{p{color:blue}}"],
		removed: ["red"]
	},
	{
		label: "a dotted name keeps its sublayers grouped under the parent",
		css: "@layer a.b { p { color: red } } @layer c { p { color: blue } } @layer a.d { p { color: green } }",
		body: "<p>t</p>",
		kept: ["@layer c{p{color:blue}}"],
		removed: ["red", "green"]
	},
	{
		label: "a dotted name in a statement declares the parent at that point",
		css: "@layer a.b, c; @layer c { p { color: red } } @layer a { p { color: blue } }",
		body: "<p>t</p>",
		kept: ["@layer c{p{color:red}}"],
		removed: ["blue"]
	},
	{
		label: "two anonymous layers are distinct and the later one wins",
		css: "@layer { #t { color: red } } @layer { p { color: blue } }",
		body: "<p id=\"t\">t</p>",
		kept: ["@layer{p{color:blue}}"],
		removed: ["red"]
	},
	{
		label: "named sublayers of two anonymous layers are distinct",
		css: "@layer { @layer x { #t { color: red } } } @layer { @layer x { p { color: blue } } }",
		body: "<p id=\"t\">t</p>",
		kept: ["@layer{@layer x{p{color:blue}}}"],
		removed: ["red"]
	},
	{
		label: "a layer first declared under a false media condition has an uncertain position",
		css: "@media not all { @layer a { p { color: red } } } @layer b { p { color: blue } } @layer a { p { color: green } }",
		body: "<p>t</p>",
		kept: ["@layer b{p{color:blue}}", "@layer a{p{color:green}}"],
		removed: []
	},
	{
		label: "a statement ahead of the conditional block settles the position",
		css: "@layer b, a; @media not all { @layer a { p { color: red } } } @layer b { p { color: blue } } @layer a { p { color: green } }",
		body: "<p>t</p>",
		kept: ["@layer a{p{color:green}}"],
		removed: ["blue"]
	},
	{
		label: "a layer first declared in a print stylesheet has an uncertain position",
		head: "<style media=\"print\">@layer a { p { margin: 0 } }</style><style>@layer b { p { color: blue } } @layer a { p { color: green } }</style>",
		body: "<p>t</p>",
		kept: ["@layer b{p{color:blue}}", "@layer a{p{color:green}}"],
		removed: []
	},
	{
		label: "a layer first declared in a container query is certain",
		css: "@container (min-width: 1px) { @layer a { p { margin: 0 } } } @layer b { p { color: blue } } @layer a { p { color: green } }",
		body: "<p>t</p>",
		kept: ["@layer b{p{color:blue}}"],
		removed: ["green"]
	},
	{
		label: "control: unlayered rules beat every layer for normal declarations",
		css: "p { color: blue } @layer a { p { color: red } }",
		body: "<p>t</p>",
		kept: ["p{color:blue}"],
		removed: ["red"]
	},
	{
		label: "control: the earliest layer beats unlayered rules for important declarations",
		css: "p { color: blue !important } @layer a { p { color: red !important } }",
		body: "<p>t</p>",
		kept: ["@layer a{p{color:red!important}}"],
		removed: ["blue"]
	},
	{
		label: "control: two sibling layers keep their appearance order",
		css: "@layer a { p { color: red } } @layer b { p { color: blue } }",
		body: "<p>t</p>",
		kept: ["@layer b{p{color:blue}}"],
		removed: ["red"]
	}
];

let failed = false;

for (const testCase of cases) {
	const page = html(testCase.body, testCase.head || "<style>" + testCase.css + "</style>");
	const content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, removeUnusedStyles: true });
	const styleText = content.substring(content.indexOf("<style"), content.lastIndexOf("</style>"));
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
