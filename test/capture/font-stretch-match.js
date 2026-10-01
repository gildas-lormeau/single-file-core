// CSS Fonts 4 §5.2 narrows the faces of a family by font-stretch before it looks at the style or the
// weight. removeUnusedFonts did not read the stretch at all, so text set in a condensed face whose
// weight differs from the normal one was matched to the normal face, and the condensed face was
// removed: measured in Chrome and Firefox, the saved page drew with the normal face. The stretch the
// browser computed is the fifth item of a usedFonts entry; an entry without it skips the stretch step.

import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/fonts.html";
const NORMAL_FONT_URL = "https://example.com/normal.woff2";
const CONDENSED_FONT_URL = "https://example.com/condensed.woff2";
const FONT_CONTENT_TYPE = "font/woff2";
const NORMAL_FONT_BYTES = new Uint8Array(512).fill(65);
const CONDENSED_FONT_BYTES = new Uint8Array(512).fill(66);
const FACES = face("400", "normal", NORMAL_FONT_URL) + face("700", "condensed", CONDENSED_FONT_URL);

let failed = false;

{
	const content = await run(FACES, [["s", "400", "normal", "normal", "75%"]]);
	check("condensed text keeps the condensed face", content.includes("font-stretch:condensed"), true);
	check("and drops the normal face nothing draws with", content.includes("font-stretch:normal"), false);
}

// The control: text at the normal stretch is matched by weight as before.
{
	const content = await run(FACES, [["s", "400", "normal", "normal", "100%"]]);
	check("normal text keeps the normal face", content.includes("font-stretch:normal"), true);
	check("and drops the condensed face", content.includes("font-stretch:condensed"), false);
}

{
	const content = await run(FACES, [["s", "400", "normal", "normal"]]);
	check("an entry without a stretch is matched by weight alone", content.includes("font-stretch:normal"), true);
	check("as it was before", content.includes("font-stretch:condensed"), false);
}

// Without an exact match, a stretch up to 100% looks at the narrower faces first and a wider one at
// the wider faces first, each falling back to the other side.
{
	const content = await run(FACES, [["s", "400", "normal", "normal", "87.5%"]]);
	check("semi-condensed text keeps the narrower condensed face", content.includes("font-stretch:condensed"), true);
	check("and drops the wider normal face", content.includes("font-stretch:normal"), false);
}

{
	const content = await run(FACES, [["s", "700", "normal", "normal", "125%"]]);
	check("expanded text with no wider face falls back to the normal face", content.includes("font-stretch:normal"), true);
	check("and drops the condensed face", content.includes("font-stretch:condensed"), false);
}

{
	const content = await run(face("400", "75% 100%", NORMAL_FONT_URL) + face("700", "125%", CONDENSED_FONT_URL),
		[["s", "400", "normal", "normal", "112.5%"]]);
	check("a stretch between the faces above 100% keeps the wider face", content.includes("font-stretch:125%"), true);
	check("and drops the range below it", content.includes("font-stretch:75% 100%"), false);
}

{
	const content = await run(face("400", "75% 100%", NORMAL_FONT_URL) + face("700", "condensed", CONDENSED_FONT_URL),
		[["s", "400", "normal", "normal", "75%"]]);
	check("a range holding the stretch is matched like an exact face", content.includes("font-stretch:75% 100%"), true);
}

{
	const content = await run(face("400", "auto", NORMAL_FONT_URL) + face("700", "condensed", CONDENSED_FONT_URL),
		[["s", "400", "normal", "normal", "75%"]]);
	check("a face whose stretch cannot be read is matched at every stretch", content.includes("font-stretch:auto"), true);
}

if (failed) {
	Deno.exit(1);
}

function face(weight, stretch, url) {
	return "@font-face{font-family:\"S\";src:url(" + url + ") format(\"woff2\");font-weight:" + weight + ";font-stretch:" + stretch + "}";
}

async function run(faces, usedFonts) {
	const page = html("<p>Aa</p>", "<style>" + faces + "p{font-family:\"S\",sans-serif}</style>");
	const pageResources = new Map([
		[PAGE_URL, { body: page, contentType: "text/html" }],
		[NORMAL_FONT_URL, { body: NORMAL_FONT_BYTES, contentType: FONT_CONTENT_TYPE }],
		[CONDENSED_FONT_URL, { body: CONDENSED_FONT_BYTES, contentType: FONT_CONTENT_TYPE }]
	]);
	return capture(pageResources, { url: PAGE_URL, content: page, removeUnusedFonts: true, usedFonts });
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
