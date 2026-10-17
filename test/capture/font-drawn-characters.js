// removeUnusedFonts tests each unicode-range against the characters of the page before it looks at
// the characters the browser reports having drawn with each family. The static set is read from the
// text of the "content" and "quotes" declarations and from the body text, so a glyph set through a
// custom property, Font Awesome 7's `.fa-x-twitter{--fa:"\e61b"}` behind `::before{content:var(--fa)}`,
// was never in it: the subsets holding the brand icons met the page in no Latin text and were
// removed, and the icons were drawn with the fallback font. The drawn characters are now part of
// the set the static tests read.

import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/fonts.html";
const FONT_CONTENT_TYPE = "font/woff2";
const USED_FONTS = [["s", "400", "normal", "normal", "100%"]];
const ICON_FACE = "unicode-range:U+F002";
const DRAWN_ICON = [["s", "normal", [[0xf002, 0xf002]], 0]];

let failed = false;

check("a face whose unicode-range holds a glyph set through var() in content is kept when the browser drew it",
	await run([ICON_FACE], "i{--g:\"\\f002\"}i::before{content:var(--g)}", DRAWN_ICON),
	[0]);

check("and still kept when the glyph is a literal string",
	await run([ICON_FACE], "i::before{content:\"\\f002\"}", DRAWN_ICON),
	[0]);

check("and removed when the browser drew nothing with it",
	await run([ICON_FACE], "i{--g:\"\\f002\"}i::before{content:var(--g)}", []),
	[]);

check("a drawn glyph does not keep a later subset that shadows it",
	await run([ICON_FACE, ICON_FACE], "i{--g:\"\\f002\"}i::before{content:var(--g)}", DRAWN_ICON),
	[1]);

check("a drawn tab or newline keeps no face on its own",
	await run(["unicode-range:U+0009-000A"], "i::before{content:\"\\9\"}", [["s", "normal", [[9, 10]], 0]]),
	[]);

if (failed) {
	Deno.exit(1);
}

async function run(faces, rules, usedFontsCharacters) {
	const fontURLs = faces.map((descriptors, index) => "https://example.com/" + index + ".woff2");
	const style = faces.map((descriptors, index) =>
		"@font-face{font-family:\"S\";src:url(" + fontURLs[index] + ") format(\"woff2\");" + descriptors + "}").join("") +
		"i::before{font-family:\"S\",sans-serif}" + rules;
	const page = html("<p>A<i></i></p>", "<style>" + style + "</style>");
	const pageResources = new Map([[PAGE_URL, { body: page, contentType: "text/html" }]]);
	fontURLs.forEach((url, index) => pageResources.set(url, { body: new Uint8Array(512).fill(65 + index), contentType: FONT_CONTENT_TYPE }));
	const content = await capture(pageResources, { url: PAGE_URL, content: page, removeUnusedFonts: true, usedFonts: USED_FONTS, usedFontsCharacters });
	const keptSources = Array.from(content.matchAll(/@font-face\s*\{[^}]*\}/g)).map(match => match[0]);
	return faces
		.map((descriptors, index) => keptSources.some(face => face.includes("data:font/woff2;base64," + btoa(String.fromCharCode(...new Uint8Array(512).fill(65 + index))))) ? index : -1)
		.filter(index => index != -1);
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
