import "./dom.js";

// Grouped duplicate images are written as `--sf-img-N` variables in one `:root` rule, and the
// rule listed them in the order their fetches completed: the map holding them is filled from the
// callbacks of the batch, which resolve as the network answers. Two captures of the same page
// could therefore differ in bytes, and in hash, with identical content. The rule now lists the
// variables by their resource index, which is the order the batch assigned.
import { capture, html, helper } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const SLOW_IMAGE_URL = "https://example.com/slow.png";
const FAST_IMAGE_URL = "https://example.com/fast.png";
const SLOW_IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 1, 1, 1]);
const FAST_IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 2, 2, 2, 2]);
const DELAY = 300;
// an image is only replaced by a variable when preProcessDoc measured it in the live page and
// found it replaceable; the harness has no live page, so the measurements are supplied here
const IMAGE_DATA = { replaceable: true, size: { pxWidth: 1, pxHeight: 1 } };
const PAGE = html([SLOW_IMAGE_URL, SLOW_IMAGE_URL, FAST_IMAGE_URL, FAST_IMAGE_URL]
	.map((url, index) => "<img src=\"" + url + "\" " + helper.IMAGE_ATTRIBUTE_NAME + "=\"" + index + "\">").join(""));

let failed = false;

const content = await capture({
	[PAGE_URL]: { body: PAGE },
	[SLOW_IMAGE_URL]: { body: SLOW_IMAGE, contentType: "image/png", delay: DELAY },
	[FAST_IMAGE_URL]: { body: FAST_IMAGE, contentType: "image/png" }
}, { url: PAGE_URL, content: PAGE, groupDuplicateImages: true, images: [IMAGE_DATA, IMAGE_DATA, IMAGE_DATA, IMAGE_DATA] });
const rule = content.match(/:root\{([^}]*)\}/);
check("the images are grouped into variables", Boolean(rule), true);
const indexes = rule ? Array.from(rule[1].matchAll(/--sf-img-(\d+):/g)).map(match => Number(match[1])) : [];
check("two variables, one per image", indexes.length, 2);
check("listed by resource index, not by completion order", indexes.slice().sort((first, second) => first - second), indexes);
check("the slow image, first in the document, comes first", rule && rule[1].indexOf("iVBORw0KGgoBAQEB") < rule[1].indexOf("iVBORw0KGgoCAgIC"), true);

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
