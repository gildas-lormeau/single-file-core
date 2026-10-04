// removeAlternativeFonts keeps one source per face, chosen by format. A source qualified by CSS Fonts 4
// `tech()`, or by the older `format("woff2 supports variations")`, never matched a known format: the
// format was read as `"woff2") tech(variations`, so a plain fallback after it won and the variable or
// colour font the browser had drawn was dropped. Measured on 2026-10-04 with the capture harness. Support
// for a technology differs by browser, so a valid tech() source is now kept with the fallback chosen
// among the other sources, in the order the page wrote them.
import { capture, captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/tech.html";
const URL_A = "https://example.com/a.woff2";
const URL_B = "https://example.com/b.woff2";
const BYTES_A = new Uint8Array(512).fill(65);
const BYTES_B = new Uint8Array(512).fill(66);
const MARK_A = btoa(String.fromCharCode(...BYTES_A.subarray(0, 30)));
const MARK_B = btoa(String.fromCharCode(...BYTES_B.subarray(0, 30)));

let failed = false;

check("a tech(variations) source is kept with its fallback",
	await getKeptSources(`url(${URL_A}) format("woff2") tech(variations), url(${URL_B}) format("woff2")`), ["A", "B"]);
check("a tech(color-COLRv1) source is kept with its fallback",
	await getKeptSources(`url(${URL_A}) format("woff2") tech(color-COLRv1), url(${URL_B}) format("woff2")`), ["A", "B"]);
check("a format(\"woff2 supports variations\") source is kept with its fallback",
	await getKeptSources(`url(${URL_A}) format("woff2 supports variations"), url(${URL_B}) format("woff2")`), ["A", "B"]);
check("a tech() source is kept with a fallback of another format",
	await getKeptSources(`url(${URL_A}) format("woff2") tech(variations), url(${URL_B}) format("truetype")`), ["A", "B"]);
check("two tech() sources and no fallback are both kept",
	await getKeptSources(`url(${URL_A}) format("woff2") tech(color-COLRv1), url(${URL_B}) format("woff2") tech(color-SVG)`), ["A", "B"]);
check("control: format(\"woff2-variations\") is still preferred alone",
	await getKeptSources(`url(${URL_A}) format("woff2-variations"), url(${URL_B}) format("woff2")`), ["A"]);
check("control: of woff2 and truetype only the woff2 is kept",
	await getKeptSources(`url(${URL_A}) format("woff2"), url(${URL_B}) format("truetype")`), ["A"]);
{
	const content = await captureFont(`url(${URL_A}) format("woff2") tech(variations), url(${URL_B}) format("woff2")`, capture);
	check("the tech() source still comes first", content.indexOf(MARK_A) != -1 && content.indexOf(MARK_A) < content.indexOf(MARK_B), true);
}
{
	const pageData = await captureFont(`url(${URL_A}) format("woff2") tech(variations), url(${URL_B}) format("woff2")`, captureArchive);
	const face = (pageData.content.match(/@font-face\s*\{[^}]*\}/) || [""])[0];
	check("an archive keeps the tech() source with its fallback", Array.from(face.matchAll(/url\(/g)).length, 2);
}
{
	const pageData = await captureFont(`url(${URL_A}) format("woff2"), url(${URL_B}) format("woff2")`, captureArchive);
	const face = (pageData.content.match(/@font-face\s*\{[^}]*\}/) || [""])[0];
	check("control: an archive keeps one of two plain woff2 sources", Array.from(face.matchAll(/url\(/g)).length, 1);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function getKeptSources(src) {
	const content = await captureFont(src, capture);
	const face = (content.match(/@font-face\s*\{[^}]*\}/) || [""])[0];
	return [["A", MARK_A], ["B", MARK_B]].filter(([, mark]) => face.includes(mark)).map(([name]) => name);
}

function captureFont(src, captureFunction) {
	const page = html("<p>AB</p>", "<style>@font-face{font-family:S;src:" + src + "}p{font-family:S}</style>");
	const pageResources = new Map([
		[PAGE_URL, { body: page, contentType: "text/html" }],
		[URL_A, { body: BYTES_A, contentType: "font/woff2" }],
		[URL_B, { body: BYTES_B, contentType: "font/woff2" }]
	]);
	return captureFunction(pageResources, { url: PAGE_URL, content: page, removeAlternativeFonts: true });
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
