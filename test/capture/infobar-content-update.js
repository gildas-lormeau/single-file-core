import { capture, html } from "./common.js";
import { extractInfobarData, updateInfobarContent } from "../../core/infobar.js";

const PAGE_URL = "https://example.com/page.html";
const PAGE = html("<h1>page</h1>");

let failed = false;

// The message of the infobar is written once, when the page is saved, in the comment at the top of
// the page, and the annotation editor builds the infobar from that comment each time it saves. The
// editor lets the user change the message afterwards: these cases check that the comment is
// rewritten in the format the reader expects, whatever it held before.

// a message replaces the one given when the page was saved, the URL and the date are kept
{
	const doc = await captureDocument({ infobarTemplate: "first message" });
	const savedData = extractInfobarData(doc);
	check("the saved page carries the first message", savedData.infobarContent, "first message");
	// the line of the URL ends with a space in the comment, which is not part of the URL: the editor
	// saves pages under the URL read here (#2062)
	check("the URL is read without the space ending its line", savedData.saveUrl, PAGE_URL);
	check("the update is reported as done", updateInfobarContent(doc, "second message"), true);
	const data = extractInfobarData(doc);
	check("the message is replaced", data.infobarContent, "second message");
	check("the URL is kept", data.saveUrl, savedData.saveUrl);
	check("the saved date is kept", data.saveDate, savedData.saveDate);
}

// a page saved without a message gets one, and a message can be removed
{
	const doc = await captureDocument({});
	check("the saved page carries no message", extractInfobarData(doc).infobarContent, undefined);
	updateInfobarContent(doc, "added message");
	check("the message is added", extractInfobarData(doc).infobarContent, "added message");
	updateInfobarContent(doc, "");
	const data = extractInfobarData(doc);
	check("the message is removed", data.infobarContent, undefined);
	check("the saved date is still read", Boolean(data.saveDate), true);
}

// a message on several lines is read back with its lines
{
	const doc = await captureDocument({ infobarTemplate: "first message" });
	updateInfobarContent(doc, "line one\nline two\nline three");
	check("the lines are kept", extractInfobarData(doc).infobarContent, "line one\nline two\nline three");
	updateInfobarContent(doc, "one line");
	check("a shorter message leaves no line behind", extractInfobarData(doc).infobarContent, "one line");
}

// a page saved without its date has one line less in the comment
{
	const doc = await captureDocument({ removeSavedDate: true });
	const savedData = extractInfobarData(doc);
	check("the saved page carries no date", savedData.saveDate, undefined);
	updateInfobarContent(doc, "message without date");
	const data = extractInfobarData(doc);
	check("the message is added when the date is absent", data.infobarContent, "message without date");
	check("the URL is still read", data.saveUrl, PAGE_URL);
	check("no date appeared", data.saveDate, undefined);
}

// the message is in a comment, which it must not close: the rest would become markup of the page
{
	const doc = await captureDocument({});
	updateInfobarContent(doc, "a --> b --!> c");
	const serializedDoc = new globalThis.DOMParser().parseFromString(doc.documentElement.outerHTML, "text/html");
	check("the comment is not closed by the message", extractInfobarData(serializedDoc).infobarContent, "a -- > b --! > c");
	check("nothing of the message became page content", serializedDoc.body.textContent, "page");
}

// a document that SingleFile did not save is left alone
{
	const doc = new globalThis.DOMParser().parseFromString("<html><!-- a comment --><body><p>text</p></body></html>", "text/html");
	check("a foreign comment is not rewritten", updateInfobarContent(doc, "message"), false);
	check("its text is unchanged", doc.documentElement.firstChild.textContent, " a comment ");
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function captureDocument(options) {
	const content = await capture({ [PAGE_URL]: { body: PAGE } }, { url: PAGE_URL, content: PAGE, insertSingleFileComment: true, saveUrl: PAGE_URL, ...options });
	return new globalThis.DOMParser().parseFromString(content, "text/html");
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
