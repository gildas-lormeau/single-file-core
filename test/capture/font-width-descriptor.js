// CSS Fonts 4 renamed font-stretch to font-width and kept the old name as an alias. Measured on
// 2026-10-04 with css-corpus/tmp-aster/fontface/font-width-probe.mjs: WebKit 26.5 reads the
// `font-width` descriptor of @font-face, Chromium 151 and Firefox 153 drop it, Chromium ships it in
// 154 and Firefox in 155. The font passes read font-stretch only, so in a Safari save a face declared
// with `font-width: 75%` looked normal and narrowed text kept another face instead. Reading font-width
// alone would break the other engines the opposite way, so a face whose width depends on the name it
// is declared with is matched under both readings, each against the faces of its own reading, and
// kept when either selects it.
import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/width.html";
const FONT_URLS = ["https://example.com/0.woff2", "https://example.com/1.woff2"];

let failed = false;

// The reported stretch comes from the saving browser and each reading is matched against it, so the
// other face may be kept as well: bytes, never a glyph
check("narrowed text in a Safari save keeps the face declared with font-width",
	(await getKeptFaces(["font-width:75%", "font-stretch:50%"], "75%")).includes(0), true);
check("control: the same face declared with font-stretch is the only one kept",
	await getKeptFaces(["font-stretch:75%", "font-stretch:50%"], "75%"), [0]);
check("normal text in a Chrome save keeps the font-width face Chrome reads as normal",
	(await getKeptFaces(["font-width:75%", "font-stretch:87.5%"], "100%")).includes(0), true);
check("the font-width reading of a face does not displace the face the other reading picks",
	(await getKeptFaces(["font-width:75%", "font-stretch:70%"], "87.5%")).includes(1), true);
check("control: a face neither reading selects is still dropped",
	await getKeptFaces(["font-width:75%", "font-stretch:125%"], "125%"), [1]);
check("faces that differ only by font-width are not merged as duplicates",
	(await captureFaces(["font-width:75%", ""], "100%", { removeAlternativeFonts: true, sameSource: true })).length, 2);

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function getKeptFaces(descriptors, drawnStretch) {
	const keptFaces = await captureFaces(descriptors, drawnStretch, { removeUnusedFonts: true });
	return descriptors
		.map((descriptor, index) => keptFaces.some(face => face.includes(descriptor + ";")) ? index : -1)
		.filter(index => index != -1);
}

async function captureFaces(descriptors, drawnStretch, { removeUnusedFonts = false, removeAlternativeFonts = false, sameSource = false }) {
	const style = descriptors.map((descriptor, index) =>
		"@font-face{font-family:\"S\";" + (descriptor ? descriptor + ";" : "") + "src:url(" + FONT_URLS[sameSource ? 0 : index] + ") format(\"woff2\")}").join("") +
		"p{font-family:\"S\"}";
	const page = html("<p>AB</p>", "<style>" + style + "</style>");
	const pageResources = new Map([[PAGE_URL, { body: page, contentType: "text/html" }]]);
	FONT_URLS.forEach((url, index) => pageResources.set(url, { body: new Uint8Array(512).fill(65 + index), contentType: "font/woff2" }));
	const content = await capture(pageResources, {
		url: PAGE_URL,
		content: page,
		removeUnusedFonts,
		removeAlternativeFonts,
		usedFonts: [["s", "400", "normal", "normal", drawnStretch]]
	});
	return Array.from(content.matchAll(/@font-face\s*\{[^}]*\}/g)).map(match => match[0]);
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
