// Two @font-face rules naming two URLs that serve the same bytes cost one copy in a plain capture
// and two in an archive, and the asymmetry was an accident of what the rules end up pointing at.
// removeAlternativeFonts drops a rule whose font key and src both repeat an earlier one. Inline, the
// src is the base64 of the font, so identical bytes ARE an identical src and the repeat collapses.
// In an archive the src is fonts/0.woff2 against fonts/3.woff2, two strings that never match however
// equal the payloads are, so both rules survive and the archive carries the font twice. Measured on
// a capture of nats.io: two byte-identical Roboto subsets, same sha256, stored under two names.
//
// groupDuplicateFonts closes it from the resource side rather than the rule side. Every font whose
// bytes repeat an earlier one is dropped and its name rewritten to the earlier one's, which leaves
// the rules pointing at one file — and that, in turn, is what makes the src of the second rule match
// the first so removeAlternativeFonts collapses it exactly as it does inline. One fix, both halves.
//
// The earlier one is the lowest indexResource and not the first to arrive: resources.fonts is filled
// as the fetches resolve, so "first in the map" is completion order and the name that won would vary
// between runs of the same capture.

import { captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/fonts.html";
const FONT_A_URL = "https://example.com/a.woff2";
const FONT_B_URL = "https://example.com/b.woff2";
const FONT_CONTENT_TYPE = "font/woff2";

// woff2 is a container the capture never parses, so what matters here is only that two payloads are
// equal or unequal by byte and that both are big enough that sharing one is worth doing
const FONT_BYTES = new Uint8Array(512).fill(65);
const SAME_FONT_BYTES = new Uint8Array(512).fill(65);
const OTHER_FONT_BYTES = new Uint8Array(512).fill(66);

let failed = false;

// The case this exists for: one family, two rules, two URLs, one payload.
{
	const { resources, content } = await capture(fontFace("Shared", FONT_A_URL) + fontFace("Shared", FONT_B_URL), SAME_FONT_BYTES);
	check("byte-identical fonts are stored once", resources.fonts.length, 1);
	check("under the name of the lower resource index", (resources.fonts[0] || {}).name, "fonts/0.woff2");
	check("and no rule is left pointing at the dropped name", content.includes("fonts/1.woff2"), false);
	// the src of the second rule now repeats the first, which is what removeAlternativeFonts keys on
	check("the rule that became a repeat is dropped", countMatches(content, /@font-face/g), 1);
}

// The control that makes the above mean something: different bytes must still cost two files, or a
// fix that simply dropped every font but the first would pass every check up there.
{
	const { resources, content } = await capture(fontFace("Shared", FONT_A_URL) + fontFace("Shared", FONT_B_URL), OTHER_FONT_BYTES);
	check("fonts that differ by one byte are both stored", resources.fonts.length, 2);
	check("and both rules survive", countMatches(content, /@font-face/g), 2);
}

// Sharing a payload is not merging faces. Two families that happen to be served the same bytes are
// two rules the page selects between, and only the file underneath them is shared.
{
	const { resources, content } = await capture(fontFace("First", FONT_A_URL) + fontFace("Second", FONT_B_URL), SAME_FONT_BYTES,
		[["first", "400", "normal", "normal"], ["second", "400", "normal", "normal"]]);
	check("two families sharing bytes store one file", resources.fonts.length, 1);
	check("but keep their own rules", countMatches(content, /@font-face/g), 2);
	check("and both point at the shared file", countMatches(content, /fonts\/0\.woff2/g), 2);
}

// saveOriginalURLs stores the URL a rule was written against inside the url() value, ahead of the
// archive name, so the name is a suffix there rather than the whole value. Rewriting the wrong half
// would point the rule at a file that is not in the archive, and the two forms are close enough that
// only a check tells them apart.
{
	const { resources, content } = await capture(fontFace("Shared", FONT_A_URL) + fontFace("Shared", FONT_B_URL), SAME_FONT_BYTES,
		[["shared", "400", "normal", "normal"]], { saveOriginalURLs: true });
	check("a name carried after an original url is still shared", resources.fonts.length, 1);
	// both rules survive here, unlike the first case: the original url is part of the src, so the two
	// srcs still differ and removeAlternativeFonts has nothing to collapse
	check("and both rules point at the shared file", countMatches(content, /fonts\/0\.woff2/g), 2);
	check("with nothing left pointing at the dropped name", content.includes("fonts/1.woff2"), false);
	check("while each rule keeps its own original url", content.includes(FONT_A_URL) && content.includes(FONT_B_URL), true);
}

if (failed) {
	Deno.exit(1);
}

function fontFace(family, url) {
	return "@font-face{font-family:\"" + family + "\";font-style:normal;font-weight:400;src:url(" + url + ") format(\"woff2\")}";
}

async function capture(faces, secondFontBytes, usedFonts = [["shared", "400", "normal", "normal"]], options = {}) {
	const page = html("<p>Aa</p>", "<style>" + faces + "p{font-family:\"Shared\",\"First\",\"Second\"}</style>");
	const pageResources = new Map([
		[PAGE_URL, { body: page, contentType: "text/html" }],
		[FONT_A_URL, { body: FONT_BYTES, contentType: FONT_CONTENT_TYPE }],
		[FONT_B_URL, { body: secondFontBytes, contentType: FONT_CONTENT_TYPE }]
	]);
	// core carries no default for this one, the callers do, and the rule-side half of the fix is what
	// it does once two rules point at one file
	return captureArchive(pageResources, { url: PAGE_URL, content: page, usedFonts, removeAlternativeFonts: true, ...options });
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
