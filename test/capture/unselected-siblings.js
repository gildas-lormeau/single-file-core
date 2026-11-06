import "./dom.js";

// removeUnselectedElements keeps the elements the content script marked as selected, removes the
// siblings written after them and hides the siblings written before them, so that the selected
// elements keep their place in the tree for selectors and counters. Hidden used to mean display:none,
// which takes the element out of its grid as well: in a grid laid out as "auto 1fr", the item of the
// first row gone, the selected container moved up into the auto row and was given its content
// height, 0 once overflow:hidden applies, so a LinkedIn job description saved as a selection rendered
// as the page background (SingleFile#1932). A hidden sibling now keeps its box, emptied and reduced
// to nothing, and only a line break is removed from the flow, since a hidden <br> still breaks.
import { capture, html, helper } from "./common.js";

const SELECTED = helper.SELECTED_CONTENT_ATTRIBUTE_NAME;
const PAGE_URL = "https://example.com/page.html";
const PAGE = html(
	"<header class=\"top\">top</header><br class=\"break\">" +
	"<main " + SELECTED + "><p " + SELECTED + ">selected text</p><aside>after the selection</aside></main>" +
	"<footer>bottom</footer>");
const RESOURCES = { [PAGE_URL]: { body: PAGE } };

let failed = false;

{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, selected: true });
	const header = styleOf(content, "header");
	check("the selected text is kept", content.includes("selected text"), true);
	check("the sibling before the selection is kept in the flow", header.includes("visibility:hidden!important") || header.includes("visibility: hidden !important"), true);
	check("with no box", /height:\s*0(px)?\s*!important/.test(header) && /width:\s*0(px)?\s*!important/.test(header), true);
	check("and no space around it", /margin:\s*0(px)?\s*!important/.test(header) && /padding:\s*0(px)?\s*!important/.test(header), true);
	check("rather than taken out of it", /display:\s*none/.test(header), false);
	check("emptied", /<header[^>]*><\/header>/.test(content), true);
	check("a line break before the selection is taken out of the flow", /display:\s*none\s*!important/.test(styleOf(content, "br")), true);
	check("the sibling after the selection is removed", content.includes("after the selection"), false);
	check("the element after the selected container is removed", content.includes("<footer"), false);
	check("the selection marks are removed", content.includes(SELECTED), false);
}
{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, selected: false });
	check("control: nothing is hidden or removed without the option", content.includes(">top</header>") && content.includes("after the selection") && content.includes("bottom</footer>"), true);
	check("control: no hidden style is written", content.includes("visibility"), false);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function styleOf(content, tagName) {
	const match = content.match(new RegExp("<" + tagName + "[^>]*\\bstyle=\"?([^\">]*)"));
	return match ? match[1] : "";
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
