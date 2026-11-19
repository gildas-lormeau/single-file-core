import "./dom.js";

// The content script marks a selection on elements, and removeUnselectedElements only looks at
// elements: text written directly in an ancestor of the selection was never removed. The Lua manual
// writes the description of each function as bare text of <body>, after an <hr> that closes the
// paragraph, so any selection saved from it came with 59 of those descriptions (SingleFile#2066).
// The content script now lists, on an element that is only partly selected, which of its text runs
// are selected, and the others are removed. A run is a sequence of text written between two
// non-text children, and only the runs holding something else than white space are numbered.
import { capture, html, helper } from "./common.js";

const SELECTED = helper.SELECTED_CONTENT_ATTRIBUTE_NAME;
const SELECTED_TEXT = helper.SELECTED_TEXT_ATTRIBUTE_NAME;
const PAGE_URL = "https://example.com/page.html";

let failed = false;

// the page of the issue in small: the selection is in a paragraph, the bare text is in <body>
{
	const content = await captureBody(
		"<body " + SELECTED + " " + SELECTED_TEXT + "=\"\">" +
		"<p " + SELECTED + ">selected paragraph</p>" +
		"<hr><h3>first</h3>first description" +
		"<hr><h3>second</h3>second description</body>");
	check("the selected paragraph is kept", content.includes("selected paragraph"), true);
	check("the bare text of the partly selected body is removed", content.includes("first description") || content.includes("second description"), false);
	check("the mark is removed", content.includes(SELECTED_TEXT), false);
}

// bare text the user did select is kept, the text around it is not
{
	const content = await captureBody(
		"<body " + SELECTED + " " + SELECTED_TEXT + "=\"1 2\">" +
		"text zero<hr " + SELECTED + ">text one<br " + SELECTED + ">text two<hr>text three</body>");
	check("the runs listed are kept", content.includes("text one") && content.includes("text two"), true);
	check("the runs not listed are removed", content.includes("text zero") || content.includes("text three"), false);
}

// an element without the list keeps all its text: a fully selected element, an older content
// script and the selectedElementsSelector option do not write it
{
	const content = await captureBody(
		"<body " + SELECTED + ">" +
		"<p " + SELECTED + ">selected paragraph</p>" +
		"<hr>bare text</body>");
	check("control: without the list the bare text is kept", content.includes("bare text"), true);
}

// white space between two elements is not a numbered run, and it is kept: removing it would join
// two inline elements that are both kept
{
	const content = await captureBody(
		"<body " + SELECTED + " " + SELECTED_TEXT + "=\"0\">" +
		"<b " + SELECTED + ">one</b> <i " + SELECTED + ">two</i> selected text<hr>unselected text</body>");
	check("the run after white space is the first one", content.includes("selected text") && !content.includes("unselected text"), true);
	check("the white space between two kept elements is kept", /<\/b> <i/.test(content), true);
}

// the runs are numbered as the content script saw them, before core moves or removes elements: a
// script is removed when scripts are blocked, and it was standing between two runs. A comment
// separates two runs as well.
{
	const content = await captureBody(
		"<body " + SELECTED + " " + SELECTED_TEXT + "=\"1\">" +
		"text zero<script>var a;</script>text one<!-- comment -->text two" +
		"<p " + SELECTED + ">selected paragraph</p></body>", { blockScripts: true });
	check("a removed script still separates two runs", content.includes("text one") && !content.includes("text zero"), true);
	check("so does a comment", content.includes("text two"), false);
}

// the list belongs to the element that carries it, the text of its children is not concerned
{
	const content = await captureBody(
		"<body " + SELECTED + " " + SELECTED_TEXT + "=\"\">" +
		"<div " + SELECTED + " " + SELECTED_TEXT + "=\"0\">kept in the div<span " + SELECTED + ">selected span</span>removed from the div</div>" +
		"removed from the body</body>");
	check("each element is pruned with its own list", content.includes("kept in the div") && content.includes("selected span") && !content.includes("removed from"), true);
}

// without the option nothing is a selection
{
	const content = await captureBody(
		"<body " + SELECTED_TEXT + "=\"\"><p>paragraph</p>bare text</body>", { selected: false });
	check("control: nothing is removed without the option", content.includes("bare text"), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function captureBody(body, options = {}) {
	const page = html("").replace("<body></body>", body);
	return capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, selected: true, ...options });
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
