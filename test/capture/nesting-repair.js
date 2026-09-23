// A page script can build a DOM the HTML parser cannot reproduce — `para.appendChild(div)` puts a
// block inside a paragraph, and the Times consent dialog does exactly that. SingleFile carries such a
// nesting with `data-sf-nesting-track-id` attributes and an injected script that moves the elements
// back at load, and core used to SERIALIZE the repaired shape. That markup cannot survive a parse:
// the `<div>` closes the paragraph and the stray `</p>` is a parse error the HTML spec recovers from
// by inserting an empty `<p>`. So every parse minted one, nothing removed it, and each capture
// carried the last one and minted another: measured with the CLI, one empty paragraph after the
// first save, three after the second, five after the third, 14 bytes each time, unbounded. The cost
// is not only size. The paragraph that was `:last-child` live stops being one, so a rule written for
// it stops applying: on that fixture the live page computes `margin-bottom: 0` and the saved page
// computed 12px, in Chromium 151, Firefox 153 and WebKit 26.5 alike.
//
// Two things fix it and both are needed. Core drops the paragraph its own parse invented, and core
// restores the SPLIT shape — the one the parser produced — before serializing, so the saved file is
// a fixed point of parse and serialize and a browser mints nothing when it opens it. The injected
// script still does the moving at load, which is what it was always for. Measured end to end with
// the CLI after the fix: three generations byte-identical, and all three engines render the saved
// page with the same single paragraph, the same 0px margin and the block back inside it.
//
// Recognizing the invented element by shape is safe because `<p>` is the only element an invalid
// nesting invents. Probed in Chromium over eleven shapes: `p > div`, `p > p` and `p > ul` each mint
// an empty `<p>`, while `a > a`, `button > button`, `li > li`, `dt > dt`, `table > div` and
// `select > div` keep every element and only move them. (`form > form` LOSES one, which the comment
// markers further down carry.) The removal deliberately lives in core and not in `fixInvalidNesting`,
// whose source is stringified into every saved page: at load time an empty paragraph next to the
// repaired one is the page's own.
//
// The fixtures below are written ALREADY SPLIT, with the invented paragraph spelled out, because
// that is what core receives from a browser — and because happy-dom does not mint it. It splits the
// paragraph correctly but implements no such recovery, so a fixture written as `<p>text<div>` would
// exercise nothing here while breaking in the field.
import { capture, html, helper } from "./common.js";

const PAGE_URL = "https://example.com/nesting.html";
const TRACK = "data-sf-nesting-track-id";
const PARAGRAPH = `<p id="para" ${TRACK}="1.1">text</p>`;
const BLOCK = `<div id="block" ${TRACK}="1.1.1">block</div>`;
const INVENTED = "<p></p>";

let failed = false;

// The case this exists for: the paragraph the parser invented is dropped, and what is written back
// is the split shape rather than the repaired one.
{
	const content = await captureBody(PARAGRAPH + BLOCK + INVENTED);
	check("the invented paragraph is gone", countEmptyParagraphs(content), 0);
	check("and the markup is the shape a parser reproduces", bodyContent(content), PARAGRAPH + BLOCK);
	check("with the repair script carried for load time", content.includes(`(document, "${TRACK}")`), true);
}

// The property that stops the growth: capturing the saved page again gives the same markup, because
// a parse of it mints nothing. Without it the count climbed by two per generation.
{
	const first = await captureBody(PARAGRAPH + BLOCK + INVENTED);
	const second = await captureBody(bodyContent(first));
	check("re-capturing the saved page changes nothing", bodyContent(second), bodyContent(first));
	check("and it still holds no empty paragraph", countEmptyParagraphs(second), 0);
}

// The control that keeps the rule honest: an empty paragraph the PAGE wrote, right where the invented
// one lands, has to survive. The invented one always comes first, at the stray `</p>`, so exactly one
// goes. A rule that swept empty paragraphs would take both and fail here.
{
	const content = await captureBody(PARAGRAPH + BLOCK + INVENTED + "<p></p>");
	check("an empty paragraph the page wrote is kept", countEmptyParagraphs(content), 1);
	check("and it stays where it was", bodyContent(content), PARAGRAPH + BLOCK + "<p></p>");
}

// The second control: with no track id there is nothing to repair, so nothing is removed either. The
// same markup then describes a page that really does hold an empty paragraph.
{
	const content = await captureBody("<p id=\"para\">text</p><div id=\"block\">block</div>" + INVENTED);
	check("an untracked page keeps its empty paragraph", countEmptyParagraphs(content), 1);
	check("and gets no repair script", content.includes(`(document, "${TRACK}")`), false);
}

// A block whose expected parent is not a paragraph must not make a neighbouring empty paragraph
// disappear: only a stray `</p>` invents one, so only a paragraph nesting may remove one.
{
	const content = await captureBody(`<li id="item" ${TRACK}="1.1">text</li><div id="block" ${TRACK}="1.1.1">block</div>` + INVENTED);
	check("a non-paragraph nesting removes nothing", countEmptyParagraphs(content), 1);
}

// A link nested in a link, as on Substack home pages (midwesterndoctor.com). The parser clones the
// outer `<a>`, track id included, at each level it closes, so `fixInvalidNesting` takes the LAST
// clone as the expected parent and moves `#box` inside it. Restoring in reverse document order then
// put that clone back into `#row` while `#row` was still inside it, and the capture threw a
// HierarchyRequestError. Restoring ancestors first, in document order, reproduces the parsed shape.
{
	const nested = `<div id="card" ${TRACK}="1.1"><a id="outer" ${TRACK}="1.1.1"></a>` +
		`<div id="box" ${TRACK}="1.1.1.1"><a id="outer" ${TRACK}="1.1.1"></a>` +
		`<div id="row"><a id="outer" ${TRACK}="1.1.1"></a><a id="inner" ${TRACK}="1.1.1.1.1.1">x</a></div></div></div>`;
	let content;
	try {
		content = await captureBody(nested);
	} catch (error) {
		content = error.message;
	}
	check("a link nested in a link is saved in the parsed shape", bodyContent(content), nested);
}

// An element the parser DROPS instead of moving: the inner `<form>` of a form in a form (the form
// element pointer ignores its start tag), or a `<td>` outside a table. No track id can bring it back,
// so the capture wraps its content in two comments carrying its tag and attributes. The fixture is
// what a browser parse of that markup yields: the element gone, its content and the comments left
// in place. Core re-creates the element for the whole processing, so a rule written for the real
// structure is kept, then writes the comments back and the load-time script re-creates it.
{
	const dropped = `<form id="outer" ${TRACK}="1.1">before ${startMarker("1.1.1", "form", [["id", "inner"], ["class", "c"], [TRACK, "1.1.1"]])}` +
		`inner <input id="field" ${TRACK}="1.1.1.1">${endMarker("1.1.1")}</form> after`;
	const content = await captureBody(dropped, "<style>#outer > #inner > #field { color: red }</style>", { removeUnusedStyles: true });
	check("a dropped element is saved as its markers", bodyContent(content), dropped);
	check("and it existed while the page was processed", /#outer ?> ?#inner ?> ?#field/.test(content), true);
	check("with the repair script carried for load time", content.includes(`(document, "${TRACK}")`), true);
	const doc = loadSavedPage(content);
	const inner = doc.querySelector("#outer > #inner.c");
	check("the load-time script re-creates it with its attributes", Boolean(inner && inner.querySelector("#field")), true);
	check("and its content", inner && inner.firstChild.textContent, "inner ");
	check("and leaves no marker or track id behind", countLeftovers(doc), 0);
}

// Nested drops: the markers of the inner element sit inside those of the outer one, and the outer
// element is re-created first so the inner markers are still siblings when their turn comes.
{
	const nested = `<form id="a" ${TRACK}="1.1">${startMarker("1.1.1", "form", [["id", "b"], [TRACK, "1.1.1"]])}` +
		`${startMarker("1.1.1.1", "form", [["id", "c"], [TRACK, "1.1.1.1"]])}x${endMarker("1.1.1.1")}${endMarker("1.1.1")}</form>`;
	const content = await captureBody(nested, "<style>#a > #b > #c { color: red }</style>", { removeUnusedStyles: true });
	check("nested dropped elements are saved as their markers", bodyContent(content), nested);
	check("and both existed while the page was processed", /#a ?> ?#b ?> ?#c/.test(content), true);
	check("and the load-time script re-creates both", Boolean(loadSavedPage(content).querySelector("#a > #b > #c")), true);
}

// The capture side, on a DOM: happy-dom drops a `<td>` outside a table as a browser does, so the marking
// can run here. The editor calls markInvalidNesting on its live document for every save and never runs
// preProcessDoc, so the markers must be complete when it returns, and a second call must not add a
// second pair: the load-time script would re-create the element twice, one inside the other.
{
	const doc = new globalThis.DOMParser().parseFromString("<!doctype html><html><head></head><body><div id=\"wrap\">a</div></body></html>", "text/html");
	const cell = doc.createElement("td");
	cell.id = "cell";
	cell.textContent = "cell";
	doc.getElementById("wrap").append(cell, "b");
	helper.markInvalidNesting(doc);
	helper.markInvalidNesting(doc);
	const markers = Array.from(cell.childNodes).filter(node => node.nodeType == 8).map(node => node.data.split(" ").slice(0, 2).join(" "));
	check("a dropped element gets one pair of markers, however often it is marked", JSON.stringify(markers), JSON.stringify([helper.NESTING_START_MARKER + "1.1.1", helper.NESTING_END_MARKER.trim() + " 1.1.1"]));
	const loaded = loadSavedPage(helper.serialize(doc));
	const wrap = loaded.getElementById("wrap");
	check("and a load of the serialized page re-creates it", JSON.stringify(Array.from(wrap.childNodes).map(node => node.nodeType == 1 ? node.localName + "#" + node.id + ":" + node.textContent : node.data)), JSON.stringify(["a", "td#cell:cell", "b"]));
	helper.removeNestingMarkers(doc);
	check("and removing the markers restores the live element", JSON.stringify(Array.from(cell.childNodes).map(node => node.nodeType)), "[3]");
}

// The load-time script is written into the saved page as source text, and bundlers rename the
// module-level aliases core keeps for globals (`const JSON = globalThis.JSON` in helper.js): a bare
// `JSON` in it became `lr` in the CLI bundle, threw inside a try, and re-created nothing, with no
// error. The function may only reach those globals through `globalThis`.
{
	const source = helper.fixInvalidNesting.toString();
	const aliases = source.match(/(?<![.\w])(JSON|crypto|TextEncoder|Blob|CustomEvent|MutationObserver|URL|DOMParser|btoa|FileReader)\b/g);
	check("the load-time script names no module-level alias", aliases, null);
}

// Shadow roots: their content reaches core as the live root's innerHTML, track ids included, and is
// parsed again here, so the same repair applies inside the template, and a closed root that needs it
// is saved open because the load-time script cannot reach a closed declarative root. Only the shape
// and the controls can be checked in this harness: core fills the `<template>` with appendChild,
// which per the DOM spec and in every browser makes the nodes children of the template element, but
// happy-dom routes them into `template.content`, where no document query looks, so the repair, the
// open mode and the script are never reached here. Lifting its overrides breaks its TreeWalker. The
// repair inside templates is checked in Chrome instead, through the CLI.
{
	const content = await captureShadowRoot("closed", `<p id="sp" ${TRACK}="s0.1">text<div id="sdiv" ${TRACK}="s0.1.1">block</div></p>`);
	check("shadow content is saved in the shape a parser reproduces", content.includes(`<p id="sp" ${TRACK}="s0.1">text</p><div id="sdiv" ${TRACK}="s0.1.1">block</div>`), true);
}
{
	const content = await captureShadowRoot("closed", "<p>fine</p>");
	check("a closed shadow root with nothing to repair stays closed", content.includes("<template shadowrootmode=\"closed\">"), true);
	check("and gets no repair script", content.includes(`(document, "${TRACK}")`), false);
}
{
	const dropped = `<form id="outer" ${TRACK}="s0.1">${startMarker("s0.1.1", "form", [["id", "inner"], [TRACK, "s0.1.1"]])}inner${endMarker("s0.1.1")}</form>`;
	const content = await captureShadowRoot("open", dropped);
	check("a dropped element in a shadow root is saved as its markers", content.includes(dropped), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function captureBody(body, head, options) {
	const page = html(body, head);
	return capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, ...options });
}

async function captureShadowRoot(mode, shadowContent) {
	const page = html(`<div id="host" ${helper.SHADOW_ROOT_ATTRIBUTE_NAME}="0"></div>`);
	return capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, shadowRoots: [{ mode, content: shadowContent }] });
}

function startMarker(id, tag, attributes) {
	return `<!--${helper.NESTING_START_MARKER}${id} ${encodeURIComponent(JSON.stringify({ tag, attributes }))}-->`;
}

function endMarker(id) {
	return `<!--${helper.NESTING_END_MARKER}${id}-->`;
}

// the saved page as a browser would run it: parsed, then the embedded script, from its source text
function loadSavedPage(content) {
	const doc = new globalThis.DOMParser().parseFromString(content.replace(/<script>[\s\S]*?<\/script>/g, ""), "text/html");
	new Function("document", `(${helper.fixInvalidNesting.toString().replace(/\s+/g, " ")})(document, "${TRACK}");`)(doc);
	return doc;
}

function countLeftovers(doc) {
	let count = doc.querySelectorAll(`[${TRACK}]`).length;
	const walker = doc.createTreeWalker(doc.body, 128);
	while (walker.nextNode()) {
		if (walker.currentNode.data.startsWith(TRACK)) {
			count++;
		}
	}
	return count;
}

// the saved body, without the repair script core appends to it
function bodyContent(content) {
	const start = content.indexOf(">", content.indexOf("<body")) + 1;
	const scriptIndex = content.indexOf("<script", start);
	const end = scriptIndex == -1 ? content.indexOf("</body>", start) : scriptIndex;
	return content.slice(start, end).trim();
}

function countEmptyParagraphs(content) {
	return (content.match(/<p><\/p>/g) || []).length;
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(actual)}${ok ? "" : " (expected " + JSON.stringify(expected) + ")"}`);
	failed ||= !ok;
}
