// removeUnusedFonts tests each unicode-range against the characters of the page. They were read with
// charCodeAt, which gives the first UTF-16 code unit, so a character above U+FFFF was seen as its high
// surrogate: 😀 became U+D83D, a face declaring unicode-range:U+1F600 matched nothing on the page and
// was removed, and Chrome, Firefox and Safari drew the emoji with the system font instead. Google Fonts
// serves its emoji and CJK Extension B subsets this way. The characters are now read with codePointAt.

import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/fonts.html";
const FONT_CONTENT_TYPE = "font/woff2";
const USED_FONTS = [["s", "400", "normal", "normal", "100%"]];

let failed = false;

check("a face whose unicode-range holds an emoji of the page is kept",
	await run(["unicode-range:U+1F600"], "\u{1F600}"),
	[0]);

check("and still removed when the page does not hold the emoji",
	await run(["unicode-range:U+1F600"], "A"),
	[]);

check("a range of surrogate code points does not match the emoji",
	await run(["unicode-range:U+D800-DFFF"], "\u{1F600}"),
	[]);

check("a later subset shadows an earlier one only for the emoji it holds",
	await run(["unicode-range:U+1F600-1F601", "unicode-range:U+1F601"], "\u{1F600}\u{1F601}"),
	[0, 1]);

check("a subset whose emoji are all held by a later one is removed",
	await run(["unicode-range:U+1F600-1F601", "unicode-range:U+1F600-1F601"], "\u{1F600}"),
	[1]);

if (failed) {
	Deno.exit(1);
}

async function run(faces, text) {
	const fontURLs = faces.map((descriptors, index) => "https://example.com/" + index + ".woff2");
	const style = faces.map((descriptors, index) =>
		"@font-face{font-family:\"S\";src:url(" + fontURLs[index] + ") format(\"woff2\");" + descriptors + "}").join("") +
		"p{font-family:\"S\",sans-serif}";
	const page = html("<p>" + text + "</p>", "<style>" + style + "</style>");
	const pageResources = new Map([[PAGE_URL, { body: page, contentType: "text/html" }]]);
	fontURLs.forEach((url, index) => pageResources.set(url, { body: new Uint8Array(512).fill(65 + index), contentType: FONT_CONTENT_TYPE }));
	const content = await capture(pageResources, { url: PAGE_URL, content: page, removeUnusedFonts: true, usedFonts: USED_FONTS });
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
