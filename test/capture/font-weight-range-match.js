// removeUnusedFonts maps every weight the page draws with to the face the browser would pick, then
// keeps only the faces something landed on. A weight inside a face's declared range was tried last,
// after the nearest-weight searches of CSS Fonts 4 §5.2, and those always found something when the
// family had another face: tangled.org declares Inter as a variable face at 100 600 next to a static
// bold one, and its text at 400, 500 and 600 was mapped to the bold face, so the variable faces were
// removed and the whole page was drawn in bold. §5.2 matches a weight inside a range exactly, before
// any search.

import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/fonts.html";
const VARIABLE_FONT_URL = "https://example.com/variable.woff2";
const BOLD_FONT_URL = "https://example.com/bold.woff2";
const FONT_CONTENT_TYPE = "font/woff2";
const VARIABLE_FONT_BYTES = new Uint8Array(512).fill(65);
const BOLD_FONT_BYTES = new Uint8Array(512).fill(66);
const RANGE_FACES = face("100 600", VARIABLE_FONT_URL) + face("bold", BOLD_FONT_URL);
const TIED_FACES = face("100 900", VARIABLE_FONT_URL) + face("bold", BOLD_FONT_URL);
const STATIC_FACES =face("400", VARIABLE_FONT_URL) + face("700", BOLD_FONT_URL);

let failed = false;

for (const weight of ["400", "500", "600"]) {
	const content = await run(RANGE_FACES, [weight]);
	check("a weight of " + weight + " keeps the face whose range holds it", content.includes("font-weight:100 600"), true);
	check("and drops the bold face nothing lands on (" + weight + ")", content.includes("font-weight:bold"), false);
}

// Two faces holding the same weight are a tie §5.2 leaves to the browser, and browsers differ: with a
// variable face at 100 900 and a static bold one, measured, Chrome draws text at 700 with the bold face
// in either order and Firefox with the face declared last. So both are kept.
{
	const content = await run(TIED_FACES, ["700"]);
	check("a weight of 700 keeps the range that holds it", content.includes("font-weight:100 900"), true);
	check("and the static face that holds it too", content.includes("font-weight:bold"), true);
}

{
	const content = await run(TIED_FACES, ["400"]);
	check("a weight of 400 keeps the range alone", content.includes("font-weight:bold"), false);
}

// The control: a weight outside every range still goes through the nearest-weight search.
{
	const content = await run(RANGE_FACES, ["800"]);
	check("a weight of 800 keeps the bold face", content.includes("font-weight:bold"), true);
	check("and drops the range below it", content.includes("font-weight:100 600"), false);
}

{
	const content = await run(RANGE_FACES, ["400", "700"]);
	check("both faces are kept when both are used", countMatches(content, /data:font\/woff2;base64/g), 2);
}

// Static faces were never affected.
{
	const content = await run(STATIC_FACES, ["400"]);
	check("a weight of 400 keeps the static 400 face", content.includes("font-weight:400"), true);
	check("and drops the static 700 face", content.includes("font-weight:700"), false);
}

if (failed) {
	Deno.exit(1);
}

function face(weight, url) {
	return "@font-face{font-family:\"Inter\";src:url(" + url + ") format(\"woff2\");font-weight:" + weight + "}";
}

async function run(faces, usedWeights) {
	const page = html("<p>Aa</p>", "<style>" + faces + "p{font-family:\"Inter\",sans-serif}</style>");
	const pageResources = new Map([
		[PAGE_URL, { body: page, contentType: "text/html" }],
		[VARIABLE_FONT_URL, { body: VARIABLE_FONT_BYTES, contentType: FONT_CONTENT_TYPE }],
		[BOLD_FONT_URL, { body: BOLD_FONT_BYTES, contentType: FONT_CONTENT_TYPE }]
	]);
	const usedFonts = usedWeights.map(weight => ["inter", weight, "normal", "normal"]);
	return capture(pageResources, { url: PAGE_URL, content: page, removeUnusedFonts: true, usedFonts });
}

function countMatches(content, pattern) {
	return (content.match(pattern) || []).length;
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
