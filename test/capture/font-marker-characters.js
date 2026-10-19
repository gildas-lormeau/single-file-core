// removeUnusedFonts keeps a unicode-range face only when the page draws a character in its range, and
// the characters the browser draws are not always the characters the DOM holds. A list marker is text
// the DOM does not contain: the digits of an ordered list, the glyph of a `::marker{content:var(--g)}`
// icon. `text-transform: uppercase` draws É where the text node holds é. Measured on 2026-10-20 in
// Chrome and Firefox with the CLI: both load the digit, icon and upper-case faces and core dropped all
// three; neither loads a face for a default disc, circle or square bullet, which both engines paint as
// a shape rather than a glyph, so those report no character. The marker and the transform now report
// what the browser draws, and a counter style that cannot be enumerated reports unknown.
import { helper } from "./common.js";

let failed = false;

const doc = new globalThis.DOMParser().parseFromString("<html lang=\"en\"><body><p id=\"p\">élan</p><div lang=\"tr\"><p id=\"tr\">i</p></div></body></html>", "text/html");
const paragraph = doc.getElementById("p");
const turkish = doc.getElementById("tr");

// Markers with no content of their own: the counter style says what is drawn.
check("decimal marker reports the digits", chars(marker({ "list-style-type": "decimal" })).includes("0123456789"), true);
check("lower-roman marker reports the roman letters", chars(marker({ "list-style-type": "lower-roman" })).includes("ivxlcdm"), true);
check("upper-alpha marker reports the upper-case alphabet", chars(marker({ "list-style-type": "upper-alpha" })).includes("ABCDEFGHIJKLMNOPQRSTUVWXYZ"), true);
check("disc marker reports no character and is not unknown", marker({ "list-style-type": "disc" }), { characters: "" });
check("square marker reports no character", chars(marker({ "list-style-type": "square" })), "");
check("none marker reports no character", chars(marker({ "list-style-type": "none" })), "");
check("a string marker reports the string", chars(marker({ "list-style-type": "\"→\"" })), "→");
check("a custom counter style is unknown", marker({ "list-style-type": "my-style" }).unknown, true);
check("symbols() is unknown", marker({ "list-style-type": "symbols(cyclic \"*\" \"†\")" }).unknown, true);

// Markers with content: the content is what is drawn, like any pseudo-element.
check("marker content reports its glyph", chars(marker({ "list-style-type": "disc" }, { content: "\"\"" })), "");
check("marker content: none reports no character", chars(marker({ "list-style-type": "decimal" }, { content: "none" })), "");
check("marker content with counter() is unknown", marker({ "list-style-type": "decimal" }, { content: "counter(item) \". \"" }).unknown, true);

// text-transform on the element, on a pseudo-element and on a marker.
check("uppercase text reports the upper-case characters", chars(elementCharacters({ "text-transform": "uppercase" })).includes("ÉLAN"), true);
check("and still reports the source characters", chars(elementCharacters({ "text-transform": "uppercase" })).includes("élan"), true);
check("capitalize reports the upper-case characters", chars(elementCharacters({ "text-transform": "capitalize" })).includes("É"), true);
check("lowercase reports the lower-case characters", chars(helper.getElementCharacters(globalThis, turkish, style({ "text-transform": "lowercase" }))).includes("i"), true);
check("uppercase follows the element's lang", chars(helper.getElementCharacters(globalThis, turkish, style({ "text-transform": "uppercase" }))).includes("İ"), true);
check("full-width reports the full-width forms", chars(elementCharacters({ "text-transform": "full-width" })).includes("ｌａｎ"), true);
check("a transform that cannot be enumerated is unknown", elementCharacters({ "text-transform": "full-size-kana" }).unknown, true);
check("control: no transform reports the text as is", elementCharacters({ "text-transform": "none" }), { characters: "élan" });
check("a pseudo-element content is transformed too", chars(helper.getPseudoElementCharacters(style({ content: "\"é\"", "text-transform": "uppercase" }), paragraph)).includes("É"), true);
check("a marker is transformed too", chars(marker({ "list-style-type": "lower-alpha" }, { content: "normal", "text-transform": "uppercase" })).includes("A"), true);

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function marker(elementStyle, markerStyle = { content: "normal" }) {
	return helper.getMarkerCharacters(style({ "text-transform": "none", ...markerStyle }), style({ "text-transform": "none", ...elementStyle }), paragraph);
}

function elementCharacters(elementStyle) {
	return helper.getElementCharacters(globalThis, paragraph, style(elementStyle));
}

function style(properties) {
	return { getPropertyValue: name => properties[name] === undefined ? "" : properties[name] };
}

function chars(drawnCharacters) {
	return drawnCharacters.characters;
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
