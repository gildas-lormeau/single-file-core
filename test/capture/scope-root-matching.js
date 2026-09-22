import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// Three ways the pass matched a scoped selector against elements the browser never styles, each
// measured in Chromium 151, Firefox 153 and WebKit 26.5. A selector written inside `@scope` is
// matched as if it began with `:scope` and a descendant combinator: the scoping root itself is
// matched only by `:scope` or `&`, and every compound has to sit inside the root, so
// `@scope (.box) { .outer p }` matches nothing when `.outer` is outside the box. The pass tested the
// root with matches() and queried the selector as written, so `.card` matched its own root and
// `.outer p` matched a paragraph the browser leaves alone, each pruning the rule the browser applies.
// And at document level `:scope` means `:root`, but the pass ran a document `:scope` selector from
// body as well as from the root, so `:scope > p` matched body's children.
const cases = [
	{
		label: "an ancestor outside the scoping root does not match",
		css: "p { color: blue } @scope (.box) { .outer p { color: red } }",
		body: "<div class=\"outer\"><div class=\"box\"><p>t</p></div></div>",
		kept: ["p{color:blue}"],
		removed: [".outer p", "@scope"]
	},
	{
		label: "the same ancestor inside the scoping root matches",
		css: "p { color: blue } @scope (.box) { .outer p { color: red } }",
		body: "<div class=\"box\"><div class=\"outer\"><p>t</p></div></div>",
		kept: ["@scope (.box){.outer p{color:red}}"],
		removed: ["p{color:blue}"]
	},
	{
		label: "a plain selector never matches the scoping root itself",
		css: "@scope (.card) { .card { color: red } :scope { color: blue } }",
		body: "<div class=\"card\">t</div>",
		kept: [":scope{color:blue}"],
		removed: [".card{color:red}"]
	},
	{
		label: "& matches the scoping root",
		css: "@scope (.card) { & { color: red } }",
		body: "<div class=\"card\">t</div>",
		kept: ["&{color:red}"],
		removed: []
	},
	{
		label: "a nested rule inside a scope keeps its ancestors inside the root",
		css: "p { color: blue } @scope (.box) { .a { p { color: red } } }",
		body: "<div class=\"a\"><div class=\"box\"><p>t</p></div></div>",
		kept: ["p{color:blue}"],
		removed: ["@scope"]
	},
	{
		label: "a document-level :scope means the root element, not body",
		css: "p { color: blue } :scope > p { color: red }",
		body: "<p>t</p>",
		kept: ["p{color:blue}"],
		removed: [":scope>p"]
	},
	{
		label: "control: a document-level :scope > body matches",
		css: ":scope > body { color: red }",
		body: "<p>t</p>",
		kept: [":scope>body{color:red}"],
		removed: []
	},
	{
		label: "control: a scoped selector list is prefixed selector by selector",
		css: "@scope (.box) { .absent, p { color: red } }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: ["@scope (.box){p{color:red}}"],
		removed: [".absent"]
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
