import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// A selector with a state pseudo-class, `:hover`, is unqueryable: it may match, so its rule is kept
// and never enters the cascade. That status used to stop at the selector itself. A rule nested in
// it, `.box:hover { p { … } }`, was analyzed alone as `p`, matched as `.box p` once the sanitizer
// stripped the state, and registered as a definite match, so it won the cascade and pruned the
// resting `p { color: blue }`: blue live, black saved in Chromium. `@scope (.box:hover)` did the
// same through its roots, and a limit `to (.inner:hover)` sanitized to `.inner` became an
// unconditional boundary, so the rules inside it were removed as unmatched. The state now
// propagates from every ancestor selector and from the scope prelude to the nested selectors.
const cases = [
	{
		label: "a rule nested in a hovered parent leaves the resting rule alone",
		css: "p { color: blue } .box:hover { p { color: red } }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: ["p{color:blue}", ".box:hover{p{color:red}}"],
		removed: []
	},
	{
		label: "a rule nested two levels under a hovered ancestor leaves the resting rule alone",
		css: "p { color: blue } .box:hover { .in { p { color: red } } }",
		body: "<div class=\"box\"><div class=\"in\"><p>t</p></div></div>",
		kept: ["p{color:blue}", ".box:hover{.in{p{color:red}}}"],
		removed: []
	},
	{
		label: "a rule nested in a hovered parent that matches nothing is still removed",
		css: ".box:hover { p { color: red } }",
		body: "<div class=\"other\"><p>t</p></div>",
		kept: [],
		removed: [".box:hover"]
	},
	{
		label: "a rule nested in a parent whose state is inside :not() is never removed",
		css: ".box:not(:hover) { .absent { color: red } }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: [".box:not(:hover){.absent{color:red}}"],
		removed: []
	},
	{
		label: "control: a rule nested in a plain parent still prunes the rule it beats",
		css: "p { color: blue } .box { p { color: red } }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: [".box{p{color:red}}"],
		removed: ["p{color:blue}"]
	},
	{
		label: "a rule in a scope whose root is hovered leaves the resting rule alone",
		css: "p { color: blue } @scope (.box:hover) { p { color: red } }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: ["p{color:blue}", "@scope (.box:hover){p{color:red}}"],
		removed: []
	},
	{
		label: "a rule in a scope whose root is hovered that matches nothing is still removed",
		css: "@scope (.box:hover) { .absent { color: red } }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: [],
		removed: ["@scope"]
	},
	{
		label: "a scope whose root state is inside :not() keeps its rules when no root is found",
		css: "@scope (.box:is(:hover)) { p { color: red } }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: ["@scope (.box:is(:hover)){p{color:red}}"],
		removed: []
	},
	{
		label: "a hovered scope limit does not cut the rules inside it",
		css: "@scope (.box) to (.inner:hover) { p { color: red } }",
		body: "<div class=\"box\"><div class=\"inner\"><p>t</p></div></div>",
		kept: ["@scope (.box) to (.inner:hover){p{color:red}}"],
		removed: []
	},
	{
		label: "a hovered scope limit keeps the scope out of the cascade",
		css: "p { color: blue } @scope (.box) to (.inner:hover) { p { color: red } }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: ["p{color:blue}", "p{color:red}"],
		removed: []
	},
	{
		label: "control: a plain scope limit still cuts the rules inside it",
		css: "@scope (.box) to (.inner) { p { color: red } }",
		body: "<div class=\"box\"><div class=\"inner\"><p>t</p></div></div>",
		kept: [],
		removed: ["@scope"]
	},
	{
		label: "control: a plain scope root still prunes the rule it beats",
		css: "p { color: blue } @scope (.box) { p { color: red } }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: ["@scope (.box){p{color:red}}"],
		removed: ["p{color:blue}"]
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
