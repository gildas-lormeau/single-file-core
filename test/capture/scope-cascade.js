import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// The two cascade rules of CSS Cascade 6 that @scope adds, both measured in Chromium 151, Firefox
// 153 and WebKit 26.5 before the fix. Specificity: a selector inside @scope gets nothing for the
// scope, `:scope` counts as a pseudo-class (0,1,0), and `&` counts as nothing. The pass used to add
// one pseudo-class to every scoped selector and count `:scope` as a type selector, so a scoped `p`
// modelled as (0,1,1) tied with an unscoped `.w p` and won by order. Proximity: on a specificity
// tie the declaration whose scoping root is the fewest hops from the subject wins, before order of
// appearance, and an unscoped rule counts as infinitely far. The pass went from specificity straight
// to order, so the later rule won whatever the roots. And `:scope` itself was filed with the state
// pseudo-classes, so a rule using it was never matched as written nor entered in the cascade.
const cases = [
	{
		label: "an unscoped (0,1,1) rule beats a scoped (0,0,1) rule written after it",
		css: ".w p { color: blue } @scope (.s) { p { color: red } }",
		body: "<div class=\"w s\"><p>t</p></div>",
		kept: [".w p{color:blue}"],
		removed: ["p{color:red}"]
	},
	{
		label: ":scope counts as a pseudo-class, so the later of two (0,1,1) rules in one scope wins",
		css: "@scope (.s) { .x p { color: blue } :scope p { color: red } }",
		body: "<div class=\"s x\"><p>t</p></div>",
		kept: [":scope p{color:red}"],
		removed: [".x p{color:blue}"]
	},
	{
		label: "& counts as nothing, so an unscoped class rule beats it",
		css: "@scope (.s) { & p { color: red } } .x p { color: blue }",
		body: "<div class=\"s x\"><p>t</p></div>",
		kept: [".x p{color:blue}"],
		removed: ["& p{color:red}"]
	},
	{
		label: "on a tie a scoped rule beats an unscoped rule written after it",
		css: "@scope (.card) { p { color: red } } p { color: blue }",
		body: "<div class=\"card\"><p>t</p></div>",
		kept: ["p{color:red}"],
		removed: ["p{color:blue}"]
	},
	{
		label: "on a tie the closer scoping root wins over a later rule",
		css: "@scope (.inner) { p { color: blue } } @scope (.outer) { p { color: red } }",
		body: "<div class=\"outer\"><div class=\"inner\"><p>t</p></div></div>",
		kept: ["@scope (.inner){p{color:blue}}"],
		removed: ["p{color:red}"]
	},
	{
		label: "a nested scope measures from its innermost root",
		css: "@scope (.outer) { @scope (.inner) { p { color: red } } } @scope (.mid) { p { color: blue } }",
		body: "<div class=\"outer\"><div class=\"mid\"><div class=\"inner\"><p>t</p></div></div></div>",
		kept: ["p{color:red}"],
		removed: ["p{color:blue}"]
	},
	{
		label: "control: order still decides between two rules of one scope",
		css: "@scope (.s) { p { color: red } p { color: blue } }",
		body: "<div class=\"s\"><p>t</p></div>",
		kept: ["p{color:blue}"],
		removed: ["p{color:red}"]
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
