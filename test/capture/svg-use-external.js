import "./dom.js";

// A <use> can reference a whole SVG file, <use href="icon.svg">, which draws the root element of
// the file (Chrome 157 does, measured 2026-11-12). The file was written into the attribute as
// "data:image/svg+xml," followed by its raw text: a "#" in the markup cut the URL, the URL parser
// dropped the tabs and newlines, and no browser draws a <use> pointing at a data URI anyway, so
// the image was lost. The root is now inlined in a <defs> next to the <use>, under a generated id.
// A fragment that is not a <symbol>, <use href="shapes.svg#group">, was inserted as it was and
// would have been drawn a second time at its own position: it goes into a <defs> as well.
import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const ICON_URL = "https://example.com/icon.svg";
const SHAPES_URL = "https://example.com/shapes.svg";
const ICON = "<svg xmlns=\"http://www.w3.org/2000/svg\"\n\twidth=\"40\" height=\"40\">\n\t<rect width=\"40\" height=\"40\" fill=\"#ff0000\"/>\n</svg>\n";
const SHAPES = "<svg xmlns=\"http://www.w3.org/2000/svg\"><symbol id=\"star\"><path d=\"M0 0h9v9z\"/></symbol><g id=\"group\"><circle r=\"5\"/></g></svg>";
const PAGE = html("<svg id=\"whole\" width=\"40\" height=\"40\"><use href=\"" + ICON_URL + "\"/></svg>" +
	"<svg id=\"second\" width=\"40\" height=\"40\"><use id=\"sf-svg-0\" href=\"" + ICON_URL + "\"/></svg>" +
	"<svg id=\"symbol\"><use href=\"" + SHAPES_URL + "#star\"/></svg>" +
	"<svg id=\"fragment\"><use href=\"" + SHAPES_URL + "#group\"/></svg>");

let failed = false;

const content = await capture({
	[PAGE_URL]: { body: PAGE },
	[ICON_URL]: { body: ICON, contentType: "image/svg+xml" },
	[SHAPES_URL]: { body: SHAPES, contentType: "image/svg+xml" }
}, { url: PAGE_URL, content: PAGE });
const doc = new globalThis.DOMParser().parseFromString(content, "text/html");
const wholeSVG = doc.getElementById("whole");
const wholeUse = wholeSVG.querySelector(":scope > use");
const wholeTarget = wholeSVG.querySelector(":scope > defs > svg");
check("no <use> points at a data URI", content.includes("data:image/svg+xml,<svg"), false);
check("the root of the file is inlined in a <defs>", Boolean(wholeTarget), true);
check("the <use> references it by id", wholeUse.getAttribute("href"), "#" + (wholeTarget && wholeTarget.getAttribute("id")));
check("the inlined root keeps its content", wholeTarget && wholeTarget.querySelector("rect").getAttribute("fill"), "#ff0000");
check("the inlined root keeps its size", wholeTarget && wholeTarget.getAttribute("width"), "40");
const ids = Array.from(doc.querySelectorAll("[id]")).map(element => element.getAttribute("id"));
check("the generated ids are unique in the page", new Set(ids).size, ids.length);
const symbolSVG = doc.getElementById("symbol");
check("a <symbol> fragment is still inserted directly", Boolean(symbolSVG.querySelector(":scope > symbol#star")), true);
check("its <use> references the fragment", symbolSVG.querySelector(":scope > use").getAttribute("href"), "#star");
const fragmentSVG = doc.getElementById("fragment");
check("a <g> fragment is inserted in a <defs>", Boolean(fragmentSVG.querySelector(":scope > defs > g#group")), true);
check("a <g> fragment is not drawn in place", Boolean(fragmentSVG.querySelector(":scope > g")), false);

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
