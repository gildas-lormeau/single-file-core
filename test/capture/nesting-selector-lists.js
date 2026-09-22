import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// The nesting selector stands for the parent rule's whole selector list wrapped in :is(), both for
// matching and for specificity (CSS Nesting §4). The unused-styles pass used to substitute one parent
// alternative at a time into every `&` of a nested selector, so `.a, .b { & + & {} }` was queried as
// `.a + .a` and `.b + .b`, never as the `.a + .b` the browser matches, and the rule was removed. And
// pruning an unmatched alternative from a parent list lowered the specificity of every rule nested
// in it: `#absent, .box { p {} }` became `.box { p {} }`, (0,1,1) instead of (1,0,1), and a later
// `.box p` won in the saved page where it lost live. The pass now builds `:is(parent list)` once per
// prelude, drops a parent alternative with a pseudo-element from it as the spec does, computes the
// nested specificity from that text, matches relative nested selectors, and keeps an unmatched
// parent alternative whose specificity exceeds every kept one.
const cases = [
	{
		label: "a nested selector with two nesting selectors matches across the parent list",
		css: ".a, .b { & + & { color: red } }",
		body: "<p class=\"a\">a</p><p class=\"b\">b</p>",
		kept: [".a,.b{&+&{color:red}}"],
		removed: []
	},
	{
		label: "an unmatched parent alternative more specific than the kept ones stays, and the nested rule keeps its specificity",
		css: "#absent, .box { p { color: red } } .box p { color: blue }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: ["#absent,.box{p{color:red}}"],
		removed: ["blue"]
	},
	{
		label: "an unmatched parent alternative no more specific than a kept one is removed",
		css: ".absent, #box { p { color: red } }",
		body: "<div id=\"box\"><p>t</p></div>",
		kept: ["#box{p{color:red}}"],
		removed: [".absent"]
	},
	{
		label: "an unmatched parent alternative of a rule without nested rules is removed whatever its specificity",
		css: "#absent, .box { color: red }",
		body: "<div class=\"box\">t</div>",
		kept: [".box{color:red}"],
		removed: ["#absent"]
	},
	{
		label: "the spec example: the nesting selector takes the largest specificity of the parent list",
		css: "#a, b { & c { color: blue } } .foo c { color: red }",
		body: "<b class=\"foo\"><c>t</c></b>",
		kept: ["#a,b{& c{color:blue}}"],
		removed: ["red"]
	},
	{
		label: "a relative nested selector is matched and removed when nothing matches it",
		css: ".box { > p { color: red } > span { color: blue } }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: [".box{>p{color:red}}"],
		removed: ["span"]
	},
	{
		label: "a relative nested selector that matches prunes the declaration it beats",
		css: "p { color: blue } .box { > p { color: red } }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: [".box{>p{color:red}}"],
		removed: ["blue"]
	},
	{
		label: "three levels of lists match without enumerating the combinations, and the unmatched alternatives of equal specificity go",
		css: ".a1, .a2 { .b1, .b2 { .c1, .c2 { color: red } } }",
		body: "<div class=\"a2\"><div class=\"b1\"><p class=\"c2\">t</p></div></div>",
		kept: [".a2{.b1{.c2{color:red}}}"],
		removed: [".a1", ".b2", ".c1"]
	},
	{
		label: "a nesting selector in the middle level compounds with the parent",
		css: ".a { &.b { p { color: red } } }",
		body: "<div class=\"a b\"><p>t</p></div>",
		kept: [".a{&.b{p{color:red}}}"],
		removed: []
	},
	{
		label: "a nesting selector in the middle level that matches nothing removes the nested rule",
		css: ".a { &.b { p { color: red } } }",
		body: "<div class=\"a\"><p>t</p></div>",
		kept: [],
		removed: ["red"]
	},
	{
		label: "a parent alternative with a pseudo-element is left out of the nesting selector",
		css: ".foo, .foo::before { &:hover { color: red } }",
		body: "<p class=\"foo\">t</p>",
		kept: [".foo,.foo::before{&:hover{color:red}}"],
		removed: []
	},
	{
		label: "a parent with a state pseudo-class still reaches its nested rules",
		css: "p { color: blue } .a:hover, .b { & p { color: red } }",
		body: "<div class=\"a\"><p>t</p></div>",
		kept: ["p{color:blue}", ".a:hover{& p{color:red}}"],
		removed: [".b"]
	},
	{
		label: "a nesting selector after a complex parent is matched",
		css: ".box p { .outer & { color: red } }",
		body: "<div class=\"outer\"><div class=\"box\"><p>t</p></div></div>",
		kept: [".box p{.outer &{color:red}}"],
		removed: []
	},
	{
		label: "a nested rule starting with a type selector and a pseudo-class, which css-tree reads as a declaration, is a rule",
		css: "#absent, .nav { a:hover { color: red } span:hover { color: blue } }",
		body: "<div class=\"nav\"><a>t</a></div>",
		kept: ["#absent,.nav{a:hover{color:red}}"],
		removed: ["span"]
	},
	{
		label: "a parent emptied by the removal of its nested rule is removed too",
		css: ".absent, .box { p { color: red } } .box p { color: green }",
		body: "<div class=\"box\"><p>t</p></div>",
		kept: [".box p{color:green}"],
		removed: [".box{}", "red"]
	},
	{
		label: "a nesting selector inside :not() is substituted too",
		css: ".a, .b { p:not(&) { color: red } }",
		body: "<div class=\"a\"><p>t</p></div>",
		kept: [".a{p:not(&){color:red}}"],
		removed: [".b"]
	}
];

let failed = false;

for (const testCase of cases) {
	const page = html(testCase.body, "<style>" + testCase.css + "</style>");
	const content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, removeUnusedStyles: true });
	const styleText = content.substring(content.indexOf("<style>"), content.indexOf("</style>"));
	const failedBefore = failed;
	testCase.kept.forEach(fragment => check(testCase.label + ", kept " + fragment, styleText.includes(fragment), true));
	testCase.removed.forEach(fragment => check(testCase.label + ", removed " + fragment, styleText.includes(fragment), false));
	if (failed && !failedBefore) {
		console.log("     saved: " + styleText);
	}
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
