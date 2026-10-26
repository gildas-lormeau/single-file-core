// `removeUnusedGlyphs`: `modules/font-glyphs-minifier.js`, run by `removeUnusedGlyphs` in both processor
// helpers after the fonts are fetched. A page that embeds a large font for a few characters keeps the
// whole font: twreporter.org carried two 21 MB Source Han Serif faces for 8 characters. Subsetting a
// font properly means renumbering glyphs through GSUB and GPOS, which is HarfBuzz territory. This pass
// instead keeps every glyph id where it is, empties the outlines of the glyphs the page never draws,
// and removes their characters from cmap, so the layout tables stay valid without being read, and a
// character the page did not draw falls back to the next font instead of rendering as nothing. The
// glyphs a GSUB lookup produces from kept glyphs keep their outlines, to a fixed point, as do the
// components of a kept composite glyph, so ligatures and accented letters built from parts still draw.
//
// The font below is built here, glyph by glyph: .notdef, A, B, C as a composite of A, D, and the
// ligature AB that a GSUB lookup produces. happy-dom carries no font engine, so the checks read the
// saved font back: which glyphs still hold an outline, what cmap maps, and that GSUB is byte-identical.
// The same font is checked in Chromium by hand (scratchpad glyphs/verify.mjs, 2026-10-23): a hollowed
// Arial, Georgia and Tahoma load, the kept text measures the same width as with the original, and a
// dropped letter measures as the fallback font.
/* global atob, Blob, CompressionStream, DecompressionStream */
import { capture, html } from "./common.js";
import { process } from "../../modules/font-glyphs-minifier.js";

const PAGE_URL = "https://example.com/glyphs.html";
const FONT_URL = "https://example.com/font.ttf";
const A = 1, B = 2, C = 3, LIGATURE = 5, VARIANT_1 = 6, VARIANT_2 = 7, RING_A = 8, LEFT_PAREN = 9, RIGHT_PAREN = 10, E = 11, DOT_E = 12, DOT_CIRCUMFLEX_E = 13, GA = 14;
const GLYPH_COUNT = 15;
const CHAR_A = 65, CHAR_B = 66, CHAR_C = 67, CHAR_D = 68;
const CHAR_RING_A = 0xC5, CHAR_RING = 0x30A, CHAR_LEFT_PAREN = 0x28, CHAR_RIGHT_PAREN = 0x29, SELECTOR_1 = 0xFE00, SELECTOR_2 = 0xFE01;
const CHAR_E = 0x65, CHAR_DOT_BELOW = 0x323, CHAR_CIRCUMFLEX = 0x302, CHAR_DOT_E = 0x1EB9, CHAR_DOT_CIRCUMFLEX_E = 0x1EC7, CHAR_GA = 0xAC00, CHAR_KIYEOK = 0x1100, CHAR_A_JAMO = 0x1161;
const ALL_CHARS = [[CHAR_LEFT_PAREN, CHAR_RIGHT_PAREN], [CHAR_A, CHAR_D], [CHAR_E, CHAR_E], [CHAR_RING_A, CHAR_RING_A], [CHAR_DOT_E, CHAR_DOT_E], [CHAR_DOT_CIRCUMFLEX_E, CHAR_DOT_CIRCUMFLEX_E], [CHAR_GA, CHAR_GA]];
const FSTYPE_NO_SUBSETTING = 0x0100;

let failed = false;

const font = buildFont();
const woff = buildWoff(font);

// The case this exists for: the page draws A and C, so B, D and the ligature AB, which needs B, lose
// their outlines, B and D lose their cmap entries, while A, C and A as C's component stay, and GSUB
// is untouched.
{
	const result = await process(font, [[CHAR_A, CHAR_A], [CHAR_C, CHAR_C]]);
	check("a TrueType font is hollowed", result !== null, true);
	const info = readFont(result);
	check("the drawn glyphs keep their outlines", JSON.stringify(outlinedGlyphs(info)), JSON.stringify([A, C, VARIANT_1, VARIANT_2]));
	check("cmap maps the drawn characters only", JSON.stringify([...info.cmap]), JSON.stringify([[CHAR_A, A], [CHAR_C, C]]));
	check("GSUB is byte-identical", sameBytes(info.tables.get("GSUB"), readFont(font).tables.get("GSUB")), true);
	check("the glyph count is unchanged", info.glyphCount, GLYPH_COUNT);
	check("the font checksum is valid", info.checksumValid, true);
	check("and the font is smaller", result.length < font.length, true);
}

// A ligature is kept once every glyph it is made of is drawn: A and B keep AB, with nothing mapped
// to it since no character selects it directly.
{
	const info = readFont(await process(font, [[CHAR_A, CHAR_B]]));
	check("a ligature of drawn glyphs is kept", JSON.stringify(outlinedGlyphs(info)), JSON.stringify([A, B, LIGATURE, VARIANT_1, VARIANT_2]));
	check("and cmap maps its components only", JSON.stringify([...info.cmap]), JSON.stringify([[CHAR_A, A], [CHAR_B, B]]));
}

// A composite glyph keeps its components: drawing C alone keeps A's outline too.
{
	const info = readFont(await process(font, [[CHAR_C, CHAR_C]]));
	check("the component of a composite glyph is kept", JSON.stringify(outlinedGlyphs(info)), JSON.stringify([A, C]));
	check("without mapping its character", info.cmap.has(CHAR_A), false);
}

// Nothing to remove: every character is drawn, so the font is returned as is.
{
	check("a font whose glyphs are all drawn is left alone", await process(font, ALL_CHARS), null);
}

// What the shaper reaches beyond the characters of the text: both variation sequences of a drawn
// base character keep their glyphs, a combining sequence keeps the precomposed character the
// shaper composes it into, a precomposed character keeps the pieces it decomposes into, and a
// bracket keeps its mirror for right-to-left runs.
{
	check("every variation glyph of a drawn character is kept", JSON.stringify(outlinedGlyphs(readFont(await process(font, [[CHAR_A, CHAR_A]])))), JSON.stringify([A, VARIANT_1, VARIANT_2]));
	const composed = readFont(await process(font, [[CHAR_A, CHAR_A], [CHAR_RING, CHAR_RING]]));
	check("a base and a combining mark keep their composition", outlinedGlyphs(composed).includes(RING_A) && composed.cmap.get(CHAR_RING_A), RING_A);
	const decomposed = readFont(await process(font, [[CHAR_RING_A, CHAR_RING_A]]));
	check("a precomposed character keeps its base", outlinedGlyphs(decomposed).includes(A) && decomposed.cmap.get(CHAR_A), A);
	const mirrored = readFont(await process(font, [[CHAR_LEFT_PAREN, CHAR_LEFT_PAREN]]));
	check("a bracket keeps its mirror", outlinedGlyphs(mirrored).includes(RIGHT_PAREN) && mirrored.cmap.get(CHAR_RIGHT_PAREN), RIGHT_PAREN);
	const chained = readFont(await process(font, [[CHAR_E, CHAR_E], [CHAR_CIRCUMFLEX, CHAR_CIRCUMFLEX], [CHAR_DOT_BELOW, CHAR_DOT_BELOW]]));
	check("a base and two marks keep the composition of their composition", JSON.stringify([chained.cmap.get(CHAR_DOT_E), chained.cmap.get(CHAR_DOT_CIRCUMFLEX_E)]), JSON.stringify([DOT_E, DOT_CIRCUMFLEX_E]));
	const hangul = readFont(await process(font, [[CHAR_KIYEOK, CHAR_KIYEOK], [CHAR_A_JAMO, CHAR_A_JAMO]]));
	check("hangul jamo keep their syllable", outlinedGlyphs(hangul).includes(GA) && hangul.cmap.get(CHAR_GA), GA);
	check("and a syllable keeps nothing it does not decompose into", JSON.stringify(outlinedGlyphs(readFont(await process(font, [[CHAR_GA, CHAR_GA]])))), JSON.stringify([GA]));
}

// A font with a MATH table is left alone: its stretched operators reference glyphs the pass
// does not follow.
{
	check("a font with a MATH table is left alone", await process(buildSfnt(new Map([...readFont(font).tables, ["MATH", new Uint8Array(10)]])), [[CHAR_A, CHAR_A]]), null);
}

// A font that forbids subsetting in its OS/2 fsType is left alone.
{
	check("a font with the no-subsetting bit is left alone", await process(buildFont(FSTYPE_NO_SUBSETTING), [[CHAR_A, CHAR_A]]), null);
}

// A WOFF font is unpacked, hollowed and packed back as WOFF.
{
	const result = await process(woff, [[CHAR_A, CHAR_A], [CHAR_C, CHAR_C]]);
	check("a WOFF font is hollowed", result !== null && tag(result, 0) == "wOFF", true);
	const info = readFont(await unpackWoff(result));
	check("with the same glyphs kept", JSON.stringify(outlinedGlyphs(info)), JSON.stringify([A, C, VARIANT_1, VARIANT_2]));
	check("and the same cmap", JSON.stringify([...info.cmap]), JSON.stringify([[CHAR_A, A], [CHAR_C, C]]));
}

// A WOFF2 font is read through Brotli, hollowed and written back as WOFF2 with the glyf and loca
// transform of the format, decoded here by a reader written from the spec: glyph records that were
// stored with the null transform come back with the same outlines, bounding boxes and components.
{
	const woff2 = await buildWoff2(font);
	const result = await process(woff2, [[CHAR_A, CHAR_A], [CHAR_C, CHAR_C]]);
	check("a WOFF2 font is hollowed", result !== null && tag(result, 0) == "wOF2", true);
	const unpacked = await unpackWoff2(result);
	const info = readFont(unpacked);
	check("with the same glyphs kept", JSON.stringify(outlinedGlyphs(info)), JSON.stringify([A, C, VARIANT_1, VARIANT_2]));
	check("and the same cmap", JSON.stringify([...info.cmap]), JSON.stringify([[CHAR_A, A], [CHAR_C, C]]));
	const original = readFont(font);
	check("the kept simple glyph is rebuilt as drawn", sameBytes(glyphRecord(info, A), glyphRecord(original, A)), true);
	check("the kept composite glyph is rebuilt as drawn", sameBytes(glyphRecord(info, C), glyphRecord(original, C)), true);
	check("the head table flags the lossless transform", (readUint16(info.tables.get("head"), 16) & 0x0800) != 0, true);
	check("and the file is padded to 4 bytes", result.length % 4, 0);
}

// A WOFF2 font whose hmtx table was stored transformed gets its side bearings back from the glyph
// bounding boxes before the pass runs, so the output hmtx is the original one.
{
	const result = await process(await buildWoff2(font, true), [[CHAR_A, CHAR_A]]);
	check("a transformed hmtx table is rebuilt", sameBytes(readFont(await unpackWoff2(result)).tables.get("hmtx"), readFont(font).tables.get("hmtx")), true);
}

// Through a capture: the saved page carries the hollowed font, and the pass needs the drawn
// characters of the family, so an unknown character set or the option left off keeps the font as is.
{
	const drawn = [["s", "normal", [[CHAR_A, CHAR_A], [CHAR_C, CHAR_C]], 0]];
	const info = readFont(await captureFont({ removeUnusedGlyphs: true, usedFontsCharacters: drawn }));
	check("a captured page carries the hollowed font", JSON.stringify(outlinedGlyphs(info)), JSON.stringify([A, C, VARIANT_1, VARIANT_2]));
	check("the option off keeps the font", sameBytes(await captureFont({ usedFontsCharacters: drawn }), font), true);
	check("an unknown character set keeps the font", sameBytes(await captureFont({ removeUnusedGlyphs: true, usedFontsCharacters: [["s", "normal", [[CHAR_A, CHAR_A]], 1]] }), font), true);
	check("a family the page never draws keeps the font", sameBytes(await captureFont({ removeUnusedGlyphs: true, usedFontsCharacters: [["t", "normal", [[CHAR_A, CHAR_A]], 0]] }), font), true);
	const woff2Info = readFont(await unpackWoff2(await captureFont({ removeUnusedGlyphs: true, usedFontsCharacters: drawn }, await buildWoff2(font), "font/woff2")));
	check("a captured page carries a hollowed WOFF2 font", JSON.stringify(outlinedGlyphs(woff2Info)), JSON.stringify([A, C, VARIANT_1, VARIANT_2]));
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function captureFont(options, fontData = font, contentType = "font/ttf") {
	const page = html("<p>AC</p>", `<style>@font-face{font-family:"S";src:url(${FONT_URL}) format("${contentType == "font/ttf" ? "truetype" : "woff2"}")}p{font-family:"S"}</style>`);
	const resources = new Map([[PAGE_URL, { body: page, contentType: "text/html" }], [FONT_URL, { body: fontData, contentType }]]);
	const content = await capture(resources, { url: PAGE_URL, content: page, removeUnusedFonts: false, usedFonts: [["s", "400", "normal", "normal", "100%"]], ...options });
	const match = content.match(new RegExp("data:" + contentType.replace("/", "\\/") + ";base64,([^\"')]+)"));
	return match ? Uint8Array.from(atob(match[1]), character => character.charCodeAt(0)) : null;
}

function glyphRecord(info, glyphId) {
	const loca = info.tables.get("loca");
	const longLoca = readUint16(info.tables.get("head"), 50) == 1;
	const offset = longLoca ? readUint32(loca, glyphId * 4) : readUint16(loca, glyphId * 2) * 2;
	const end = longLoca ? readUint32(loca, (glyphId + 1) * 4) : readUint16(loca, (glyphId + 1) * 2) * 2;
	return info.tables.get("glyf").subarray(offset, end);
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(actual)}${ok ? "" : " (expected " + JSON.stringify(expected) + ")"}`);
	failed ||= !ok;
}

function outlinedGlyphs(info) {
	return info.glyphLengths.map((length, glyphId) => length ? glyphId : -1).filter(glyphId => glyphId != -1);
}

function sameBytes(bytes, otherBytes) {
	return Boolean(bytes && otherBytes) && bytes.length == otherBytes.length && bytes.every((value, index) => value == otherBytes[index]);
}

function buildFont(fsType = 0) {
	const triangle = simpleGlyph([[0, 0], [100, 0], [50, 100]]);
	const polygon = simpleGlyph(Array.from({ length: 48 }, (_, index) => [(index * 37) % 1000, (index * 91) % 1000]));
	const glyphs = [new Uint8Array(0), triangle, polygon, compositeGlyph(A), polygon, polygon, triangle, triangle, triangle, triangle, triangle, triangle, triangle, triangle, triangle];
	const loca = new Uint8Array((GLYPH_COUNT + 1) * 4);
	let offset = 0;
	glyphs.forEach((glyph, glyphId) => {
		writeUint32(loca, glyphId * 4, offset);
		offset += glyph.length;
	});
	writeUint32(loca, GLYPH_COUNT * 4, offset);
	const glyf = new Uint8Array(offset);
	glyphs.forEach((glyph, glyphId) => glyf.set(glyph, readUint32(loca, glyphId * 4)));
	const head = new Uint8Array(54);
	writeUint32(head, 0, 0x00010000);
	writeUint32(head, 12, 0x5F0F3CF5);
	writeUint16(head, 18, 1000);
	writeUint16(head, 40, 100);
	writeUint16(head, 42, 100);
	writeUint16(head, 46, 8);
	writeUint16(head, 48, 2);
	writeUint16(head, 50, 1);
	const hhea = new Uint8Array(36);
	writeUint32(hhea, 0, 0x00010000);
	writeUint16(hhea, 4, 800);
	writeUint16(hhea, 6, 0xFF38);
	writeUint16(hhea, 10, 500);
	writeUint16(hhea, 16, 100);
	writeUint16(hhea, 18, 1);
	writeUint16(hhea, 34, GLYPH_COUNT);
	const maxp = new Uint8Array(32);
	writeUint32(maxp, 0, 0x00010000);
	writeUint16(maxp, 4, GLYPH_COUNT);
	writeUint16(maxp, 6, 3);
	writeUint16(maxp, 8, 1);
	writeUint16(maxp, 10, 3);
	writeUint16(maxp, 12, 1);
	writeUint16(maxp, 14, 2);
	writeUint16(maxp, 28, 1);
	writeUint16(maxp, 30, 1);
	const hmtx = new Uint8Array(GLYPH_COUNT * 4);
	for (let glyphId = 0; glyphId < GLYPH_COUNT; glyphId++) {
		writeUint16(hmtx, glyphId * 4, 500);
	}
	const post = new Uint8Array(32);
	writeUint32(post, 0, 0x00030000);
	const os2 = new Uint8Array(78);
	writeUint16(os2, 8, fsType);
	const name = new Uint8Array(6);
	writeUint16(name, 4, 6);
	return buildSfnt(new Map([
		["cmap", buildCmap()], ["glyf", glyf], ["loca", loca], ["head", head], ["hhea", hhea], ["hmtx", hmtx],
		["maxp", maxp], ["name", name], ["OS/2", os2], ["post", post], ["GSUB", buildGsub()]
	]));
}

function simpleGlyph(points) {
	const glyph = new Uint8Array(10 + 2 + 2 + points.length * 5);
	writeUint16(glyph, 0, 1);
	writeUint16(glyph, 6, 100);
	writeUint16(glyph, 8, 100);
	writeUint16(glyph, 10, points.length - 1);
	writeUint16(glyph, 12, 0);
	let offset = 14;
	points.forEach(() => glyph[offset++] = 1);
	let previous = [0, 0];
	[0, 1].forEach(axis => points.forEach(point => {
		writeUint16(glyph, offset, (point[axis] - previous[axis]) & 0xFFFF);
		previous[axis] = point[axis];
		offset += 2;
	}));
	return glyph;
}

function compositeGlyph(componentGlyphId) {
	const glyph = new Uint8Array(18);
	writeUint16(glyph, 0, 0xFFFF);
	writeUint16(glyph, 6, 100);
	writeUint16(glyph, 8, 100);
	writeUint16(glyph, 10, 0x0003);
	writeUint16(glyph, 12, componentGlyphId);
	return glyph;
}

// A format 4 subtable of delta-mapped segments, and a format 14 subtable giving A two variation
// selectors, each with its own glyph.
function buildCmap() {
	const segments = [[CHAR_LEFT_PAREN, CHAR_RIGHT_PAREN, LEFT_PAREN], [CHAR_A, CHAR_D, A], [CHAR_E, CHAR_E, E], [CHAR_RING_A, CHAR_RING_A, RING_A], [CHAR_DOT_E, CHAR_DOT_E, DOT_E], [CHAR_DOT_CIRCUMFLEX_E, CHAR_DOT_CIRCUMFLEX_E, DOT_CIRCUMFLEX_E], [CHAR_GA, CHAR_GA, GA], [0xFFFF, 0xFFFF, 0]];
	const segmentCount = segments.length;
	const subtable = new Uint8Array(16 + segmentCount * 8);
	writeUint16(subtable, 0, 4);
	writeUint16(subtable, 2, subtable.length);
	writeUint16(subtable, 6, segmentCount * 2);
	writeUint16(subtable, 8, 4);
	writeUint16(subtable, 10, 1);
	writeUint16(subtable, 12, segmentCount * 2 - 4);
	segments.forEach(([startCode, endCode, glyphId], index) => {
		writeUint16(subtable, 14 + index * 2, endCode);
		writeUint16(subtable, 16 + segmentCount * 2 + index * 2, startCode);
		writeUint16(subtable, 16 + segmentCount * 4 + index * 2, (glyphId - startCode) & 0xFFFF);
	});
	const variations = new Uint8Array(50);
	writeUint16(variations, 0, 14);
	writeUint32(variations, 2, 50);
	writeUint32(variations, 6, 2);
	[[SELECTOR_1, VARIANT_1], [SELECTOR_2, VARIANT_2]].forEach(([selector, glyphId], index) => {
		const recordOffset = 10 + index * 11;
		variations[recordOffset + 1] = (selector >> 8) & 0xFF;
		variations[recordOffset + 2] = selector & 0xFF;
		const mappingsOffset = 32 + index * 9;
		writeUint32(variations, recordOffset + 7, mappingsOffset);
		writeUint32(variations, mappingsOffset, 1);
		variations[mappingsOffset + 6] = CHAR_A;
		writeUint16(variations, mappingsOffset + 7, glyphId);
	});
	const cmap = new Uint8Array(4 + 2 * 8 + subtable.length + variations.length);
	writeUint16(cmap, 2, 2);
	writeUint16(cmap, 4, 0);
	writeUint16(cmap, 6, 3);
	writeUint32(cmap, 8, 20);
	writeUint16(cmap, 12, 0);
	writeUint16(cmap, 14, 5);
	writeUint32(cmap, 16, 20 + subtable.length);
	cmap.set(subtable, 20);
	cmap.set(variations, 20 + subtable.length);
	return cmap;
}

// header, then ScriptList (DFLT, default LangSys with feature 0), FeatureList (liga, lookup 0),
// LookupList (one ligature lookup whose coverage is A and whose only ligature is A B -> LIGATURE)
function buildGsub() {
	const gsub = new Uint8Array(80);
	writeUint16(gsub, 0, 1);
	writeUint16(gsub, 4, 10);
	writeUint16(gsub, 6, 30);
	writeUint16(gsub, 8, 44);
	writeUint16(gsub, 10, 1);
	gsub.set([68, 70, 76, 84], 12);
	writeUint16(gsub, 16, 8);
	writeUint16(gsub, 18, 4);
	writeUint16(gsub, 20, 0);
	writeUint16(gsub, 22, 0);
	writeUint16(gsub, 24, 0xFFFF);
	writeUint16(gsub, 26, 1);
	writeUint16(gsub, 28, 0);
	writeUint16(gsub, 30, 1);
	gsub.set([108, 105, 103, 97], 32);
	writeUint16(gsub, 36, 8);
	writeUint16(gsub, 38, 0);
	writeUint16(gsub, 40, 1);
	writeUint16(gsub, 42, 0);
	writeUint16(gsub, 44, 1);
	writeUint16(gsub, 46, 4);
	writeUint16(gsub, 48, 4);
	writeUint16(gsub, 50, 0);
	writeUint16(gsub, 52, 1);
	writeUint16(gsub, 54, 8);
	writeUint16(gsub, 56, 1);
	writeUint16(gsub, 58, 8);
	writeUint16(gsub, 60, 1);
	writeUint16(gsub, 62, 14);
	writeUint16(gsub, 64, 1);
	writeUint16(gsub, 66, 1);
	writeUint16(gsub, 68, A);
	writeUint16(gsub, 70, 1);
	writeUint16(gsub, 72, 4);
	writeUint16(gsub, 74, LIGATURE);
	writeUint16(gsub, 76, 2);
	writeUint16(gsub, 78, B);
	return gsub;
}

function buildSfnt(tables) {
	const tags = Array.from(tables.keys()).sort();
	let offset = 12 + tags.length * 16;
	const offsets = new Map();
	tags.forEach(tag => {
		offsets.set(tag, offset);
		offset += (tables.get(tag).length + 3) & ~3;
	});
	const data = new Uint8Array(offset);
	writeUint32(data, 0, 0x00010000);
	writeUint16(data, 4, tags.length);
	tags.forEach((tag, index) => {
		const entry = 12 + index * 16;
		data.set(tag.split("").map(character => character.charCodeAt(0)), entry);
		writeUint32(data, entry + 4, checksum(tables.get(tag)));
		writeUint32(data, entry + 8, offsets.get(tag));
		writeUint32(data, entry + 12, tables.get(tag).length);
		data.set(tables.get(tag), offsets.get(tag));
	});
	writeUint32(data, offsets.get("head") + 8, (0xB1B0AFBA - checksum(data)) >>> 0);
	return data;
}

function buildWoff(sfnt) {
	const { tables, entries } = readFont(sfnt);
	let offset = 44 + entries.length * 20;
	const data = new Uint8Array(offset + entries.reduce((length, entry) => length + ((entry.length + 3) & ~3), 0));
	data.set([0x77, 0x4F, 0x46, 0x46], 0);
	writeUint32(data, 4, 0x00010000);
	writeUint32(data, 8, data.length);
	writeUint16(data, 12, entries.length);
	writeUint32(data, 16, sfnt.length);
	entries.forEach((entry, index) => {
		const entryOffset = 44 + index * 20;
		data.set(entry.tag.split("").map(character => character.charCodeAt(0)), entryOffset);
		writeUint32(data, entryOffset + 4, offset);
		writeUint32(data, entryOffset + 8, entry.length);
		writeUint32(data, entryOffset + 12, entry.length);
		writeUint32(data, entryOffset + 16, entry.checksum);
		data.set(tables.get(entry.tag), offset);
		offset += (entry.length + 3) & ~3;
	});
	return data;
}

// The tables are stored with the null transform (version 3 for glyf and loca), or with the hmtx
// transform that drops the side bearings when every one equals its glyph's xMin, which holds here.
async function buildWoff2(sfnt, transformHmtx = false) {
	const KNOWN_TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca"];
	const { tables, entries } = readFont(sfnt);
	const directory = [];
	const payload = [];
	entries.forEach(entry => {
		let table = tables.get(entry.tag);
		let transformVersion = entry.tag == "glyf" || entry.tag == "loca" ? 3 : 0;
		if (entry.tag == "hmtx" && transformHmtx) {
			transformVersion = 1;
			const transformed = new Uint8Array(1 + GLYPH_COUNT * 2);
			transformed[0] = 1;
			for (let glyphId = 0; glyphId < GLYPH_COUNT; glyphId++) {
				writeUint16(transformed, 1 + glyphId * 2, readUint16(table, glyphId * 4));
			}
			table = transformed;
		}
		const knownTag = KNOWN_TAGS.indexOf(entry.tag);
		directory.push((knownTag < 0 ? 63 : knownTag) | (transformVersion << 6));
		if (knownTag < 0) {
			directory.push(...entry.tag.split("").map(character => character.charCodeAt(0)));
		}
		directory.push(...base128(entry.length));
		if (transformVersion == 1) {
			directory.push(...base128(table.length));
		}
		payload.push(...table);
	});
	const compressed = new Uint8Array(await new Response(new Blob([new Uint8Array(payload)]).stream().pipeThrough(new CompressionStream("brotli"))).arrayBuffer());
	const data = new Uint8Array((48 + directory.length + compressed.length + 3) & ~3);
	data.set([0x77, 0x4F, 0x46, 0x32], 0);
	writeUint32(data, 4, 0x00010000);
	writeUint32(data, 8, data.length);
	writeUint16(data, 12, entries.length);
	writeUint32(data, 16, sfnt.length);
	writeUint32(data, 20, compressed.length);
	data.set(directory, 48);
	data.set(compressed, 48 + directory.length);
	return data;

	function base128(value) {
		const bytes = [];
		do {
			bytes.unshift(value & 0x7F);
			value = Math.floor(value / 128);
		} while (value > 0);
		return bytes.map((byte, index) => index < bytes.length - 1 ? byte | 0x80 : byte);
	}
}

// A reader of the format written from the spec: the directory, the Brotli block and, for a glyf
// table stored with transform 0, the glyph records rebuilt from the seven streams.
async function unpackWoff2(data) {
	const KNOWN_TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB"];
	const tableCount = readUint16(data, 12);
	const compressedLength = readUint32(data, 20);
	const entries = [];
	let offset = 48;
	for (let index = 0; index < tableCount; index++) {
		const flags = data[offset++];
		let name;
		if ((flags & 63) == 63) {
			name = tag(data, offset);
			offset += 4;
		} else {
			name = KNOWN_TAGS[flags & 63];
		}
		const transformVersion = flags >> 6;
		const transformed = (name == "glyf" || name == "loca") ? transformVersion == 0 : name == "hmtx" && transformVersion == 1;
		let length = base128();
		if (transformed) {
			length = base128();
		}
		entries.push({ name, length, transformed });
	}
	const decompressed = new Uint8Array(await new Response(new Blob([data.subarray(offset, offset + compressedLength)]).stream().pipeThrough(new DecompressionStream("brotli"))).arrayBuffer());
	const tables = new Map();
	let tableOffset = 0;
	entries.forEach(entry => {
		const table = decompressed.subarray(tableOffset, tableOffset + entry.length);
		tableOffset += entry.length;
		if (entry.transformed && entry.name == "glyf") {
			const { glyf, loca } = decodeGlyf(table);
			tables.set("glyf", glyf);
			tables.set("loca", loca);
		} else if (!entry.transformed) {
			tables.set(entry.name, table);
		}
	});
	return buildSfnt(tables);

	function base128() {
		let value = 0;
		let byte;
		do {
			byte = data[offset++];
			value = value * 128 + (byte & 0x7F);
		} while (byte & 0x80);
		return value;
	}

	function decodeGlyf(table) {
		const glyphCount = readUint16(table, 4);
		const sizes = [0, 1, 2, 3, 4, 5, 6].map(index => readUint32(table, 8 + index * 4));
		const streams = [];
		let streamOffset = 36;
		sizes.forEach(size => {
			streams.push(table.subarray(streamOffset, streamOffset + size));
			streamOffset += size;
		});
		const [contours, pointCounts, flags, glyphStream, composites, bboxes, instructions] = streams;
		const bitmapLength = 4 * Math.floor((glyphCount + 31) / 32);
		const cursor = { pointCounts: 0, flags: 0, glyph: 0, composites: 0, bboxes: bitmapLength, instructions: 0 };
		const records = [];
		for (let glyphId = 0; glyphId < glyphCount; glyphId++) {
			const contourCount = readUint16(contours, glyphId * 2);
			const explicitBbox = Boolean(bboxes[glyphId >> 3] & (0x80 >> (glyphId & 7)));
			const record = [];
			if (contourCount == 0) {
				records.push(new Uint8Array(0));
				continue;
			}
			if (contourCount == 0xFFFF) {
				record.push(0xFF, 0xFF, ...bboxes.subarray(cursor.bboxes, cursor.bboxes + 8));
				cursor.bboxes += 8;
				let componentFlags, hasInstructions = false;
				do {
					componentFlags = readUint16(composites, cursor.composites);
					let length = componentFlags & 1 ? 8 : 6;
					length += componentFlags & 8 ? 2 : componentFlags & 0x40 ? 4 : componentFlags & 0x80 ? 8 : 0;
					record.push(...composites.subarray(cursor.composites, cursor.composites + length));
					cursor.composites += length;
					hasInstructions ||= Boolean(componentFlags & 0x100);
				} while (componentFlags & 0x20);
				if (hasInstructions) {
					const length = read255();
					record.push(length >> 8, length & 0xFF, ...instructions.subarray(cursor.instructions, cursor.instructions + length));
					cursor.instructions += length;
				}
				records.push(new Uint8Array(record));
				continue;
			}
			const endPoints = [];
			let pointCount = 0;
			for (let indexContour = 0; indexContour < contourCount; indexContour++) {
				pointCount += read255(pointCounts, "pointCounts");
				endPoints.push(pointCount - 1);
			}
			const points = [];
			let x = 0, y = 0;
			for (let indexPoint = 0; indexPoint < pointCount; indexPoint++) {
				const flag = flags[cursor.flags++];
				const [dx, dy] = triplet(flag & 0x7F);
				x += dx;
				y += dy;
				points.push({ dx, dy, x, y, onCurve: !(flag & 0x80) });
			}
			const instructionLength = read255();
			const bbox = explicitBbox ? [0, 2, 4, 6].map(index => readInt16(bboxes, cursor.bboxes + index)) : [Math.min(...points.map(point => point.x)), Math.min(...points.map(point => point.y)), Math.max(...points.map(point => point.x)), Math.max(...points.map(point => point.y))];
			if (explicitBbox) {
				cursor.bboxes += 8;
			}
			record.push(contourCount >> 8, contourCount & 0xFF, ...bbox.flatMap(value => [(value >> 8) & 0xFF, value & 0xFF]), ...endPoints.flatMap(value => [value >> 8, value & 0xFF]), instructionLength >> 8, instructionLength & 0xFF, ...instructions.subarray(cursor.instructions, cursor.instructions + instructionLength));
			cursor.instructions += instructionLength;
			points.forEach(point => record.push(point.onCurve ? 1 : 0));
			points.forEach(point => record.push((point.dx >> 8) & 0xFF, point.dx & 0xFF));
			points.forEach(point => record.push((point.dy >> 8) & 0xFF, point.dy & 0xFF));
			records.push(new Uint8Array(record));
		}
		const loca = new Uint8Array((glyphCount + 1) * 4);
		let glyfOffset = 0;
		records.forEach((record, glyphId) => {
			writeUint32(loca, glyphId * 4, glyfOffset);
			glyfOffset += record.length;
		});
		writeUint32(loca, glyphCount * 4, glyfOffset);
		const glyf = new Uint8Array(glyfOffset);
		records.forEach((record, glyphId) => glyf.set(record, readUint32(loca, glyphId * 4)));
		return { glyf, loca };

		function read255(stream = glyphStream, name = "glyph") {
			const code = stream[cursor[name]++];
			if (code == 253) {
				const value = readUint16(stream, cursor[name]);
				cursor[name] += 2;
				return value;
			}
			return code == 255 ? stream[cursor[name]++] + 253 : code == 254 ? stream[cursor[name]++] + 506 : code;
		}

		function triplet(flag) {
			const sign = (bit, value) => bit & 1 ? value : -value;
			const byte = () => glyphStream[cursor.glyph++];
			if (flag < 10) {
				return [0, sign(flag, ((flag & 14) << 7) + byte())];
			} else if (flag < 20) {
				return [sign(flag, (((flag - 10) & 14) << 7) + byte()), 0];
			} else if (flag < 84) {
				const b0 = flag - 20, b1 = byte();
				return [sign(flag, 1 + (b0 & 0x30) + (b1 >> 4)), sign(flag >> 1, 1 + ((b0 & 0x0C) << 2) + (b1 & 0x0F))];
			} else if (flag < 120) {
				const b0 = flag - 84;
				return [sign(flag, 1 + (Math.floor(b0 / 12) << 8) + byte()), sign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + byte())];
			} else if (flag < 124) {
				const b0 = byte(), b1 = byte(), b2 = byte();
				return [sign(flag, (b0 << 4) + (b1 >> 4)), sign(flag >> 1, ((b1 & 0x0F) << 8) + b2)];
			} else {
				const b0 = byte(), b1 = byte(), b2 = byte(), b3 = byte();
				return [sign(flag, (b0 << 8) + b1), sign(flag >> 1, (b2 << 8) + b3)];
			}
		}
	}
}

async function unpackWoff(data) {
	const tableCount = readUint16(data, 12);
	const tables = new Map();
	for (let index = 0; index < tableCount; index++) {
		const entryOffset = 44 + index * 20;
		const offset = readUint32(data, entryOffset + 4);
		const compressedLength = readUint32(data, entryOffset + 8);
		const originalLength = readUint32(data, entryOffset + 12);
		let table = data.subarray(offset, offset + compressedLength);
		if (compressedLength < originalLength) {
			table = new Uint8Array(await new Response(new Blob([table]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
		}
		tables.set(tag(data, entryOffset), table);
	}
	return buildSfnt(tables);
}

function readFont(data) {
	const tableCount = readUint16(data, 4);
	const tables = new Map();
	const entries = [];
	for (let index = 0; index < tableCount; index++) {
		const entryOffset = 12 + index * 16;
		const entry = { tag: tag(data, entryOffset), checksum: readUint32(data, entryOffset + 4), offset: readUint32(data, entryOffset + 8), length: readUint32(data, entryOffset + 12) };
		entries.push(entry);
		tables.set(entry.tag, data.subarray(entry.offset, entry.offset + entry.length));
	}
	const glyphCount = readUint16(tables.get("maxp"), 4);
	const longLoca = readUint16(tables.get("head"), 50) == 1;
	const loca = tables.get("loca");
	const glyphLengths = [];
	for (let glyphId = 0; glyphId < glyphCount; glyphId++) {
		glyphLengths.push(longLoca ? readUint32(loca, (glyphId + 1) * 4) - readUint32(loca, glyphId * 4) : (readUint16(loca, (glyphId + 1) * 2) - readUint16(loca, glyphId * 2)) * 2);
	}
	return { tables, entries, glyphCount, glyphLengths, cmap: readCmap(tables.get("cmap")), checksumValid: checksum(data) == 0xB1B0AFBA };
}

function readCmap(cmap) {
	const mapping = new Map();
	const offset = readUint32(cmap, 8);
	const segmentCount = readUint16(cmap, offset + 6) / 2;
	for (let index = 0; index < segmentCount; index++) {
		const endCode = readUint16(cmap, offset + 14 + index * 2);
		const startCode = readUint16(cmap, offset + 16 + segmentCount * 2 + index * 2);
		const delta = readUint16(cmap, offset + 16 + segmentCount * 4 + index * 2);
		const rangeOffsetOffset = offset + 16 + segmentCount * 6 + index * 2;
		const rangeOffset = readUint16(cmap, rangeOffsetOffset);
		for (let charCode = startCode; charCode <= endCode && charCode != 0xFFFF; charCode++) {
			const glyphId = rangeOffset ? readUint16(cmap, rangeOffsetOffset + rangeOffset + (charCode - startCode) * 2) : (charCode + delta) & 0xFFFF;
			if (glyphId) {
				mapping.set(charCode, glyphId);
			}
		}
	}
	return mapping;
}

function checksum(data) {
	let sum = 0;
	for (let offset = 0; offset < data.length; offset += 4) {
		let value = 0;
		for (let index = 0; index < 4; index++) {
			value = (value << 8) | (offset + index < data.length ? data[offset + index] : 0);
		}
		sum = (sum + (value >>> 0)) >>> 0;
	}
	return sum;
}

function tag(data, offset) {
	return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
}

function readUint16(data, offset) {
	return (data[offset] << 8) | data[offset + 1];
}

function readInt16(data, offset) {
	const value = readUint16(data, offset);
	return value & 0x8000 ? value - 0x10000 : value;
}

function readUint32(data, offset) {
	return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function writeUint16(data, offset, value) {
	data[offset] = (value >>> 8) & 0xFF;
	data[offset + 1] = value & 0xFF;
}

function writeUint32(data, offset, value) {
	data[offset] = (value >>> 24) & 0xFF;
	data[offset + 1] = (value >>> 16) & 0xFF;
	data[offset + 2] = (value >>> 8) & 0xFF;
	data[offset + 3] = value & 0xFF;
}
