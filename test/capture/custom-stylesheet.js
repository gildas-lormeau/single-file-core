import "./dom.js";
import { Window } from "npm:happy-dom@20.14.5";

// customStylesheet is CSS the user wants applied to the page before it is saved: a chat site clamps
// its prompts to two lines, and the saved page has no script to expand them. The rules have to be
// in effect while preProcessDoc reads computed styles, since that is where hidden elements are
// marked for removal, so the stylesheet is inserted into the live document first, as the last
// stylesheet so its rules win ties. The element travels with the serialized page, loses its
// marker there, and is removed from the live page by postProcessDoc.
import { capture, html, helper } from "./common.js";

const ATTRIBUTE = helper.CUSTOM_STYLESHEET_ATTRIBUTE_NAME;
const REMOVED = helper.REMOVED_CONTENT_ATTRIBUTE_NAME;
const CUSTOM_CSS = "#revealed{display:block !important}";
const PAGE_URL = "https://example.com/page.html";

let failed = false;

// the live-document half
{
	const window = new Window();
	const document = window.document;
	globalThis.HTMLElement = window.HTMLElement;
	globalThis.SVGElement = window.SVGElement;
	document.body.innerHTML = `
		<style>.x{color:red}</style>
		<div id="revealed" style="display:none"><p id="revealed-content">kept</p></div>
		<div id="hidden" style="display:none"><p id="hidden-content">removed</p></div>
	`;
	const docData = helper.preProcessDoc(document, window, { removeHiddenElements: true, customStylesheet: CUSTOM_CSS });
	const styleElement = document.querySelector("style[" + ATTRIBUTE + "]");
	check("the stylesheet is inserted into the live document", Boolean(styleElement), true);
	check("as the last element of the body", document.body.lastElementChild == styleElement, true);
	check("with the given rules", styleElement && styleElement.textContent, CUSTOM_CSS);
	check("an element the stylesheet reveals is not marked removed", marked(document, "revealed-content"), false);
	check("control: an element it leaves hidden is still marked removed", marked(document, "hidden-content"), true);
	helper.postProcessDoc(document, docData.markedElements, docData.invalidElements);
	check("postProcessDoc removes the stylesheet from the live document", document.querySelector("style[" + ATTRIBUTE + "]"), null);
	check("and leaves the page's own stylesheets", document.querySelectorAll("style").length, 1);
}
{
	const window = new Window();
	const document = window.document;
	document.body.innerHTML = "<p>x</p>";
	helper.preProcessDoc(document, window, { removeHiddenElements: true });
	check("control: nothing is inserted without the option", document.querySelector("style[" + ATTRIBUTE + "]"), null);
}

// the serialized half: the page core receives carries the marked element
{
	const page = html("<p class=\"x\">x</p><style " + ATTRIBUTE + ">" + CUSTOM_CSS + "</style>");
	const content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, removeUnusedStyles: false });
	check("the saved page keeps the rules", content.includes("#revealed{display:block!important}") || content.includes(CUSTOM_CSS), true);
	check("and drops the marker", content.includes(ATTRIBUTE), false);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function marked(document, id) {
	const element = document.getElementById(id);
	return Boolean(element) && element.hasAttribute(REMOVED);
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
