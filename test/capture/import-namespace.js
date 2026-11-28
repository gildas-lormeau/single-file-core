// An `@namespace` rule applies to the whole stylesheet it is in, and it is only valid before every
// rule other than `@charset`, `@import` and `@layer` statements (css-namespaces-3, section 2). The
// inline helper pastes an imported sheet in place of its `@import`, which moves the namespace rules
// of both sheets into one sheet (SingleFile issue 1513):
//
//   - the default namespace of an imported sheet starts applying to the rules of the importing sheet,
//     which then match elements of that namespace only;
//   - the namespace rule of the importing sheet, or of a second import, lands after the rules pasted
//     before it and is ignored, so every selector using its prefix is invalid;
//   - two sheets declaring the same prefix for two namespaces end with one of the two.
//
// Measured in headless Chrome 158 with single-file-cli on a page holding the four cases below, the
// SVG namespace and `rect` elements: 6 of 6 rules applied in the page, 3 of 6 in the saved page
// (2 of 6 without the removal of unused styles).
//
// When a namespace rule is involved, each run of rules that shares the same namespace rules is now
// written in a `style` element of its own, in the order the rules had, which is the order of the
// cascade. The unit tests cannot compute styles, so they pin the sheets and their order: every
// namespace rule must be at the top of its sheet, followed only by the rules of the sheet it came
// from. A page without any namespace rule in its imports is the control: its output is one sheet,
// as before.
import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const BASE_URL = "https://example.com/";
const SVG = "http://www.w3.org/2000/svg";
const XHTML = "http://www.w3.org/1999/xhtml";
// the removal of unused styles is not the subject, and what it keeps depends on the test DOM
const OPTIONS = { removeUnusedStyles: false };

let failed = false;

// The control: no namespace rule anywhere, one sheet out, the import pasted in place.
check("without namespace rule the import is pasted in the sheet",
	await sheets("<style>@import \"a.css\"; p { color: rgb(4, 5, 6) }</style>", { "a.css": ".plain { color: rgb(1, 2, 3) }" }),
	[".plain{color:rgb(1,2,3)}p{color:rgb(4,5,6)}"]);

// A namespace rule of the importing sheet with no rule pasted before it stays valid: one sheet.
check("a namespace rule followed by nothing pasted needs no split",
	await sheets("<style>@namespace svg url(\"" + SVG + "\"); svg|rect { fill: lime }</style>", {}),
	["@namespace svg url(" + SVG + ");svg|rect{fill:lime}"]);

// The elem-6 case of the issue: the default namespace of the import must not reach the rule of the
// importing sheet.
check("the default namespace of an import stays with the rules of the import",
	await sheets("<style>@import \"c.css\"; p.case-c { background-color: lime }</style>",
		{ "c.css": "@namespace url(\"" + SVG + "\"); rect.case-c2 { fill: lime }" }),
	["@namespace url(" + SVG + ");rect.case-c2{fill:lime}", "p.case-c{background-color:lime}"]);

// The namespace rule of the importing sheet comes after its imports, so after the rules pasted.
check("the namespace rule of the importing sheet is not preceded by the rules of an import",
	await sheets("<style>@import \"a.css\"; @namespace svg url(\"" + SVG + "\"); svg|rect.case-a { fill: lime }</style>",
		{ "a.css": ".plain { color: rgb(1, 2, 3) }" }),
	[".plain{color:rgb(1,2,3)}", "@namespace svg url(" + SVG + ");svg|rect.case-a{fill:lime}"]);

// Same defect between two imports. The importing sheet has no rule of its own: no empty sheet.
check("the namespace rule of a second import is not preceded by the rules of the first",
	await sheets("<style>@import \"a.css\"; @import \"b.css\";</style>", {
		"a.css": ".plain { color: rgb(1, 2, 3) }",
		"b.css": "@namespace svg url(\"" + SVG + "\"); svg|rect.case-b { fill: lime }"
	}),
	[".plain{color:rgb(1,2,3)}", "@namespace svg url(" + SVG + ");svg|rect.case-b{fill:lime}"]);

// One prefix, two namespaces.
check("a prefix declared for two namespaces keeps both meanings",
	await sheets("<style>@import \"d.css\"; @namespace n url(\"" + XHTML + "\"); n|p.case-d { background-color: lime }</style>",
		{ "d.css": "@namespace n url(\"" + SVG + "\"); n|rect.case-d2 { fill: lime }" }),
	["@namespace n url(" + SVG + ");n|rect.case-d2{fill:lime}", "@namespace n url(" + XHTML + ");n|p.case-d{background-color:lime}"]);

// Two sheets with the same namespace rules do not need two elements.
check("consecutive sheets declaring the same namespaces share one sheet",
	await sheets("<style>@import \"b.css\"; @namespace svg url(\"" + SVG + "\"); svg|rect.case-a { fill: lime }</style>",
		{ "b.css": "@namespace svg url(\"" + SVG + "\"); svg|rect.case-b { fill: lime }" }),
	["@namespace svg url(" + SVG + ");svg|rect.case-b{fill:lime}svg|rect.case-a{fill:lime}"]);

// An import inside an import: three sheets, three sets of namespace rules, in the order of the cascade.
check("nested imports are written in cascade order",
	await sheets("<style>@import \"outer.css\"; p.last { color: rgb(7, 8, 9) }</style>", {
		"outer.css": "@import \"c.css\"; @namespace svg url(\"" + SVG + "\"); svg|rect.outer { fill: lime }",
		"c.css": "@namespace url(\"" + SVG + "\"); rect.case-c2 { fill: lime }"
	}),
	["@namespace url(" + SVG + ");rect.case-c2{fill:lime}", "@namespace svg url(" + SVG + ");svg|rect.outer{fill:lime}", "p.last{color:rgb(7,8,9)}"]);

// The conditions of an import are written around the sheet pasted, and a namespace rule inside a
// block is ignored: it goes above the blocks.
check("the namespace rule of a conditional import is written above its conditions",
	await sheets("<style>@import \"b.css\" layer(a) screen; p.last { color: rgb(7, 8, 9) }</style>",
		{ "b.css": "@namespace svg url(\"" + SVG + "\"); svg|rect.case-b { fill: lime }" }),
	["@namespace svg url(" + SVG + ");@media screen{@layer a{svg|rect.case-b{fill:lime}}}", "p.last{color:rgb(7,8,9)}"]);

// A namespace rule after a style rule is invalid in the page too: it is not moved to the top, where
// it would start to apply.
check("a namespace rule that is invalid in the page is not made valid",
	await sheets("<style>@import \"e.css\"; p.last { color: rgb(7, 8, 9) }</style>",
		{ "e.css": "rect.first { fill: lime } @namespace url(\"" + SVG + "\"); rect.second { fill: lime }" }),
	["rect.first{fill:lime}@namespace url(" + SVG + ");rect.second{fill:lime}p.last{color:rgb(7,8,9)}"]);

// A linked stylesheet goes through another function than a style element.
check("a linked stylesheet is split the same way",
	await sheets("<link rel=\"stylesheet\" href=\"linked.css\">", {
		"linked.css": "@import \"c.css\"; p.case-c { background-color: lime }",
		"c.css": "@namespace url(\"" + SVG + "\"); rect.case-c2 { fill: lime }"
	}),
	["@namespace url(" + SVG + ");rect.case-c2{fill:lime}", "p.case-c{background-color:lime}"]);

// The elements added take the media of the element they come from, and not its id.
{
	const content = await save("<style id=\"main\" media=\"screen\">@import \"c.css\"; p.case-c { background-color: lime }</style>",
		{ "c.css": "@namespace url(\"" + SVG + "\"); rect.case-c2 { fill: lime }" });
	const tags = Array.from(content.matchAll(/<style([^>]*)>/g)).map(match => match[1].trim());
	check("the added element keeps the media and drops the id", tags, ["media=\"screen\"", "id=\"main\" media=\"screen\""]);
}

// Style elements with the same text are saved once and shared (the content of the first is copied
// in the others). Each copy needs the sheets added before it as well.
{
	const style = "<style>@import \"c.css\"; p.case-c { background-color: lime }</style>";
	check("identical style elements each get the sheets added",
		await sheets(style + style, { "c.css": "@namespace url(\"" + SVG + "\"); rect.case-c2 { fill: lime }" }),
		["@namespace url(" + SVG + ");rect.case-c2{fill:lime}", "p.case-c{background-color:lime}",
			"@namespace url(" + SVG + ");rect.case-c2{fill:lime}", "p.case-c{background-color:lime}"]);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function sheets(head, stylesheets) {
	const content = await save(head, stylesheets);
	return Array.from(content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)).map(match => match[1]);
}

async function save(head, stylesheets) {
	const page = html("<p>body</p>", head);
	const pageResources = { [PAGE_URL]: { body: page } };
	Object.keys(stylesheets).forEach(name => pageResources[BASE_URL + name] = { body: stylesheets[name], contentType: "text/css" });
	return capture(pageResources, { ...OPTIONS, url: PAGE_URL, content: page });
}

function check(label, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(actual)}${ok ? "" : " (expected " + JSON.stringify(expected) + ")"}`);
	failed ||= !ok;
}
