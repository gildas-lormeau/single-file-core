// An @import'ed stylesheet used to be inserted into the stylesheets map AFTER its own fetch, and the
// imports of one sheet are resolved under Promise.all, so the map held them in completion order.
// replaceStylesheets names archive entries stylesheet_<n>.css by walking that map, and the name goes
// into the url() the page reads, so two captures of one unchanged page could disagree about which
// file is which. Measured before the fix on the pair below: with the first import slow, the page read
// url(stylesheet_0.css) then url(stylesheet_1.css) and stylesheet_0.css held the FIRST sheet; with
// the second one slow, the page read url(stylesheet_1.css) then url(stylesheet_0.css) and
// stylesheet_0.css held the second.
//
// The entry is now inserted before the fetch, which is what a top-level <style> or <link> already
// did, so the map is in document order however the fetches resolve. A nested import lands after its
// parent for the same reason, where it used to land before it.
//
// The checks below assert the contents each url() resolves to rather than the numbers, because the
// numbering itself is implementation-defined: what the page must never lose is which file its first
// import means.
import { captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const FIRST_URL = "https://example.com/first.css";
const SECOND_URL = "https://example.com/second.css";
const NESTED_URL = "https://example.com/nested.css";

const FIRST_CSS = "p{color:rgb(1,1,1)}";
const SECOND_CSS = "p{color:rgb(2,2,2)}";
const NESTED_CSS = "p{color:rgb(3,3,3)}";
const DELAY = 200;

const TWO_IMPORTS = html("<p>text</p>", "<style>@import url(\"" + FIRST_URL + "\");@import url(\"" + SECOND_URL + "\");</style>");
const NESTED_IMPORT = html("<p>text</p>", "<style>@import url(\"" + FIRST_URL + "\");</style>");

let failed = false;

// One sheet is served late, everything else answers in the same microtask. Both directions are run:
// either one alone is passed by numbering in completion order, since completion order and document
// order agree whenever the first import happens to arrive first.
{
	const slowFirst = await capture(TWO_IMPORTS, { [FIRST_URL]: FIRST_CSS, [SECOND_URL]: SECOND_CSS }, FIRST_URL);
	const slowSecond = await capture(TWO_IMPORTS, { [FIRST_URL]: FIRST_CSS, [SECOND_URL]: SECOND_CSS }, SECOND_URL);
	check("a slow first import still reads its own sheet first", resolveImports(slowFirst), [FIRST_CSS, SECOND_CSS]);
	check("and a slow second import does not renumber them", resolveImports(slowSecond), [FIRST_CSS, SECOND_CSS]);
	check("the two pages are identical", slowFirst.content == slowSecond.content, true);
	check("and so are the files they carry", [...slowFirst.files], [...slowSecond.files]);
	check("with one file per imported sheet", slowFirst.files.size, 2);
}

// A nested import is fetched inside its parent's own fetch, so it used to be inserted into the map
// before the parent it belongs to. Its contents must survive that reordering.
{
	const nestedCSS = "@import url(\"" + NESTED_URL + "\");" + FIRST_CSS;
	const slowParent = await capture(NESTED_IMPORT, { [FIRST_URL]: nestedCSS, [NESTED_URL]: NESTED_CSS }, FIRST_URL);
	const slowChild = await capture(NESTED_IMPORT, { [FIRST_URL]: nestedCSS, [NESTED_URL]: NESTED_CSS }, NESTED_URL);
	check("the page's import resolves to the sheet holding the nested one", resolveImports(slowParent)[0].endsWith(FIRST_CSS), true);
	check("whose own import resolves to the nested sheet", nestedContent(slowParent), NESTED_CSS);
	check("and it does whichever of the two is slow", nestedContent(slowChild), NESTED_CSS);
	check("with the same files either way", [...slowParent.files], [...slowChild.files]);
}

if (failed) {
	Deno.exit(1);
}

async function capture(page, sheets, slowURL) {
	const resources = { [PAGE_URL]: { body: page } };
	Object.keys(sheets).forEach(url => {
		resources[url] = { body: sheets[url], contentType: "text/css", delay: url == slowURL ? DELAY : 0 };
	});
	const pageData = await captureArchive(resources, { url: PAGE_URL, content: page, compressContent: true });
	const files = new Map(pageData.resources.stylesheets.map(resource => [resource.name, resource.content.trim()]));
	return { content: pageData.content, files };
}

// what the page's own import list resolves to, in the order the page declares it
function resolveImports({ content, files }) {
	return importNames(content).map(name => files.get(name));
}

function nestedContent({ files }) {
	const parent = [...files.values()].find(sheet => sheet.includes("@import"));
	return parent ? files.get(importNames(parent)[0]) : null;
}

function importNames(content) {
	return [...content.matchAll(/@import url\(([^)]*)\)/g)].map(match => match[1].replace(/^["']|["']$/g, ""));
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
