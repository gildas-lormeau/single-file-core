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
// `select > div` keep every element and only move them. (`form > form` LOSES one, which is finding
// 60da8 and not this.) The removal deliberately lives in core and not in `fixInvalidNesting`, whose
// source is stringified into every saved page: at load time an empty paragraph next to the repaired
// one is the page's own.
//
// The fixtures below are written ALREADY SPLIT, with the invented paragraph spelled out, because
// that is what core receives from a browser — and because happy-dom does not mint it. It splits the
// paragraph correctly but implements no such recovery, so a fixture written as `<p>text<div>` would
// exercise nothing here while breaking in the field.
import { capture, html } from "./common.js";

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

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function captureBody(body) {
	const page = html(body);
	return capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page });
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
