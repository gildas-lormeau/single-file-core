// A self-contained file has no indirection for a font payload: var() is not substituted in an
// @font-face descriptor — measured, the whole rule is dropped and the text falls back — so two rules
// that name the same bytes at two weights each carry a full base64 copy. An archive shares one entry
// between them and the plain file cannot, which is 3.7% of a capture of antfly.io and about 9% of all
// embedded font bytes across the 29-page corpus in b95b4.
//
// The only expressible fix is to merge the rules into one with a weight range, and CSS Fonts 4 §4.4
// says what that costs: the declared range is what clamps the wght axis, so a variable font asked for
// a weight BETWEEN the two declared ones renders interpolated after the merge where it snapped to the
// nearer declared weight before. Probed on the real Roboto Mono woff2 from that capture: identical
// pixels at 500 and at 600, different pixels at 550.
//
// Hence the two guards, and most of the cases below are their controls. The merge runs only when no
// other face of the family declares a weight inside the interval — §5.2 says a match with more than
// one face left "can differ between multiple user agents" — and only when the page uses no weight
// strictly inside it other than the merged faces' own. options.usedFonts is where that is read from,
// so an empty list, which means the computed styles could not be read, blocks the merge entirely.

import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/fonts.html";
const FONT_A_URL = "https://example.com/a.woff2";
const FONT_B_URL = "https://example.com/b.woff2";
const FONT_C_URL = "https://example.com/c.woff2";
const FONT_CONTENT_TYPE = "font/woff2";
const FONT_BYTES = new Uint8Array(512).fill(65);
const SAME_FONT_BYTES = new Uint8Array(512).fill(65);
const OTHER_FONT_BYTES = new Uint8Array(512).fill(66);
const USED_500_600 = [["merged", "500", "normal", "normal"], ["merged", "600", "normal", "normal"]];
const LATIN = "unicode-range:U+0-FF;";
const LATIN_EXT = "unicode-range:U+100-24F;";

let failed = false;

// The case this exists for.
{
	const content = await run(face(500, FONT_A_URL) + face(600, FONT_B_URL), SAME_FONT_BYTES, USED_500_600);
	check("two weights of one payload become one rule", countMatches(content, /@font-face/g), 1);
	check("carrying the range they spanned", content.includes("font-weight:500 600"), true);
	check("and the payload is embedded once", countMatches(content, /data:font\/woff2;base64/g), 1);
}

// The control: a fix that merged whatever it found would pass everything above.
{
	const content = await run(face(500, FONT_A_URL) + face(600, FONT_B_URL), OTHER_FONT_BYTES, USED_500_600);
	check("two weights of two payloads stay two rules", countMatches(content, /@font-face/g), 2);
	check("and both payloads survive", countMatches(content, /data:font\/woff2;base64/g), 2);
}

// Guard one, the page's own weights. 550 is inside the interval and is not one of the declared
// weights, so after a merge it would render interpolated instead of snapping to 600.
{
	const content = await run(face(500, FONT_A_URL) + face(600, FONT_B_URL), SAME_FONT_BYTES,
		USED_500_600.concat([["merged", "550", "normal", "normal"]]));
	check("a used weight inside the interval blocks the merge", countMatches(content, /@font-face/g), 2);
}

// The other side of that guard: a used weight inside the interval that IS one of the merged weights
// lands on the same axis value either way, so it must not block anything.
{
	const content = await run(face(400, FONT_A_URL) + face(600, FONT_B_URL) + face(700, FONT_C_URL), SAME_FONT_BYTES,
		[["merged", "400", "normal", "normal"], ["merged", "600", "normal", "normal"], ["merged", "700", "normal", "normal"]],
		SAME_FONT_BYTES);
	check("three weights of one payload merge across a used middle weight", countMatches(content, /@font-face/g), 1);
	check("spanning the whole interval", content.includes("font-weight:400 700"), true);
}

// Guard two, the rest of the family. A third face declaring a weight inside the interval would be
// matched against the merged range, and §5.2 leaves that choice to the user agent.
{
	const content = await run(face(500, FONT_A_URL) + face(600, FONT_B_URL) + face(550, FONT_C_URL), SAME_FONT_BYTES,
		USED_500_600, OTHER_FONT_BYTES);
	check("another face inside the interval blocks the merge", countMatches(content, /@font-face/g), 3);
}

// No usedFonts means the computed styles were never read, not that no weight is used.
{
	const content = await run(face(500, FONT_A_URL) + face(600, FONT_B_URL), SAME_FONT_BYTES, []);
	check("an empty usedFonts blocks the merge", countMatches(content, /@font-face/g), 2);
}

// Faces that differ in unicode-range are a composite face, not two candidates for one range: each
// covers characters the other does not, and the spec walks them in reverse declaration order.
{
	const faces = face(500, FONT_A_URL) + face(600, FONT_B_URL, "unicode-range:U+0-FF;");
	const content = await run(faces, SAME_FONT_BYTES, USED_500_600);
	check("a differing unicode-range blocks the merge", countMatches(content, /@font-face/g), 2);
}

// The shape every Google Fonts page has, and the one the corpus pays for: one family subset into a
// latin face and a latin-ext face, each declared at several weights from its own single payload.
// Each subset alone cannot merge — the other subset's faces would then match the same weight without
// being a composite any more — so they merge in lockstep or not at all.
{
	const faces = face(400, FONT_A_URL, LATIN) + face(700, FONT_A_URL, LATIN) +
		face(400, FONT_C_URL, LATIN_EXT) + face(700, FONT_C_URL, LATIN_EXT);
	const content = await run(faces, SAME_FONT_BYTES,
		[["merged", "400", "normal", "normal"], ["merged", "700", "normal", "normal"]]);
	check("two subsets of one family merge together", countMatches(content, /@font-face/g), 2);
	check("each spanning the same range", countMatches(content, /font-weight:400 700/g), 2);
	check("and each keeping its own subset", countMatches(content, /data:font\/woff2;base64/g), 2);
}

if (failed) {
	Deno.exit(1);
}

function face(weight, url, extra = "") {
	return "@font-face{font-family:\"Merged\";font-style:normal;" + extra +
		"font-weight:" + weight + ";src:url(" + url + ") format(\"woff2\")}";
}

async function run(faces, secondFontBytes, usedFonts, thirdFontBytes = OTHER_FONT_BYTES) {
	const page = html("<p>Aa</p>", "<style>" + faces + "p{font-family:\"Merged\"}</style>");
	const pageResources = new Map([
		[PAGE_URL, { body: page, contentType: "text/html" }],
		[FONT_A_URL, { body: FONT_BYTES, contentType: FONT_CONTENT_TYPE }],
		[FONT_B_URL, { body: secondFontBytes, contentType: FONT_CONTENT_TYPE }],
		[FONT_C_URL, { body: thirdFontBytes, contentType: FONT_CONTENT_TYPE }]
	]);
	return capture(pageResources, { url: PAGE_URL, content: page, usedFonts, removeAlternativeFonts: true });
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
