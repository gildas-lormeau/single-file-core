// core/lib/processor-helper.js `replaceStylesheets` had zero coverage. Nothing in test/ mentioned
// inlineStylesheets or inlineStylesheetsRefs and no fixture carried duplicate <style> blocks, so the
// whole duplicate-group path was unexercised: a full green suite said nothing about a change to it.
// That was measured while prototyping the "duplicate stylesheet stored twice" fix, where 141 of 141
// checks passed with the behaviour deliberately changed.
//
// The path only exists on the archive side of the helper split, so every check here goes through
// captureArchive(). resolveStylesheetsURLs in core/index.js groups <style> elements by exact
// textContent: the first of a repeated content is the master and every later one is a ref, and only
// contents that have at least one ref become a shared file.

import { captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/dedup.html";
const SHARED = "p { color: rgb(1, 2, 3) }";
const UNIQUE = "h1 { color: rgb(9, 9, 9) }";
const OTHER = "em { color: rgb(4, 5, 6) }";

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

// Two separate duplicate groups are numbered from the same counter and must not collide, which is
// the closest this harness can get to the numbering question. A fixture mixing these with an
// external <link rel=stylesheet> would cover it better, but core reads element.rel and element.href
// and deno-dom implements neither, so such a fixture throws in resolveHrefs before reaching the
// helper at all. See dom.js for why href in particular is not shimmed.
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
