import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// querySelectorAll has no namespaces, so a namespaced type selector is queried with its prefix
// stripped: `svg|a` as `a`. That is right for reachability and wrong for the cascade, where the
// pass took the stripped match as definite, so `svg|a { color: red }` registered on every HTML link
// and pruned `a { color: blue }`: blue live, black saved in Chromium. A selector carrying a
// namespace is now unqueryable, kept when its stripped form matches and never in the cascade.
const NAMESPACE = "@namespace svg url(http://www.w3.org/2000/svg);";

const cases = [
	{
		label: "a namespaced selector leaves the plain rule it would beat alone",
		css: NAMESPACE + " a { color: blue } svg|a { color: red }",
		body: "<a>x</a>",
		kept: ["a{color:blue}", "svg|a{color:red}"],
		removed: []
	},
	{
		label: "a namespaced selector matching no element of that name is removed",
		css: NAMESPACE + " svg|circle { fill: red }",
		body: "<a>x</a>",
		kept: [],
		removed: ["circle"]
	},
	{
		label: "a namespaced selector inside :is() is never removed",
		css: NAMESPACE + " :is(svg|circle) { fill: red }",
		body: "<a>x</a>",
		kept: [":is(svg|circle){fill:red}"],
		removed: []
	},
	{
		label: "control: the plain rule still loses to a plain later rule",
		css: NAMESPACE + " a { color: blue } a { color: red }",
		body: "<a>x</a>",
		kept: ["a{color:red}"],
		removed: ["blue"]
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
