// Specificity as computed for removeUnusedStyles, against the 43 selector examples of MDN's
// Specificity guide (https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Specificity, read
// 2026-10-04) and against Selectors 4 and CSS Scoping for the cases the guide does not show. Three of
// those were wrong until then: a legacy single-colon pseudo-element (:before, :after, :first-line,
// :first-letter) counted as a pseudo-class, :host() and :host-context() ignored their argument, and
// ::slotted() took the larger of itself and its argument instead of their sum. None of them changed a
// save, because pseudo-element and shadow-host selectors never enter an element's cascade in the pass
// (css-corpus/tmp-aster/specificity/ renders the same before and after in Chromium, Firefox and WebKit),
// but the values are now the ones the specs give.
import * as cssTree from "../../vendor/css-tree.js";
import { computeMaxSpecificity } from "../../modules/css-specificity.js";

const MDN_EXAMPLES = [
	["#example", "1-0-0"], [".myClass", "0-1-0"], ["[type=\"radio\"]", "0-1-0"], ["[lang|=\"fr\"]", "0-1-0"],
	[":hover", "0-1-0"], [":nth-of-type(3n)", "0-1-0"], [":required", "0-1-0"], ["p", "0-0-1"],
	["::before", "0-0-1"], ["::placeholder", "0-0-1"], ["*", "0-0-0"], [":where(p)", "0-0-0"],
	["input:focus", "0-1-1"], [":root #myApp input:required", "1-2-1"],
	[".bodyClass .sectionClass .parentClass [id=\"myElement\"]", "0-4-0"], ["#myApp [id=\"myElement\"]", "1-1-0"],
	[":root input", "0-1-1"], ["html body main input", "0-0-4"], ["input.myClass", "0-1-1"], [":is(p)", "0-0-1"],
	["h2:nth-last-of-type(n + 2)", "0-1-1"], ["h2:has(~ h2)", "0-0-2"], ["div.outer p", "0-1-2"],
	["div:not(.inner) p", "0-1-2"], [":is(p, #fakeId)", "1-0-0"], ["h1:has(+ h2, > #fakeId)", "1-0-1"],
	["p:not(#fakeId)", "1-0-1"], ["div:not(.inner, #fakeId) p", "1-0-2"], ["a:not(#fakeId#fakeId#fakeID)", "3-0-1"],
	["#myContent h1", "1-0-1"], ["[id=\"myContent\"] h1", "0-1-1"], [":where(#myContent) h1", "0-0-1"],
	["#myId#myId#myId span", "3-0-1"], [".myClass.myClass.myClass span", "0-3-1"],
	[":not(#fakeID#fakeId#fakeID) span", "3-0-1"], [":is(#fakeID#fakeId#fakeID, span)", "3-0-0"],
	[":where(#defaultTheme) a", "0-0-1"], ["footer a", "0-0-2"], ["#myContent input.myClass", "1-1-1"],
	["input[type=\"password\"]:required", "0-2-1"], ["[id=\"myElement\"] input.myClass", "0-2-1"],
	["body h1", "0-0-2"], [":scope img", "0-1-1"]
];
const SPEC_CASES = [
	["p:before", "0-0-2"], ["p:after", "0-0-2"], ["p:first-line", "0-0-2"], ["p:first-letter", "0-0-2"],
	["p:BEFORE", "0-0-2"], ["p::after", "0-0-2"], [":host", "0-1-0"], [":host(.a)", "0-2-0"], [":HOST(.a)", "0-2-0"],
	[":host(.a#b)", "1-2-0"], [":host-context(.a #b)", "1-2-0"], ["::slotted(.a)", "0-1-1"], ["::slotted(span.a)", "0-1-2"],
	[":host ::slotted(*)", "0-1-1"], ["::part(label)", "0-0-1"], ["::part(label):hover", "0-1-1"],
	["li:nth-child(2 of .x)", "0-2-1"], ["li:nth-last-child(odd of #a)", "1-1-1"], [":nth-of-type(2)", "0-1-0"],
	["::view-transition-group(*)", "0-0-1"], ["::highlight(x)", "0-0-1"], [":not(*)", "0-0-0"],
	["*|p", "0-0-1"], ["svg|rect", "0-0-1"], ["p:-webkit-autofill", "0-1-1"], ["p::-webkit-scrollbar", "0-0-2"]
];

let failed = false;

[...MDN_EXAMPLES, ...SPEC_CASES].forEach(([selector, expected]) => check(selector, getSpecificity(selector), expected));

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function getSpecificity(selector) {
	const { a, b, c } = computeMaxSpecificity(cssTree.parse(selector, { context: "selector" }));
	return a + "-" + b + "-" + c;
}

function check(label, actual, expected) {
	const pass = actual == expected;
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + actual);
	if (!pass) {
		console.log("     expected: " + expected);
		failed = true;
	}
}
