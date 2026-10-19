// CSS Fonts 5 parses the `src` descriptor one comma-separated item at a time and drops only the items
// that fail, so a browser loads `src: url(a.woff) format("woff"), font-display: swap` (a comma typed
// where a semicolon belonged; every LibeSans rule on liberation.fr is written this way, measured on
// 2026-10-19). css-tree gives up on the whole value and keeps it as a Raw node, which holds no Url
// node: the font was never resolved nor fetched, and the saved page kept the site's relative path.
// The value is now split on top-level commas before URLs are collected, each item is parsed on its
// own, and the items that parse to a url() or local() source make up the new value.
import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/recovery.html";
const URL_A = "https://example.com/a.woff2";
const URL_B = "https://example.com/b.woff2";
const URL_COMMA = "https://example.com/c,d.woff2";
const BYTES_A = new Uint8Array(512).fill(65);
const BYTES_B = new Uint8Array(512).fill(66);
const BYTES_COMMA = new Uint8Array(512).fill(67);
const MARK_A = btoa(String.fromCharCode(...BYTES_A.subarray(0, 30)));
const MARK_B = btoa(String.fromCharCode(...BYTES_B.subarray(0, 30)));
const MARK_COMMA = btoa(String.fromCharCode(...BYTES_COMMA.subarray(0, 30)));

let failed = false;

// The case this exists for: the item swallowed by the stray comma is dropped, the font is embedded.
{
	const face = await captureFace(`url(${URL_A}) format("woff2"),\n    font-display: swap`);
	check("the font before the stray comma is embedded", face.includes(MARK_A), true);
	check("the swallowed descriptor is not kept in src", face.includes("font-display"), false);
}
check("a bad item after a good one is dropped", await getKeptSources(`url(${URL_A}) format("woff2"), garbage: x`), ["A"]);
check("a bad item before a good one is dropped", await getKeptSources(`garbage: x, url(${URL_A}) format("woff2")`), ["A"]);
check("the good items around a bad one are both kept", await getKeptSources(`url(${URL_A}) format("woff2") tech(variations), garbage: x, url(${URL_B}) format("woff2")`), ["A", "B"]);
{
	const face = await captureFace(`local("Local Face"), garbage: x, url(${URL_A}) format("woff2")`);
	check("a local() item survives next to a bad one", face.includes("local("), true);
	check("the url() item next to it is embedded", face.includes(MARK_A), true);
}
{
	const face = await captureFace(`url("${URL_COMMA}") format("woff2"), font-display: swap`);
	check("a comma inside a quoted url is not a split point", face.includes(MARK_COMMA), true);
}

// Controls.
check("control: a well-formed src is unchanged", await getKeptSources(`url(${URL_A}) format("woff2")`), ["A"]);
{
	const face = await captureFace("garbage: x, more: y");
	check("control: a src with no valid item is left alone", face.includes("garbage: x"), true);
	check("control: nothing is fetched for it", face.includes("data:"), false);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function getKeptSources(src) {
	const face = await captureFace(src);
	return [["A", MARK_A], ["B", MARK_B]].filter(([, mark]) => face.includes(mark)).map(([name]) => name);
}

async function captureFace(src) {
	const page = html("<p>AB</p>", "<style>@font-face{font-family:S;src:" + src + "}p{font-family:S}</style>");
	const pageResources = new Map([
		[PAGE_URL, { body: page, contentType: "text/html" }],
		[URL_A, { body: BYTES_A, contentType: "font/woff2" }],
		[URL_B, { body: BYTES_B, contentType: "font/woff2" }],
		[URL_COMMA, { body: BYTES_COMMA, contentType: "font/woff2" }]
	]);
	const content = await capture(pageResources, { url: PAGE_URL, content: page, removeUnusedFonts: false, removeAlternativeFonts: false });
	return (content.match(/@font-face\s*\{[^}]*\}/) || [""])[0];
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
