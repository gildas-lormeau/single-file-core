// A stylesheet the page's scripts modified is read back through cssText, since its source text no
// longer says what the browser applies. Firefox clamps a media feature value above the largest float
// to infinity and serializes it as `(max-width: infinity * 1px)`, which no browser parses, so every
// rule under such a query was dead in the saved page: liberation.fr's styled-components breakpoints
// end with an open-ended `max-width`, and the saved page lost the wide-viewport column gaps, which
// widened the columns and their photos. Measured on 2026-10-20 with the CLI in Firefox; Chrome
// serializes the same query as `3.40282e+38px`, which round-trips. The serialization is normalized
// to that largest finite value where core reads it, for a style element and for an adopted sheet.
import { helper } from "./common.js";

let failed = false;

check("an open-ended max-width is written as the largest finite length",
	helper.normalizeSerializedCSSText("@media (min-width: 1px) and (max-width: infinity * 1px) {\n  .a { color: red; }\n}"),
	"@media (min-width: 1px) and (max-width: 3.40282e38px) {\n  .a { color: red; }\n}");
check("a negative infinity keeps its sign",
	helper.normalizeSerializedCSSText("@media (min-width: -infinity * 1px) { .a { color: red; } }"),
	"@media (min-width: -3.40282e38px) { .a { color: red; } }");
check("the unit is kept",
	helper.normalizeSerializedCSSText("@media (max-height: infinity * 1em) { .a { color: red; } }"),
	"@media (max-height: 3.40282e38em) { .a { color: red; } }");
check("range syntax is handled",
	helper.normalizeSerializedCSSText("@media (width <= infinity * 1px) { .a { color: red; } }"),
	"@media (width <= 3.40282e38px) { .a { color: red; } }");
check("a container query is handled like a media query",
	helper.normalizeSerializedCSSText("@container (max-width: infinity * 1px) { .a { color: red; } }"),
	"@container (max-width: 3.40282e38px) { .a { color: red; } }");
check("control: a calc() in a declaration is left alone",
	helper.normalizeSerializedCSSText(".a { width: calc(infinity * 1px); }"),
	".a { width: calc(infinity * 1px); }");
check("control: a finite feature value is left alone",
	helper.normalizeSerializedCSSText("@media (max-width: 3.40282e38px) { .a { color: red; } }"),
	"@media (max-width: 3.40282e38px) { .a { color: red; } }");

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
