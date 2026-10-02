// removeUnusedFonts keeps the faces a browser would pick for each style the page drew. It used to
// filter the faces by style first and then search the weights, so a face only reachable through a
// style fallback was never picked: text at 75% normal whose only condensed face is italic lost every
// face, and two oblique ranges overlapping the requested angle lost both. The faces are now picked the
// way WebKit, Blink and Gecko each do it, from their own distance functions, by stretch, then style,
// then weight, keeping every face tied at the best distance; a face is kept when one of the engines
// would pick it. Every expectation below was measured in Chrome 154 and Firefox 156, rendering the
// page before and after the capture.

import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/fonts.html";
const FONT_CONTENT_TYPE = "font/woff2";

let failed = false;

check("a condensed face shadowed by a normal one with the same unicode-range is kept for condensed text",
	await run(["font-stretch:75%;unicode-range:U+0041", "font-stretch:100%;unicode-range:U+0041"], [["s", "400", "normal", "normal", "75%"]]),
	[0]);

check("the only condensed face is kept for condensed upright text even when it is italic",
	await run(["font-stretch:75%;font-style:italic", "font-stretch:100%;font-style:normal"], [["s", "400", "normal", "normal", "75%"]]),
	[0]);

check("the oblique range holding the angle wins over a heavier range that does not",
	await run(["font-style:oblique 0deg 20deg;font-weight:400", "font-style:oblique 10deg 20deg;font-weight:700"], [["s", "700", "oblique 5deg", "normal", "100%"]]),
	[0]);

check("an upright subset keeps the characters synthesized into italic",
	await run(["unicode-range:U+0041", "unicode-range:U+0042"], [["s", "400", "normal", "normal", "100%"], ["s", "400", "italic", "normal", "100%"]], {
		markup: "A<em>B</em>",
		usedFontsCharacters: [["s", "normal", [[65, 65]], 0], ["s", "italic", [[66, 66]], 0]]
	}),
	[0, 1]);

check("a static face tied with a range at the weight the search lands on is kept with it",
	await run(["font-weight:100 600", "font-weight:100"], [["s", "50", "normal", "normal", "100%"]]),
	[0, 1]);

check("a fractional weight keeps its exact face and drops the nearest integer one",
	await run(["font-weight:400.5", "font-weight:401"], [["s", "400.5", "normal", "normal", "100%"]]),
	[0]);

check("an oblique angle in turns is compared in degrees",
	await run(["font-style:oblique 0.05turn", "font-style:normal"], [["s", "400", "oblique 18deg", "normal", "100%"]]),
	[0]);

// Gecko picks the italic face and Blink the bold oblique one, because Blink reads italic as 14deg
check("italic text keeps the italic face Gecko picks and the oblique face Blink picks",
	await run(["font-style:italic;font-weight:400", "font-style:oblique;font-weight:700"], [["s", "700", "italic", "normal", "100%"]]),
	[0, 1]);

// CSS Fonts 4 looks above 11deg first, both engines take the nearer angle below 14deg
check("a 12deg request keeps the nearer 5deg face over the 20deg one",
	await run(["font-style:oblique 5deg", "font-style:oblique 20deg"], [["s", "400", "oblique 12deg", "normal", "100%"]]),
	[0]);

check("upright text keeps the italic face Blink picks and the negative oblique face Gecko picks",
	await run(["font-style:italic", "font-style:oblique -20deg"], [["s", "400", "normal", "normal", "100%"]]),
	[0, 1]);

if (failed) {
	Deno.exit(1);
}

async function run(faces, usedFonts, { markup = "AB", usedFontsCharacters } = {}) {
	const fontURLs = faces.map((descriptors, index) => "https://example.com/" + index + ".woff2");
	const style = faces.map((descriptors, index) =>
		"@font-face{font-family:\"S\";src:url(" + fontURLs[index] + ") format(\"woff2\");" + descriptors + "}").join("") +
		"p{font-family:\"S\",sans-serif}";
	const page = html("<p>" + markup + "</p>", "<style>" + style + "</style>");
	const pageResources = new Map([[PAGE_URL, { body: page, contentType: "text/html" }]]);
	fontURLs.forEach((url, index) => pageResources.set(url, { body: new Uint8Array(512).fill(65 + index), contentType: FONT_CONTENT_TYPE }));
	const content = await capture(pageResources, { url: PAGE_URL, content: page, removeUnusedFonts: true, usedFonts, usedFontsCharacters });
	const keptFaces = Array.from(content.matchAll(/@font-face\s*\{[^}]*\}/g)).map(match => match[0]);
	return faces
		.map((descriptors, index) => keptFaces.some(face => descriptors.split(";").every(descriptor =>
			face.includes(descriptor + ";") || face.includes(descriptor + "}"))) ? index : -1)
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
