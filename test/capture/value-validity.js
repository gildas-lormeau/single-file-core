import { capture, html } from "./common.js";
import * as cssTree from "../../vendor/css-tree.js";

const PAGE_URL = "https://example.com/page.html";

// every css-tree update learns properties (3.2.1 learned text-box-trim, which this suite used), so
// the "unknown property" case takes the first of these the vendored dictionary still has no entry for
const UNKNOWN_PROPERTY = ["view-transition-group", "row-rule", "scroll-start", "item-flow", "masonry"].find(property => {
	const match = cssTree.lexer.matchProperty(property, cssTree.parse("none", { context: "value" }));
	return match.error && match.error.name === "SyntaxReferenceError";
});

// A declaration's value now gets one of three verdicts before it enters the cascade. Valid: the
// browser accepts it, it competes and prunes. Invalid: dropped outright. Unknown: the browser
// rejects it, so it may be a typo, syntax newer than this browser, or a prefix another engine
// reads, and telling them apart is impossible; it is kept, never prunes what it would beat, and is
// itself dropped only when a valid declaration beats it. A rejected vendor value used to be
// invalid, "dead here", so a page saved in Chrome lost its -moz- values for Firefox, and a
// dashed ident, which starts with "-" too, went with them. Before, an identifier or a function was
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
		label: "lexer: a property the lexer does not know (" + UNKNOWN_PROPERTY + ") keeps both declarations",
		css: "p { " + UNKNOWN_PROPERTY + ": none; " + UNKNOWN_PROPERTY + ": normal }",
		body: "<p>t</p>",
		kept: [UNKNOWN_PROPERTY + ":none;" + UNKNOWN_PROPERTY + ":normal"],
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
		label: "browser: a rejected vendor value is kept for the browsers that read it",
		css: "p { display: flex; display: -ms-flexbox }",
		body: "<p>t</p>",
		kept: ["p{display:flex;display:-ms-flexbox}"],
		removed: [],
		browser: true
	},
	{
		label: "browser: a rejected vendor value a valid one beats is still dropped",
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
	// A value named with a dashed ident was the worst hit: a custom function from `@function`, or the
	// timeline, anchor or palette a property names. Firefox saved `width: --double(50px)` as nothing,
	// and the page lost the width in Chrome, which renders it.
	{
		label: "browser: a rejected custom function is kept",
		css: "p { width: --double(50px) }",
		body: "<p>t</p>",
		kept: ["p{width:--double(50px)}"],
		removed: [],
		browser: true
	},
	{
		label: "browser: a rejected dashed identifier is kept",
		css: "p { animation-timeline: --scroller }",
		body: "<p>t</p>",
		kept: ["p{animation-timeline:--scroller}"],
		removed: [],
		browser: true
	},
	{
		label: "lexer: a custom function the dictionary cannot know is kept",
		css: "p { width: --double(50px) }",
		body: "<p>t</p>",
		kept: ["p{width:--double(50px)}"],
		removed: []
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
