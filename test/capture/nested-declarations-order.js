import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// Since the 2024 nesting change, declarations written after a nested rule cascade as a rule of their
// own placed after it, the nested declarations rule, with the parent's selector and specificity. The
// pass gave a style rule one order for all its declarations, so a nested rule of equal specificity
// beat the declarations written after it and both runs of the parent were pruned. Each run after a
// nested rule now takes its own order, drawn after the rules before it. A nested at-rule is a
// boundary too, while its own declarations stay in their conditional context.
const cases = [
	{
		label: "a declaration after a nested rule beats it",
		css: ".a { color: red; &:where(.n) { color: blue } color: green }",
		body: "<p class=\"a n\">t</p>",
		kept: ["color:green"],
		removed: ["color:red", "color:blue"]
	},
	{
		label: "control: a declaration before the nested rule still loses to it",
		css: ".b { color: red; &:where(.n) { color: blue } }",
		body: "<p class=\"b n\">t</p>",
		kept: ["color:blue"],
		removed: ["color:red"]
	},
	{
		label: "a nested at-rule is a boundary and keeps its own context",
		css: ".c { color: red; @media (min-width: 1px) { & { color: blue } } color: green }",
		body: "<p class=\"c\">t</p>",
		kept: ["color:blue", "color:green"],
		removed: ["color:red"]
	},
	{
		label: "two runs after two nested rules keep their order",
		css: ".d { &:where(.n) { color: blue } color: red; &:where(.m) { color: green } color: black }",
		body: "<p class=\"d n m\">t</p>",
		kept: ["color:black"],
		removed: ["color:blue", "color:red", "color:green"]
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
