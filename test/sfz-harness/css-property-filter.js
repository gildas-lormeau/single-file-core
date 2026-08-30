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
import { isUnsupportedPropertyValue } from "../../modules/css-rules-minifier.js";

// valid declarations whose property the vendored css-tree does not know. Every one of these was
// deleted before the fix. The SVG paint-server and filter properties are the ones that matter in
// practice; the last two are here as the moving target — any property newer than the vendored
// dictionary lands in this bucket, and the list will keep growing
const MUST_KEEP = [
	["stop-color", "#2a78d6"],
	["stop-opacity", ".20"],
	["stop-opacity", "0"],
	["flood-color", "red"],
	["flood-opacity", "0.5"],
	["lighting-color", "white"],
	["text-box-trim", "trim-both"],
	["corner-shape", "squircle"]
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
const unknownProperty = cssTree.lexer.matchProperty("stop-opacity", cssTree.parse("0", { context: "value" }));
const wrongValue = cssTree.lexer.matchProperty("margin-trim", cssTree.parse("block", { context: "value" }));
check("unknown property reports SyntaxReferenceError", unknownProperty.error && unknownProperty.error.name, "SyntaxReferenceError");
check("wrong value reports SyntaxMatchError", wrongValue.error && wrongValue.error.name, "SyntaxMatchError");

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
} else {
	console.log("PASSED");
}
