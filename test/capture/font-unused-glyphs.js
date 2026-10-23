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
/* global atob, Blob, DecompressionStream */
import { capture, html } from "./common.js";
import { process } from "../../modules/font-glyphs-minifier.js";

const PAGE_URL = "https://example.com/glyphs.html";
const FONT_URL = "https://example.com/font.ttf";
const A = 1, B = 2, C = 3, LIGATURE = 5;
const GLYPH_COUNT = 6;
const CHAR_A = 65, CHAR_B = 66, CHAR_C = 67, CHAR_D = 68;
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
	check("the drawn glyphs keep their outlines", JSON.stringify(outlinedGlyphs(info)), JSON.stringify([A, C]));
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
	check("a ligature of drawn glyphs is kept", JSON.stringify(outlinedGlyphs(info)), JSON.stringify([A, B, LIGATURE]));
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
	check("a font whose glyphs are all drawn is left alone", await process(font, [[CHAR_A, CHAR_D]]), null);
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
	check("with the same glyphs kept", JSON.stringify(outlinedGlyphs(info)), JSON.stringify([A, C]));
	check("and the same cmap", JSON.stringify([...info.cmap]), JSON.stringify([[CHAR_A, A], [CHAR_C, C]]));
}

// Through a capture: the saved page carries the hollowed font, and the pass needs the drawn
// characters of the family, so an unknown character set or the option left off keeps the font as is.
{
	const drawn = [["s", "normal", [[CHAR_A, CHAR_A], [CHAR_C, CHAR_C]], 0]];
	const info = readFont(await captureFont({ removeUnusedGlyphs: true, usedFontsCharacters: drawn }));
	check("a captured page carries the hollowed font", JSON.stringify(outlinedGlyphs(info)), JSON.stringify([A, C]));
	check("the option off keeps the font", sameBytes(await captureFont({ usedFontsCharacters: drawn }), font), true);
	check("an unknown character set keeps the font", sameBytes(await captureFont({ removeUnusedGlyphs: true, usedFontsCharacters: [["s", "normal", [[CHAR_A, CHAR_A]], 1]] }), font), true);
	check("a family the page never draws keeps the font", sameBytes(await captureFont({ removeUnusedGlyphs: true, usedFontsCharacters: [["t", "normal", [[CHAR_A, CHAR_A]], 0]] }), font), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function captureFont(options) {
	const page = html("<p>AC</p>", `<style>@font-face{font-family:"S";src:url(${FONT_URL}) format("truetype")}p{font-family:"S"}</style>`);
	const resources = new Map([[PAGE_URL, { body: page, contentType: "text/html" }], [FONT_URL, { body: font, contentType: "font/ttf" }]]);
	const content = await capture(resources, { url: PAGE_URL, content: page, removeUnusedFonts: false, usedFonts: [["s", "400", "normal", "normal", "100%"]], ...options });
	const match = content.match(/data:font\/ttf;base64,([^"')]+)/);
	return match ? Uint8Array.from(atob(match[1]), character => character.charCodeAt(0)) : null;
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
	const glyphs = [new Uint8Array(0), triangle, triangle, compositeGlyph(A), triangle, triangle];
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

function buildCmap() {
	const subtable = new Uint8Array(32);
	writeUint16(subtable, 0, 4);
	writeUint16(subtable, 2, 32);
	writeUint16(subtable, 6, 4);
	writeUint16(subtable, 8, 4);
	writeUint16(subtable, 10, 1);
	writeUint16(subtable, 12, 0);
	writeUint16(subtable, 14, CHAR_D);
	writeUint16(subtable, 16, 0xFFFF);
	writeUint16(subtable, 20, CHAR_A);
	writeUint16(subtable, 22, 0xFFFF);
	writeUint16(subtable, 24, (A - CHAR_A) & 0xFFFF);
	writeUint16(subtable, 26, 1);
	const cmap = new Uint8Array(12 + 32);
	writeUint16(cmap, 2, 1);
	writeUint16(cmap, 4, 3);
	writeUint16(cmap, 6, 1);
	writeUint32(cmap, 8, 12);
	cmap.set(subtable, 12);
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
