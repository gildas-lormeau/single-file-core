// Removing an element from the body shifts the position of every later sibling, so :nth-child(),
// :first-child, :last-child, :only-child, :empty, `+` and `~` matched other elements in the save and
// the 2026 Baseline functions sibling-index() and sibling-count() computed other values. Measured on
// 2026-10-04 with the dev CLI on css-corpus/tmp-aster/baseline-2026/{removals,siblings}.html in
// Chromium 151, Firefox 153 and WebKit 26.5: `p:nth-child(2)` coloured another paragraph after a removed
// script, noscript, preload link or body style. A removed script, noscript, resource-hint link or hidden
// input now leaves an empty element of the same tag, which does nothing and keeps the count; one in the
// head is still removed outright, where no sibling position is rendered. The HTML minifier no longer
// drops an empty body style or script for the same reason.
import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/siblings.html";
const BODY = "<ul id=\"s\"><script>var a = 1;</script><li>a</li><li>b</li></ul>" +
	"<ul id=\"n\"><noscript><li>no script</li></noscript><li>a</li></ul>" +
	"<ul id=\"l\"><link rel=\"preload\" href=\"https://example.com/data.json\" as=\"fetch\"><li>a</li></ul>" +
	"<form id=\"f\"><input type=\"hidden\" name=\"token\" value=\"secret-token\"><input name=\"q\"></form>" +
	"<div id=\"e\"><script></script><style></style><p>a</p></div>";
const HEAD = "<script>var head = 1;</script><style></style>";

let failed = false;

for (const compressHTML of [false, true]) {
	const label = compressHTML ? " (compressed HTML)" : "";
	const doc = await save({ compressHTML });
	check("a removed script leaves an empty script in its place" + label, describeChildren(doc, "s"), ["script:", "li", "li"]);
	check("a removed noscript leaves an empty noscript in its place" + label, describeChildren(doc, "n"), ["noscript:", "li"]);
	check("a removed preload link leaves a bare link in its place" + label, describeChildren(doc, "l"), ["link:", "li"]);
	check("a removed hidden input leaves a bare hidden input in its place" + label, describeChildren(doc, "f"), ["input:type=hidden", "input:name=q"]);
	check("and its value is not kept" + label, doc.documentElement.outerHTML.includes("secret-token"), false);
	check("empty body scripts and styles are kept" + label, describeChildren(doc, "e"), ["script:", "style:", "p"]);
	check("a script in the head is removed outright" + label, doc.head.querySelectorAll("script").length, 0);
}
{
	const doc = await save({ compressHTML: true });
	check("an empty style in the head is still removed by the HTML minifier",
		Array.from(doc.head.querySelectorAll("style")).some(style => !style.textContent.trim()), false);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function save({ compressHTML }) {
	const page = html(BODY, HEAD);
	const content = await capture({ [PAGE_URL]: { body: page } }, {
		url: PAGE_URL,
		content: page,
		blockScripts: true,
		removeHiddenElements: true,
		compressHTML
	});
	return new globalThis.DOMParser().parseFromString(content, "text/html");
}

function describeChildren(doc, id) {
	const element = doc.getElementById(id);
	return element ? Array.from(element.children).map(child => {
		const tagName = child.localName;
		if (["script", "noscript", "link", "style", "input"].includes(tagName)) {
			return tagName + ":" + Array.from(child.attributes).map(attribute => attribute.name + "=" + attribute.value).join(",") + (child.textContent.trim() ? "+text" : "");
		}
		return tagName;
	}) : null;
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
