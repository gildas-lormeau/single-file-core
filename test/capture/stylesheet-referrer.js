import { capture, captureArchive, html } from "./common.js";

// A browser requests what a stylesheet references with that stylesheet as the referrer, under the
// stylesheet's own Referrer-Policy header, never the document's. Measured with the CLI in Chromium
// and Firefox on three local origins: an image in a linked sheet got the sheet's URL (or its origin
// when cross-origin), a nested @import was requested with its importer's URL, a sheet served with
// Referrer-Policy: no-referrer sent none, and under a page with <meta name=referrer content=no-referrer>
// an image of a linked sheet still got the sheet's URL. Core fetched all of them as if the document
// had referenced them, so a no-referrer page stripped the Referer that a hotlink-protected host needs.
//
// Core now passes `stylesheetURL` and `stylesheetReferrerPolicy` to the fetch for what an external
// sheet references: its images, its fonts and its imports. The browser cannot send a cross-origin
// referrer from a page's fetch, so these are for a fetch made outside the page, which the CLI does.
// What the document references itself, in a <style> or a style attribute, passes neither.

const PAGE_URL = "https://example.com/page.html";
const SHEET_URL = "https://cdn.example.net/sheet.css";
const CHILD_URL = "https://cdn.example.net/child.css";
const INLINE_CHILD_URL = "https://cdn.example.net/inline-child.css";

let failed = false;

const page = html(
	"<p class=\"sheet child inline inline-child\" style=\"background-image:url(https://img.example.org/attr.png)\">x</p>",
	"<link rel=stylesheet href=\"" + SHEET_URL + "\">" +
	"<style>@import url(" + INLINE_CHILD_URL + ");.inline{background-image:url(https://img.example.org/inline.png)}</style>");
const requests = {};
const record = name => ({ onRequest: fetchOptions => requests[name] = (fetchOptions.stylesheetURL || "none") + " " + (fetchOptions.stylesheetReferrerPolicy || "none") });
const resources = {
	[PAGE_URL]: { body: page },
	[SHEET_URL]: {
		body: "@import url(child.css);@font-face{font-family:f;src:url(font.woff2)}.sheet{font-family:f;background-image:url(https://img.example.org/sheet.png)}",
		contentType: "text/css",
		headers: { "referrer-policy": "no-referrer" },
		...record("sheet")
	},
	[CHILD_URL]: { body: ".child{background-image:url(https://img.example.org/child.png)}", contentType: "text/css", ...record("child") },
	[INLINE_CHILD_URL]: { body: ".inline-child{background-image:url(inline-child.png)}", contentType: "text/css", headers: { "referrer-policy": "origin" }, ...record("inlineChild") },
	"https://cdn.example.net/font.woff2": { body: "FONT", contentType: "font/woff2", ...record("font") },
	"https://img.example.org/sheet.png": { body: "PNG", contentType: "image/png", ...record("sheetImage") },
	"https://img.example.org/child.png": { body: "PNG", contentType: "image/png", ...record("childImage") },
	"https://img.example.org/inline.png": { body: "PNG", contentType: "image/png", ...record("inlineImage") },
	"https://cdn.example.net/inline-child.png": { body: "PNG", contentType: "image/png", ...record("inlineChildImage") },
	"https://img.example.org/attr.png": { body: "PNG", contentType: "image/png", ...record("attrImage") }
};

for (const [label, run] of [["", options => capture(resources, options)], ["archive: ", options => captureArchive(resources, options)]]) {
	for (const name of Object.keys(requests)) {
		delete requests[name];
	}
	await run({ url: PAGE_URL, content: page });
	check(label + "the linked sheet itself is the document's", requests.sheet, "none none");
	check(label + "an image of the linked sheet", requests.sheetImage, SHEET_URL + " no-referrer");
	check(label + "a font of the linked sheet", requests.font, SHEET_URL + " no-referrer");
	check(label + "an import of the linked sheet", requests.child, SHEET_URL + " no-referrer");
	check(label + "an image of that import, which has no header", requests.childImage, CHILD_URL + " none");
	check(label + "an image of an inline style is the document's", requests.inlineImage, "none none");
	check(label + "an import of an inline style is the document's", requests.inlineChild, "none none");
	check(label + "an image of that import has the import's header", requests.inlineChildImage, INLINE_CHILD_URL + " origin");
	check(label + "an image of a style attribute is the document's", requests.attrImage, "none none");
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
