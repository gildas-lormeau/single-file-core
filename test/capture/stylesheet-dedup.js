// core/lib/processor-helper.js `replaceStylesheets` had zero coverage. Nothing in test/ mentioned
// inlineStylesheets or inlineStylesheetsRefs and no fixture carried duplicate <style> blocks, so the
// whole duplicate-group path was unexercised: a full green suite said nothing about a change to it.
// That was measured while prototyping the "duplicate stylesheet stored twice" fix, where 141 of 141
// checks passed with the behaviour deliberately changed.
//
// The path only exists on the archive side of the helper split, so every check here goes through
// captureArchive(). resolveStylesheetsURLs in core/index.js groups <style> elements by exact
// textContent: the last of a repeated content is the master (the first when the block declares a
// layer or an import, see the layer case below), every other copy is a ref, and only contents that
// have at least one ref become a shared file.

import { capture, captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/dedup.html";
const SHEET_URL = "https://example.com/external.css";
const SHARED = "p { color: rgb(1, 2, 3) }";
const UNIQUE = "h1 { color: rgb(9, 9, 9) }";
const OTHER = "em { color: rgb(4, 5, 6) }";
const OTHER_P = "p { color: rgb(9, 9, 9) }";

let failed = false;

// The case the fix was about: two <style> elements with identical text plus one unique. The pair
// becomes one file referenced twice, the unique one has no duplicate so it stays inline.
{
	const page = html("<h1>title</h1><p>body</p>",
		style(SHARED) + style(UNIQUE) + style(SHARED));
	const { content, resources } = await captureArchive(serve(page), { url: PAGE_URL, content: page });
	// || {} so that a regression which produces no file at all reports every check below rather than
	// throwing on the first one and hiding them
	const shared = resources.stylesheets[0] || {};
	check("the duplicated pair is stored once", resources.stylesheets.length, 1);
	check("and under the name the links point at", shared.name, "stylesheet_0.css");
	check("both copies become links to it", countMatches(content, /href="stylesheet_0\.css"/g), 2);
	check("the unique stylesheet stays inline", countMatches(content, /<style>/g), 1);
	check("and it is the unique one", content.includes("h1{color:rgb(9,9,9)}"), true);
	// the shared file is generated from the master's parsed stylesheet, not copied verbatim, so it
	// carries the same normalization every other stylesheet gets
	check("the shared file holds the processed css", shared.content, "p{color:rgb(1,2,3)}");
	check("and the page no longer holds that css inline", content.includes("rgb(1,2,3)"), false);
}

// The control. Without it a change that turned every <style> into a file would pass the checks above
// and still be wrong: three distinct sheets must produce no shared file at all.
{
	const page = html("<p>body</p>", style(SHARED) + style(UNIQUE) + style(OTHER));
	const { content, resources } = await captureArchive(serve(page), { url: PAGE_URL, content: page });
	check("three distinct sheets share nothing", resources.stylesheets.length, 0);
	check("so none of them becomes a link", countMatches(content, /rel="stylesheet"/g), 0);
	check("and all three stay inline", countMatches(content, /<style>/g), 3);
}

// Grouping is by textContent alone, so two sheets with the same css and different media are still
// one file, and each link has to carry its own media back. Losing this turns a print-only rule into
// one that applies on screen.
{
	const page = html("<p>body</p>",
		style(SHARED) + style(SHARED, "media=\"print\""));
	const { content, resources } = await captureArchive(serve(page), { url: PAGE_URL, content: page });
	check("differing media still share one file", resources.stylesheets.length, 1);
	check("the print copy keeps its media", countMatches(content, /media="print"/g), 1);
	check("and the other copy gains none", countMatches(content, /href="stylesheet_0\.css"/g), 2);
}

// A <style> can carry attributes that are not a link's own, and they are copied onto the link that
// replaces it. rel, type, href and media are the link's own and must NOT be taken from the style,
// which is what LINK_OWN_ATTRIBUTE_NAMES is for. The href here is the check that bites: a style
// element carrying one is meaningless to a browser, but if the filter ever goes the link points at
// that value instead of at the file the archive actually holds.
{
	const page = html("<p>body</p>",
		style(SHARED, "data-marker=\"kept\" href=\"wrong.css\"") + style(SHARED));
	const { content } = await captureArchive(serve(page), { url: PAGE_URL, content: page });
	check("a foreign attribute survives the swap", content.includes("data-marker=\"kept\""), true);
	check("a link-own attribute is not taken from the style", content.includes("wrong.css"), false);
	check("so both links still point at the archived file", countMatches(content, /href="stylesheet_0\.css"/g), 2);
}

// Two separate duplicate groups are numbered from the same counter and must not collide.
{
	const page = html("<p>body</p>",
		style(SHARED) + style(OTHER) + style(SHARED) + style(OTHER));
	const { content, resources } = await captureArchive(serve(page), { url: PAGE_URL, content: page });
	const names = resources.stylesheets.map(stylesheet => stylesheet.name);
	check("two groups produce two files", resources.stylesheets.length, 2);
	check("under distinct names", new Set(names).size, 2);
	check("numbered from zero", names.join(), "stylesheet_0.css,stylesheet_1.css");
	check("with a link for every copy", countMatches(content, /rel="stylesheet"/g), 4);
	check("and nothing left inline", countMatches(content, /<style>/g), 0);
}

// An external sheet is numbered from the same counter as the shared ones, and the shared ones are
// created first, before the loop over entries reaches the <link>. A collision here would make two
// different stylesheets share a name in the archive and one of them would be lost.
{
	const page = html("<p>body</p>",
		"<link rel=\"stylesheet\" href=\"external.css\">" + style(SHARED) + style(SHARED));
	const { content, resources } = await captureArchive({
		[PAGE_URL]: { body: page },
		[SHEET_URL]: { body: OTHER, contentType: "text/css" }
	}, { url: PAGE_URL, content: page });
	const names = resources.stylesheets.map(stylesheet => stylesheet.name);
	check("the shared file and the external one both exist", resources.stylesheets.length, 2);
	check("under distinct names", new Set(names).size, 2);
	check("the shared file is numbered first", names[0], "stylesheet_0.css");
	check("the external one after it", names[1], "stylesheet_1.css");
	check("and the external link points at its own file", content.includes("href=\"stylesheet_1.css\""), true);
}

// The shared file used to be generated the moment the duplicate group was found, which is before the
// loop over entries gives every imported sheet a name and rewrites the url() pointing at it. A
// duplicated <style> carrying an @import therefore froze the placeholder resolveImportURLs writes,
// and the archive kept `@import url(data:,)` with the imported css nowhere in the file. Measured on a
// local fixture at core 9318eb5: the paragraph rendered 18px tall where the page drew it 43px, while
// the plain-HTML capture of the same page was correct. The content is now generated with every other
// stylesheet, after the names exist.
{
	const importRule = "@import url(\"" + SHEET_URL + "\");";
	const page = html("<p>body</p>", style(importRule) + style(importRule));
	const { content, resources } = await captureArchive({
		[PAGE_URL]: { body: page },
		[SHEET_URL]: { body: SHARED, contentType: "text/css" }
	}, { url: PAGE_URL, content: page });
	const shared = resources.stylesheets[0] || {};
	const imported = resources.stylesheets[1] || {};
	check("a duplicated importing style keeps the sheet it imports", resources.stylesheets.length, 2);
	check("the shared file imports it by its archived name", shared.content, "@import url(stylesheet_1.css);");
	check("and that file holds the imported css", imported.content, "p{color:rgb(1,2,3)}");
	// the page itself never held the placeholder, so this has to look at the files as well or it
	// passes whatever the archive carries
	const emitted = [content, ...resources.stylesheets.map(resource => String(resource.content))];
	check("with no emptied import left anywhere", emitted.some(text => text.includes("data:,")), false);
	check("while both copies still point at the shared file", countMatches(content, /href="stylesheet_0\.css"/g), 2);
}

// The master of a repeated block used to be its first occurrence, and every later copy is a ref the
// minifier never parses, so the cascade was computed with the block at its first position only. A
// rule of the same specificity between two copies then beat the master, removeLosingDeclarations
// stripped the declaration, and every copy received that stripped text while the browser draws the
// LAST copy over the rule between. Measured on the capture harness at core 77f8ad9 with the three
// sheets below: the shared file came out empty and the page kept rgb(9,9,9). Identical copies are
// decided by the last one, so that is the master now, and the earlier refs receive the same text.
{
	const page = html("<p>body</p>", style(SHARED) + style(OTHER_P) + style(SHARED));
	const { content, resources } = await captureArchive(serve(page), { url: PAGE_URL, content: page, removeUnusedStyles: true });
	const shared = resources.stylesheets[0] || {};
	check("the last copy decides, so the shared file keeps the rule", shared.content, "p{color:rgb(1,2,3)}");
	check("and the rule between the copies is the one that loses", content.includes("rgb(9,9,9)"), false);
	check("while both copies still point at the shared file", countMatches(content, /href="stylesheet_0\.css"/g), 2);
}

// The self-contained page takes the same path through the inline helper: the refs copy the master's
// minified text, so they have to be filled after it is generated, whichever of the two comes first in
// the document. Both grouping modes are run because they fill a ref differently.
{
	const page = html("<p>body</p>", style(SHARED) + style(OTHER_P) + style(SHARED));
	const grouped = await capture(serve(page), { url: PAGE_URL, content: page, removeUnusedStyles: true, groupDuplicateStylesheets: true });
	check("a grouped self-contained page keeps the rule in its hidden copy", countMatches(grouped, /rgb\(1,2,3\)/g) >= 1, true);
	check("and drops the rule between the copies", grouped.includes("rgb(9,9,9)"), false);
	const plain = await capture(serve(page), { url: PAGE_URL, content: page, removeUnusedStyles: true, groupDuplicateStylesheets: false });
	check("an ungrouped page holds the rule in both copies", countMatches(plain, /<style>p\{color:rgb\(1,2,3\)\}<\/style>/g), 2);
	check("and drops the rule between them too", plain.includes("rgb(9,9,9)"), false);
}

// The exception: the layer order is set by the FIRST occurrence of each layer name, so a repeated
// block that declares layers keeps its first copy as master, or the minifier would order the layers
// from the last copy. Here the block puts b before a and the sheet between the copies writes into a,
// which is later, so the browser draws rgb(9,9,9). With the last copy as master the minifier would
// see a first, rank b later and keep the wrong rule.
{
	const layered = "@layer b, a; @layer b { p { color: rgb(1, 2, 3) } }";
	const between = "@layer a { p { color: rgb(9, 9, 9) } }";
	const page = html("<p>body</p>", style(layered) + style(between) + style(layered));
	const { content, resources } = await captureArchive(serve(page), { url: PAGE_URL, content: page, removeUnusedStyles: true });
	const shared = resources.stylesheets[0] || {};
	check("a block declaring layers keeps the page's layer order", content.includes("rgb(9,9,9)"), true);
	check("so the layer the block writes into still loses", String(shared.content).includes("rgb(1,2,3)"), false);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function style(content, attributes) {
	return "<style" + (attributes ? " " + attributes : "") + ">" + content + "</style>";
}

function serve(page) {
	return { [PAGE_URL]: { body: page } };
}

function countMatches(content, pattern) {
	return (content.match(pattern) || []).length;
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
