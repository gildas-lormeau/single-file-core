// The font shorthand names the families a page uses as often as font-family does, and
// removeUnusedFonts reads it with vendor/css-font-property-parser.js. That parser matched the weight
// keywords against the raw value of every token, and the raw value of `100%` or `100px` is "100", so
// a size from 100 to 900 was taken for a weight: the next token was then unexpected, the parser threw,
// the error was swallowed, and the families of the declaration were counted as unused. caniuse.com
// sets `body{font:100%/1.5"Open Sans",…}` and lost Open Sans on 184 of its 206 text elements.

import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/fonts.html";
const FONT_URL = "https://example.com/used.woff2";
const OTHER_FONT_URL = "https://example.com/unused.woff2";
const FONT_CONTENT_TYPE = "font/woff2";
const FONT_BYTES = new Uint8Array(512).fill(65);
const OTHER_FONT_BYTES = new Uint8Array(512).fill(66);
const USED_FONTS = [["used", "400", "normal", "normal"]];

let failed = false;

for (const size of ["100%", "100%/1.5", "400px", "bold 100px/1", "italic 700 900%"]) {
	const content = await run("p{font:" + size + " \"Used\",sans-serif}");
	check("a family named after the size " + size + " is kept", content.includes("font-family:\"Used\""), true);
	check("and its font with it (" + size + ")", countMatches(content, /data:font\/woff2;base64/g), 1);
}

// The control: the pass is on, so a family nobody names is removed, and a size that was never read
// as a weight keeps its family as it always did.
{
	const content = await run("p{font:16px/1.5 \"Used\",sans-serif}");
	check("a family named after a size in pixels is kept", content.includes("font-family:\"Used\""), true);
	check("the unused family is removed", content.includes("font-family:\"Unused\""), false);
}

// A number is still a weight when it stands on its own.
{
	const content = await run("p{font:100 16px \"Used\"}");
	check("a weight before the size is still read as a weight", content.includes("font-family:\"Used\""), true);
}

// Any number from 1 to 1000 is a weight in the shorthand, and an angle after oblique belongs to the
// style. Only the keywords and 100 to 900 were known, so `450` or `18deg` was read as the size, and a
// size keyword after it was joined to an unquoted family: `450 medium Used` named "medium Used", the
// real family was removed, and Chrome, Firefox and Safari drew the text with their default font.
for (const value of ["450 medium", "450.5 large", "1000 small", "italic 450 condensed medium", "oblique 18deg medium", "oblique 0.05turn x-large", "oblique -10deg 450 medium", "450 16px/1.2", "calc(450) medium", "min(450, 500) large", "oblique calc(18deg) medium", "oblique calc(10deg + 8deg) 450 medium", "calc(450 * sign(1px)) medium", "oblique calc(18deg * sign(1px)) medium", "sqrt(202500) medium", "oblique atan(1) medium"]) {
	const content = await run("p{font:" + value + " Used,sans-serif}");
	check("a family named after " + value + " is kept", content.includes("font-family:\"Used\""), true);
	check("and the unused family is still removed (" + value + ")", content.includes("font-family:\"Unused\""), false);
}

// What a math function resolves to cannot be read from the units in it (sign(1px) is a number, atan(1)
// an angle), so a token that can be a weight, or the angle of oblique, as well as the size is read both
// ways, and the families of both readings are kept: the wrong one only adds a name no face declares.
for (const value of ["calc(12px + 1em)", "clamp(12px, 2vw, 20px)", "calc(100%)"]) {
	const content = await run("p{font:" + value + " Used,sans-serif}");
	check("a family named after the calculated size " + value + " is kept", content.includes("font-family:\"Used\""), true);
}

// 0 cannot be a weight, so it is a size; and a page in quirks mode may give a unitless size, which is
// read as a size again when reading it as a weight leaves no size at all.
for (const value of ["0", "12"]) {
	const content = await run("p{font:" + value + " \"Used\",sans-serif}");
	check("a family named after the bare number " + value + " is kept", content.includes("font-family:\"Used\""), true);
}

if (failed) {
	Deno.exit(1);
}

async function run(rule) {
	const faces = "@font-face{font-family:\"Used\";src:url(" + FONT_URL + ") format(\"woff2\")}" +
		"@font-face{font-family:\"Unused\";src:url(" + OTHER_FONT_URL + ") format(\"woff2\")}";
	const page = html("<p>Aa</p>", "<style>" + faces + rule + "</style>");
	const pageResources = new Map([
		[PAGE_URL, { body: page, contentType: "text/html" }],
		[FONT_URL, { body: FONT_BYTES, contentType: FONT_CONTENT_TYPE }],
		[OTHER_FONT_URL, { body: OTHER_FONT_BYTES, contentType: FONT_CONTENT_TYPE }]
	]);
	// the list of fonts the browser drew with, as preProcessDoc reads it from the computed styles:
	// the pass keeps a face only when a rule names its family AND this list has it
	return capture(pageResources, { url: PAGE_URL, content: page, removeUnusedFonts: true, usedFonts: USED_FONTS });
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
