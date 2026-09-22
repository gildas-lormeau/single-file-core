// The CSS-removal option runs every declaration through css-tree's lexer and drops the ones it
// judges invalid. css-tree reports two different failures the same way — a real value mismatch
// (SyntaxMatchError) and a property it simply has no entry for (SyntaxReferenceError) — so the
// original `!matchProperty(...).matched` deleted valid declarations whose property is missing from
// the vendored dictionary. That silently flattened every CSS-defined SVG gradient: stop-opacity was
// dropped, both stops became opaque, and the gradient rendered as a solid block. It hid for a long
// time because stop-color survived alongside it — a var() value takes a different branch and is
// never handed to the lexer at all, so the colour was right and only the fade was gone.
//
// The rule this pins: unknown must fail open. A dropped valid declaration breaks rendering; a kept
// invalid one is ignored by the browser.
import * as cssTree from "../../vendor/css-tree.js";
import { isUnsupportedPropertyValue, getValueValidity, VALIDITY_VALID, VALIDITY_UNKNOWN, VALIDITY_INVALID } from "../../modules/css-rules-minifier.js";

// the moving target: every css-tree update learns properties (3.2.1 learned stop-opacity,
// text-box-trim and corner-shape, which earlier versions of this file relied on), so the checks
// about a property the dictionary does not know take the first of these it still has no entry for
const UNKNOWN_PROPERTY = ["view-transition-group", "row-rule", "scroll-start", "item-flow", "masonry"].find(property => {
	const match = cssTree.lexer.matchProperty(property, cssTree.parse("none", { context: "value" }));
	return match.error && match.error.name === "SyntaxReferenceError";
});

// valid declarations whose property the vendored css-tree did not know when the fix was written.
// Every one of these was deleted before the fix. The SVG paint-server and filter properties are the
// ones that mattered in practice; css-tree has since learned them, and they stay here because a
// valid value of a known property must be kept as well
const MUST_KEEP = [
	["stop-color", "#2a78d6"],
	["stop-opacity", ".20"],
	["stop-opacity", "0"],
	["flood-color", "red"],
	["flood-opacity", "0.5"],
	["lighting-color", "white"],
	["text-box-trim", "trim-both"],
	["corner-shape", "squircle"],
	[UNKNOWN_PROPERTY, "none"]
];

// declarations css-tree knows and correctly rejects. These keep the filter honest: the fix must not
// turn the check off, only stop it firing on properties css-tree has never heard of
const MUST_DROP = [
	["margin-trim", "block"],
	["opacity", "not-a-number"],
	["color", "12px"]
];

// properties close enough to the broken ones to be worth stating outright, because they are the
// reason the bug looked like an SVG quirk rather than a dictionary gap: css-tree does know these,
// so gradients that used them were unaffected and the failure looked arbitrary
const KNOWN_GOOD = [
	["fill-opacity", "0.5"],
	["stroke-opacity", "0.5"],
	["fill", "red"],
	["vector-effect", "non-scaling-stroke"]
];

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

function isDropped(property, declaration) {
	return isUnsupportedPropertyValue(property, cssTree.parse(declaration, { context: "value" }));
}

for (const [property, declaration] of MUST_KEEP) {
	check(`kept: ${property}: ${declaration}`, isDropped(property, declaration), false);
}

for (const [property, declaration] of MUST_DROP) {
	check(`dropped: ${property}: ${declaration}`, isDropped(property, declaration), true);
}

for (const [property, declaration] of KNOWN_GOOD) {
	check(`kept: ${property}: ${declaration}`, isDropped(property, declaration), false);
}

// the distinction the fix rests on. If a css-tree upgrade ever collapses these two error types into
// one, the predicate above cannot tell "unknown" from "wrong" any more and needs rewriting rather
// than adjusting
check("a property the dictionary does not know is left to test with", UNKNOWN_PROPERTY !== undefined, true);
const unknownProperty = cssTree.lexer.matchProperty(UNKNOWN_PROPERTY, cssTree.parse("none", { context: "value" }));
const wrongValue = cssTree.lexer.matchProperty("margin-trim", cssTree.parse("block", { context: "value" }));
check("unknown property (" + UNKNOWN_PROPERTY + ") reports SyntaxReferenceError", unknownProperty.error && unknownProperty.error.name, "SyntaxReferenceError");
check("wrong value reports SyntaxMatchError", wrongValue.error && wrongValue.error.name, "SyntaxMatchError");

// The same failure as above, one step earlier and on VALUES rather than properties. Before the fix
// the call site dropped any single-identifier value beginning with "-", asking nothing: the test
// for a dead `display:-ms-flexbox` also deleted a live `display:-webkit-box`. That one costs more
// than it looks, because `-webkit-line-clamp` does nothing without it and both of ITS declarations
// survive — being unknown properties, they already fail open — so the rule keeps a clamp it no
// longer applies. Four of the five sites in a fifteen-site sweep that use line-clamp were affected;
// on one of them 80 headlines each grew a line and the page moved 150px.
//
// CSS.supports is the authority and Deno has none, so it is stubbed here. That is also the point of
// the last group: with no browser to ask, this must KEEP, which is the same fail-open rule as above.
//
// The verdict has three values. A value the browser accepts is valid and takes part in the cascade.
// A vendor-prefixed value it rejects is invalid and dropped. Any other value it rejects is unknown:
// it may be a typo or syntax newer than this browser, and telling the two apart is impossible, so
// it is kept but never allowed to prune the declaration it would beat, which is how
// `color: red; color: future-color(1)` stops losing its fallback. The browser is asked with the
// whole value, since a function name alone, `-webkit-linear-gradient`, is rejected by every browser.
const CHROME_SUPPORTS = new Set(["display:-webkit-box", "display:-webkit-inline-box", "-webkit-box-orient:vertical", "background-image:-webkit-linear-gradient(red,blue)"]);
const originalCSS = globalThis.CSS;
globalThis.CSS = { supports: (property, value) => CHROME_SUPPORTS.has(property + ":" + value) };
try {
	// alive in this browser, and load-bearing
	check("vendor value kept: display: -webkit-box", validity("display", "-webkit-box"), VALIDITY_VALID);
	check("vendor value kept: display: -webkit-inline-box", validity("display", "-webkit-inline-box"), VALIDITY_VALID);
	check("vendor function kept with its arguments: -webkit-linear-gradient(red,blue)", validity("background-image", "-webkit-linear-gradient(red,blue)"), VALIDITY_VALID);
	// dead in this browser, and the reason the check exists at all — the fix must not disable it
	check("vendor value dropped: display: -ms-flexbox", validity("display", "-ms-flexbox"), VALIDITY_INVALID);
	check("vendor value dropped: display: -moz-box", validity("display", "-moz-box"), VALIDITY_INVALID);
	// not vendor-prefixed and rejected, so the verdict must stay open
	check("non-vendor value unknown: display: flex", validity("display", "flex"), VALIDITY_UNKNOWN);
	check("non-vendor value unknown: color: nonsense", validity("color", "nonsense"), VALIDITY_UNKNOWN);
	check("non-vendor function unknown: color: future-color(1)", validity("color", "future-color(1)"), VALIDITY_UNKNOWN);
} finally {
	globalThis.CSS = originalCSS;
}
// with no browser to ask, the lexer decides and a vendor value it does not know stays open
check("no browser to ask keeps the vendor value", validity("display", "-ms-flexbox"), VALIDITY_UNKNOWN);
check("no browser to ask still drops a value the lexer rejects", validity("color", "nonsense"), VALIDITY_INVALID);
check("no browser to ask keeps an unknown property (" + UNKNOWN_PROPERTY + ")", validity(UNKNOWN_PROPERTY, "none"), VALIDITY_UNKNOWN);
check("no browser to ask keeps a var() value as valid", validity("color", "var(--x, red)"), VALIDITY_VALID);
check("a broken escape is invalid everywhere", validity("color", "re\\d"), VALIDITY_INVALID);

function validity(property, declaration) {
	return getValueValidity(property, cssTree.parse(declaration, { context: "value" }));
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
} else {
	console.log("PASSED");
}
