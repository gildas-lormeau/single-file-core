// The option `applyPrintStylesheets` saves a page the way it would be printed: the saved page shows
// on screen the layout the site wrote for paper, which on article sites is the text without the
// navigation and the ads (SingleFile#1567). A saved page is always read on a screen, so the rules
// cannot be left as they are: every media query is rewritten for a reader whose medium is "print".
//
// The truth table, with P the answer the query gives when the page is printed:
//   print              P = true   -> all
//   only print and (c) P = c      -> all and (c)
//   not print          P = false  -> not all
//   not print and (c)  P = not c  -> not all and (c)   ("not" negates the whole query)
//   screen, with or without a condition
//                      P = false  -> not all           (the condition must go: "not all and (c)"
//                                                       would mean "not c" and match)
//   not screen, with or without a condition
//                      P = true   -> all
//   no type, all, or another type: unchanged, they answer the same on paper and on a screen.
//
// A rule or a stylesheet whose every query has become "not all" can never apply and is removed whole.
// The archive helper keeps stylesheets as separate files and is driven by captureArchive().
import { capture, captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const SHEET_URL = "https://example.com/sheet.css";
const IMPORT_URL = "https://example.com/imported.css";
const RULE = "p{color:rgb(1,2,3)}";

let failed = false;

// The control: without the option nothing is rewritten, so every check below is the option's doing.
check("without the option a print rule is left alone", await style("@media print{" + RULE + "}", {}), "@media print{" + RULE + "}");

check("a print rule applies everywhere", await style("@media print{" + RULE + "}"), "@media all{" + RULE + "}");
check("the type is matched whatever its case", await style("@media PRINT{" + RULE + "}"), "@media all{" + RULE + "}");
check("only print keeps its condition and loses the keyword", await style("@media only print and (min-width:10cm){" + RULE + "}"), "@media all and (min-width:10cm){" + RULE + "}");
check("not print with a condition stays a negation of the condition", await style("@media not print and (color){" + RULE + "}"), "@media not all and (color){" + RULE + "}");
check("not screen applies everywhere", await style("@media not screen{" + RULE + "}"), "@media all{" + RULE + "}");
check("not screen with a condition applies everywhere, without the condition", await style("@media not screen and (color){" + RULE + "}"), "@media all{" + RULE + "}");
check("a query without a type is left alone", await style("@media (max-width:600px){" + RULE + "}"), "@media (max-width:600px){" + RULE + "}");
check("another type is left alone", await style("@media not speech{" + RULE + "}"), "@media not speech{" + RULE + "}");

// What can never apply on paper is removed, whole rules only. A screen rule with a condition is the
// case a naive replacement of the type gets wrong: it would turn into a rule that matches.
check("a screen rule is removed", await style("@media screen{" + RULE + "}a{color:red}"), "a{color:red}");
check("a screen rule with a condition is removed", await style("@media only screen and (min-width:600px){" + RULE + "}a{color:red}"), "a{color:red}");
check("not print is removed", await style("@media not print{" + RULE + "}a{color:red}"), "a{color:red}");
check("a list keeps the queries that can apply", await style("@media screen,print and (color){" + RULE + "}"), "@media not all,all and (color){" + RULE + "}");
check("a screen rule nested in another rule is removed", await style("@supports (display:grid){@media screen{" + RULE + "}a{color:red}}"), "@supports (display:grid){a{color:red}}");

// The media of an element, and of an import, are queries too.
check("a print style element applies everywhere", await element("<style media=\"print\">" + RULE + "</style>"), "<style media=\"all\">" + RULE + "</style>");
check("a screen style element is removed", await element("<style media=\"screen\">" + RULE + "</style><style>a{color:red}</style>"), "<style>a{color:red}</style>");
check("a print import is pasted in for every medium", await style("@import url(\"" + IMPORT_URL + "\") print;"), "@media all{" + RULE + "}");
check("a screen import brings nothing", await style("@import url(\"" + IMPORT_URL + "\") screen;a{color:red}"), "a{color:red}");

// The archive helper: the link elements stay, with the stylesheets beside the page.
const archive = await captureArchive({
	[PAGE_URL]: { body: page("<link rel=\"stylesheet\" media=\"print\" href=\"" + SHEET_URL + "\"><link rel=\"stylesheet\" media=\"screen\" href=\"" + SHEET_URL + "?screen\">") },
	[SHEET_URL]: { body: "@media screen{a{color:red}}" + RULE, contentType: "text/css" },
	[SHEET_URL + "?screen"]: { body: RULE, contentType: "text/css" }
}, { url: PAGE_URL, content: page("<link rel=\"stylesheet\" media=\"print\" href=\"" + SHEET_URL + "\"><link rel=\"stylesheet\" media=\"screen\" href=\"" + SHEET_URL + "?screen\">"), applyPrintStylesheets: true, removeUnusedStyles: false });
const links = archive.content.match(/<link[^>]*rel="?stylesheet[^>]*>/g) || [];
check("in an archive the print link applies everywhere and the screen link is gone", links.length + " link(s), media " + ((links[0] || "").match(/media="?([^" >]*)/) || [])[1], "1 link(s), media all");
check("in an archive the linked stylesheet lost its screen rule", Array.from(archive.resources.stylesheets.values()).map(({ content }) => content).join("|"), RULE);

// The elements hidden on the screen may be the ones the print layout shows, so the option that removes
// hidden elements is switched off: it is decided from the page as the screen displays it.
check("hidden elements are kept, whatever the option removing them says",
	/data-kept/.test(await capture({ [PAGE_URL]: { body: page("", "<p data-kept data-single-file-removed-content=\"\">text</p>") } },
		{ url: PAGE_URL, content: page("", "<p data-kept data-single-file-removed-content=\"\">text</p>"), applyPrintStylesheets: true, removeHiddenElements: true })), true);

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function page(head, body = "<p>body</p><a>link</a>") {
	return html(body, head);
}

async function element(head, options = { applyPrintStylesheets: true }) {
	const content = page(head);
	const saved = await capture({
		[PAGE_URL]: { body: content },
		[IMPORT_URL]: { body: RULE, contentType: "text/css" }
	}, { url: PAGE_URL, content, removeUnusedStyles: false, ...options });
	return (saved.match(/<style[\s\S]*<\/style>/) || [""])[0];
}

async function style(css, options) {
	return ((await element("<style>" + css + "</style>", options)).match(/<style>([\s\S]*?)<\/style>/) || [])[1];
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
