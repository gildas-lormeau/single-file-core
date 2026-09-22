import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// A declaration's value now gets one of three verdicts before it enters the cascade. Valid: the
// browser accepts it, it competes and prunes. Invalid: dropped outright. Unknown: the browser
// rejects it but it is not vendor-prefixed, so it may be a typo or syntax newer than this browser,
// and telling the two apart is impossible; it is kept, never prunes what it would beat, and is
// itself dropped only when a valid declaration beats it. Before, an identifier or a function was
// never validated at all, so `color: red; color: bogus` kept `bogus`, pruned `red`, and the saved
// page rendered black; the same for `color: future-color(1)`, the ordinary progressive-enhancement
// pattern. And a vendor function was asked of the browser by its NAME alone,
// `CSS.supports("background-image", "-webkit-linear-gradient")`, which is false for every function,
// so every single-value `-webkit-linear-gradient()` declaration disappeared from every capture.
//
// The harness has no CSS global, so the first group pins the lexer path and the second installs a
// browser stand-in that records what it was asked.
const BROWSER_SUPPORTS = new Set([
	"color:red", "color:blue", "color:var(--x)", "display:flex", "display:-webkit-box",
	"background-image:-webkit-linear-gradient(red,blue)"
]);

const cases = [
	{
		label: "lexer: a rejected identifier is dropped and its fallback kept",
		css: "p { color: red; color: bogus }",
		body: "<p>t</p>",
		kept: ["p{color:red}"],
		removed: ["bogus"]
	},
	{
		label: "lexer: a rejected function is dropped and its fallback kept",
		css: "p { color: red; color: future-color(1) }",
		body: "<p>t</p>",
		kept: ["p{color:red}"],
		removed: ["future-color"]
	},
	{
		label: "lexer: a property the lexer does not know keeps both declarations",
		css: "p { text-box-trim: trim-both; text-box-trim: none }",
		body: "<p>t</p>",
		kept: ["text-box-trim:trim-both;text-box-trim:none"],
		removed: []
	},
	{
		label: "lexer: a var() value is valid and prunes the declaration it beats",
		css: "p { color: red; color: var(--x) }",
		body: "<p>t</p>",
		kept: ["p{color:var(--x)}"],
		removed: ["red"]
	},
	{
		label: "lexer: a vendor value the lexer rejects is kept without a browser to ask",
		css: "p { display: flex; display: -ms-flexbox }",
		body: "<p>t</p>",
		kept: ["display:flex;display:-ms-flexbox"],
		removed: []
	},
	{
		label: "lexer: a vendor function with its arguments is valid",
		css: "p { background-image: -webkit-linear-gradient(red,blue) }",
		body: "<p>t</p>",
		kept: ["-webkit-linear-gradient(red,blue)"],
		removed: []
	},
	{
		label: "browser: a rejected identifier written last is kept beside its fallback",
		css: "p { color: red; color: bogus }",
		body: "<p>t</p>",
		kept: ["p{color:red;color:bogus}"],
		removed: [],
		browser: true
	},
	{
		label: "browser: a rejected function written last is kept beside its fallback",
		css: "p { color: red; color: future-color(1) }",
		body: "<p>t</p>",
		kept: ["p{color:red;color:future-color(1)}"],
		removed: [],
		browser: true
	},
	{
		label: "browser: a rejected value a valid declaration beats is dropped",
		css: "p { color: bogus; color: red }",
		body: "<p>t</p>",
		kept: ["p{color:red}"],
		removed: ["bogus"],
		browser: true
	},
	{
		label: "browser: a rejected value beaten across rules is dropped",
		css: "p { color: bogus } .a { color: red }",
		body: "<p class=\"a\">t</p>",
		kept: [".a{color:red}"],
		removed: ["bogus"],
		browser: true
	},
	{
		label: "browser: a rejected value that wins across rules is kept beside the valid loser",
		css: ".a { color: bogus } p { color: red }",
		body: "<p class=\"a\">t</p>",
		kept: [".a{color:bogus}", "p{color:red}"],
		removed: [],
		browser: true
	},
	{
		label: "browser: an important valid declaration beats a rejected value written after it",
		css: "p { color: red !important; color: bogus }",
		body: "<p>t</p>",
		kept: ["p{color:red!important}"],
		removed: ["bogus"],
		browser: true
	},
	{
		label: "browser: a rejected vendor value is dropped as dead here",
		css: "p { display: -ms-flexbox; display: flex }",
		body: "<p>t</p>",
		kept: ["p{display:flex}"],
		removed: ["-ms-flexbox"],
		browser: true
	},
	{
		label: "browser: an accepted vendor value stays and wins",
		css: "p { display: flex; display: -webkit-box }",
		body: "<p>t</p>",
		kept: ["p{display:-webkit-box}"],
		removed: ["flex"],
		browser: true
	},
	{
		label: "browser: a vendor function is asked with its arguments and kept",
		css: "p { background-image: -webkit-linear-gradient(red,blue) }",
		body: "<p>t</p>",
		kept: ["-webkit-linear-gradient(red,blue)"],
		removed: [],
		browser: true,
		asked: ["background-image:-webkit-linear-gradient(red,blue)"]
	},
	{
		label: "browser: a valid value written last still prunes what it beats",
		css: "p { color: red } p { color: blue }",
		body: "<p>t</p>",
		kept: ["p{color:blue}"],
		removed: ["red"],
		browser: true
	}
];

let failed = false;

for (const testCase of cases) {
	const page = html(testCase.body, "<style>" + testCase.css + "</style>");
	const queries = testCase.browser ? installBrowser() : null;
	const content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, removeUnusedStyles: true });
	uninstallBrowser();
	const styleText = content.substring(content.indexOf("<style>"), content.indexOf("</style>"));
	testCase.kept.forEach(fragment => check(testCase.label + ", kept " + fragment, styleText.includes(fragment), true));
	testCase.removed.forEach(fragment => check(testCase.label + ", removed " + fragment, styleText.includes(fragment), false));
	if (testCase.asked) {
		testCase.asked.forEach(query => check(testCase.label + ", asked " + query, queries.includes(query), true));
	}
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function installBrowser() {
	const queries = [];
	globalThis.CSS = {
		supports(property, value) {
			if (value === undefined) {
				return true;
			}
			queries.push(property + ":" + value);
			return BROWSER_SUPPORTS.has(property + ":" + value);
		}
	};
	return queries;
}

function uninstallBrowser() {
	delete globalThis.CSS;
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
