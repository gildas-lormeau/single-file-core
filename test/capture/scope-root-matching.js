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
const TWO_ROOTS = "<div class=\"box\"><div class=\"mid\"><div class=\"box\"><div class=\"stop\"><p>t</p></div></div></div></div>";
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
	},
	// css-cascade-6 §3.5.5: the <scope-start> of a nested @scope is relative to the nesting
	// context, so its :scope is the enclosing root, not the document. The pass resolved it against
	// the document, found nothing, and removed the whole inner scope.
	{
		label: "a nested prelude resolves its :scope against the enclosing root",
		css: "p { color: blue } @scope (.parent) { @scope (:scope > .child) { p { color: red } } }",
		body: "<div class=\"parent\"><div class=\"child\"><p>t</p></div></div>",
		kept: ["color:red"],
		removed: ["p{color:blue}"]
	},
	{
		label: "a nested prelude without :scope stays inside the enclosing root",
		css: "p { color: blue } @scope (.box) { @scope (.inner) { p { color: red } } }",
		body: "<div class=\"box\"><div class=\"inner\"><p>t</p></div></div>",
		kept: ["color:red"],
		removed: ["p{color:blue}"]
	},
	{
		label: "control: a nested prelude matching only outside the enclosing root matches nothing",
		css: "p { color: blue } @scope (.box) { @scope (.inner) { p { color: red } } }",
		body: "<div class=\"inner\"><p>t</p></div><div class=\"box\"></div>",
		kept: ["p{color:blue}"],
		removed: ["color:red"]
	},
	// §3.5.4: with no <scope-start> the scoping root is the parent element of the stylesheet's
	// owner node. The pass took the document element, so the scope reached the whole page.
	// Measured 2026-09-22 in Chromium 151, Firefox 153 and WebKit 26.5: a prelude-less @scope in a
	// head style leaves a body paragraph unstyled, and one in a div style reaches that div's own
	// paragraphs, so the head case below matches nothing and the rule goes.
	{
		label: "a prelude-less scope in a head style is rooted at head, not the document",
		css: "@scope { p { color: red } } p { color: blue }",
		body: "<p>t</p>",
		kept: ["p{color:blue}"],
		removed: ["color:red"]
	},
	{
		label: "a prelude-less scope is rooted at the style element's parent",
		css: "@scope { p { color: red } } p { color: blue }",
		body: "<div class=\"host\">STYLE</div><p class=\"outside\">t</p>",
		inBody: true,
		kept: ["p{color:blue}"],
		removed: ["color:red"]
	},
	{
		label: "control: a prelude-less scope still reaches inside that parent",
		css: "@scope { p { color: red } } p { color: blue }",
		body: "<div class=\"host\">STYLE<p>t</p></div>",
		inBody: true,
		kept: ["color:red"],
		removed: ["p{color:blue}"]
	},
	// §3.5.4 states the implicit root without a nesting exception, so a prelude-less @scope inside
	// another is rooted at the style element's parent exactly as it is at top level, not at the
	// enclosing scope's roots. The branch testing the enclosing scope came first, so the inner scope
	// inherited `.box` and the rule was treated as applying. Measured in all three engines: blue.
	{
		label: "a nested prelude-less scope is rooted at the style element's parent",
		css: "p { color: blue } @scope (.box) { @scope { p { color: red } } }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: ["p{color:blue}"],
		removed: ["color:red"]
	},
	{
		label: "control: a nested prelude-less scope reaches inside that parent",
		css: "p { color: blue } @scope (.box) { @scope { p { color: red } } }",
		body: "<div class=\"box\">STYLE<p>t</p></div>",
		inBody: true,
		kept: ["color:red"],
		removed: ["p{color:blue}"]
	},
	// §3.5.4 again, on the limits: "For each scope created by a scoping root, its scoping limits are
	// set to all elements that are descendants of the scoping root and that match <scope-end>". They
	// were collected into one set shared by every root, so a limit computed for the outer root cut
	// the inner root's own scope, where the inner root has no limit at all. Measured in all three
	// engines: red.
	{
		label: "a limit only cuts the root it was computed for",
		css: "p { color: blue } @scope (.box) to (:scope > .box) { p { color: red } }",
		body: "<div class=\"box\"><div class=\"box\"><p>t</p></div></div>",
		kept: ["color:red"],
		removed: ["p{color:blue}"]
	},
	{
		label: "control: a limit still cuts its own root",
		css: "p { color: blue } @scope (.box) to (.stop) { p { color: red } }",
		body: "<div class=\"box\"><div class=\"stop\"><p>t</p></div></div>",
		kept: ["p{color:blue}"],
		removed: ["color:red"]
	},
	// Keying the limits by root left the two sites below reading the roots as one undifferentiated
	// set, and both are decided on the same DOM: the paragraph is blocked from the inner .box by
	// that root's own limit, and admitted by the outer .box, which has no limit of its own. A
	// selector matched inside the inner root is therefore not applied, and the blocked inner root is
	// not the proximity winner. Measured in Chromium 151, Firefox 153 and WebKit 26.5: blue in both.
	{
		label: "a scoped match and the scope that admits it come from the same root",
		css: "p { color: blue } @scope (.box) to (:scope > .stop) { :scope > .stop > p { color: red } }",
		body: TWO_ROOTS,
		kept: ["p{color:blue}"],
		removed: ["color:red"]
	},
	{
		label: "control: a match from the root that admits the element still applies",
		css: "p { color: blue } @scope (.box) to (:scope > .stop) { :scope > .mid p { color: red } }",
		body: TWO_ROOTS,
		kept: ["color:red"],
		removed: ["p{color:blue}"]
	},
	{
		label: "scope proximity skips a root whose limit blocks the element",
		css: "@scope (.box) to (:scope > .stop) { p { color: red } } @scope (.mid) { p { color: blue } }",
		body: TWO_ROOTS,
		kept: ["color:blue"],
		removed: ["color:red"]
	},
	{
		label: "control: proximity still counts the nearest unblocked root",
		css: "@scope (.box) { p { color: red } } @scope (.mid) { p { color: blue } }",
		body: TWO_ROOTS,
		kept: ["color:red"],
		removed: ["color:blue"]
	}
];

let failed = false;

for (const testCase of cases) {
	const styleElement = "<style>" + testCase.css + "</style>";
	const page = testCase.inBody
		? html(testCase.body.replace("STYLE", styleElement))
		: html(testCase.body, styleElement);
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
