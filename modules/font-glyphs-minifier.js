/*
 * Copyright 2010-2024 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 *
 * This file is part of SingleFile.
 *
 *   The code in this file is free software: you can redistribute it and/or
 *   modify it under the terms of the GNU Affero General Public License
 *   (GNU AGPL) as published by the Free Software Foundation, either version 3
 *   of the License, or (at your option) any later version.
 *
 *   The code in this file is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero
 *   General Public License for more details.
 *
 *   As additional permission under GNU AGPL version 3 section 7, you may
 *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU
 *   AGPL normally required by section 4, provided you include this license
 *   notice and a URL through which recipients can access the Corresponding
 *   Source.
 */

/* global Blob, CompressionStream, DecompressionStream, Response */

const SFNT_TRUETYPE = 0x00010000;
const SFNT_TRUE = 0x74727565;
const SFNT_WOFF = 0x774F4646;
const SFNT_WOFF2 = 0x774F4632;
const SFNT_HEADER_LENGTH = 12;
const SFNT_ENTRY_LENGTH = 16;
const WOFF_HEADER_LENGTH = 44;
const WOFF_ENTRY_LENGTH = 20;
const WOFF2_HEADER_LENGTH = 48;
const WOFF2_KNOWN_TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill"];
const WOFF2_ARBITRARY_TAG = 0x3F;
const WOFF2_TRANSFORM_VERSION_SHIFT = 6;
const WOFF2_GLYF_TRANSFORM = 0;
const WOFF2_GLYF_NULL_TRANSFORM = 3;
const WOFF2_HMTX_TRANSFORM = 1;
const WOFF2_GLYF_HEADER_LENGTH = 36;
const WOFF2_OVERLAP_BITMAP_FLAG = 0x0001;
const WOFF2_HMTX_NO_LSB_FLAG = 0x01;
const WOFF2_HMTX_NO_LEFT_SIDE_BEARING_FLAG = 0x02;
const WOFF2_WORD_CODE = 253;
const WOFF2_ONE_MORE_BYTE_CODE_1 = 255;
const WOFF2_ONE_MORE_BYTE_CODE_2 = 254;
const WOFF2_LOWEST_U_CODE = 253;
const WOFF2_TRIPLET_OFF_CURVE = 0x80;
const CHECKSUM_ADJUSTMENT_MAGIC = 0xB1B0AFBA;
const HEAD_CHECKSUM_OFFSET = 8;
const HEAD_FLAGS_OFFSET = 16;
const HEAD_FLAGS_TRANSFORMED = 0x0800;
const HEAD_LOCA_FORMAT_OFFSET = 50;
const HHEA_METRICS_COUNT_OFFSET = 34;
const MAXP_GLYPHS_OFFSET = 4;
const FSTYPE_OFFSET = 8;
const FSTYPE_NO_SUBSETTING = 0x0100;
const LONG_LOCA_FORMAT = 1;
const NOTDEF_GLYPH_ID = 0;
const GLYPH_HEADER_LENGTH = 10;
const GLYPH_FLAG_ON_CURVE = 0x01;
const GLYPH_FLAG_X_SHORT = 0x02;
const GLYPH_FLAG_Y_SHORT = 0x04;
const GLYPH_FLAG_REPEAT = 0x08;
const GLYPH_FLAG_X_SAME_OR_POSITIVE = 0x10;
const GLYPH_FLAG_Y_SAME_OR_POSITIVE = 0x20;
const GLYPH_FLAG_OVERLAP_SIMPLE = 0x40;
const COMPOSITE_ARG_1_AND_2_ARE_WORDS = 0x0001;
const COMPOSITE_WE_HAVE_A_SCALE = 0x0008;
const COMPOSITE_MORE_COMPONENTS = 0x0020;
const COMPOSITE_WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const COMPOSITE_WE_HAVE_A_TWO_BY_TWO = 0x0080;
const COMPOSITE_WE_HAVE_INSTRUCTIONS = 0x0100;
const GSUB_LOOKUP_SINGLE = 1;
const GSUB_LOOKUP_MULTIPLE = 2;
const GSUB_LOOKUP_ALTERNATE = 3;
const GSUB_LOOKUP_LIGATURE = 4;
const GSUB_LOOKUP_EXTENSION = 7;
const GSUB_LOOKUP_REVERSE_CHAINING = 8;
const CMAP_FORMAT_BYTE = 0;
const CMAP_FORMAT_SEGMENT = 4;
const CMAP_FORMAT_TRIMMED = 6;
const CMAP_FORMAT_GROUPS = 12;
const CMAP_FORMAT_VARIATION = 14;
const CMAP_PLATFORM_UNICODE = 0;
const CMAP_PLATFORM_WINDOWS = 3;
const CMAP_ENCODING_UNICODE_BMP = 3;
const CMAP_ENCODING_UNICODE_FULL = 4;
const CMAP_ENCODING_UNICODE_VARIATION = 5;
const CMAP_ENCODING_WINDOWS_BMP = 1;
const CMAP_ENCODING_WINDOWS_FULL = 10;
const MAX_BMP_CHAR_CODE = 0xFFFF;
const UNSUPPORTED_TABLES = ["CFF ", "CFF2", "gvar", "fvar", "COLR", "CBDT", "sbix", "SVG ", "morx", "mort", "MATH"];
const REGEXP_COMBINING_CHARACTER = /^[\p{M}ᅠ-ᇿ]$/u;
const BIDI_MIRRORING_PAIRS = "\u0028\u0029\u003C\u003E\u005B\u005D\u007B\u007D\u00AB\u00BB\u0F3A\u0F3B\u0F3C\u0F3D\u169B\u169C\u2039\u203A\u2045\u2046\u207D\u207E\u208D\u208E\u2208\u220B\u2209\u220C\u220A\u220D\u2215\u29F5\u221D\u{1DB10}\u221F\u2BFE\u2220\u29A3\u2221\u299B\u2222\u29A0\u2224\u2AEE\u223C\u223D\u2243\u22CD\u2245\u224C\u2252\u2253\u2254\u2255\u2264\u2265\u2266\u2267\u2268\u2269\u226A\u226B\u226E\u226F\u2270\u2271\u2272\u2273\u2274\u2275\u2276\u2277\u2278\u2279\u227A\u227B\u227C\u227D\u227E\u227F\u2280\u2281\u2282\u2283\u2284\u2285\u2286\u2287\u2288\u2289\u228A\u228B\u228F\u2290\u2291\u2292\u2298\u29B8\u22A2\u22A3\u22A6\u2ADE\u22A8\u2AE4\u22A9\u2AE3\u22AB\u2AE5\u22B0\u22B1\u22B2\u22B3\u22B4\u22B5\u22B6\u22B7\u22B8\u27DC\u22C9\u22CA\u22CB\u22CC\u22D0\u22D1\u22D6\u22D7\u22D8\u22D9\u22DA\u22DB\u22DC\u22DD\u22DE\u22DF\u22E0\u22E1\u22E2\u22E3\u22E4\u22E5\u22E6\u22E7\u22E8\u22E9\u22EA\u22EB\u22EC\u22ED\u22F0\u22F1\u22F2\u22FA\u22F3\u22FB\u22F4\u22FC\u22F6\u22FD\u22F7\u22FE\u2308\u2309\u230A\u230B\u2329\u232A\u2768\u2769\u276A\u276B\u276C\u276D\u276E\u276F\u2770\u2771\u2772\u2773\u2774\u2775\u27C3\u27C4\u27C5\u27C6\u27C8\u27C9\u27CB\u27CD\u27D5\u27D6\u27DD\u27DE\u27E2\u27E3\u27E4\u27E5\u27E6\u27E7\u27E8\u27E9\u27EA\u27EB\u27EC\u27ED\u27EE\u27EF\u2983\u2984\u2985\u2986\u2987\u2988\u2989\u298A\u298B\u298C\u298D\u2990\u298E\u298F\u2991\u2992\u2993\u2994\u2995\u2996\u2997\u2998\u29A4\u29A5\u29A8\u29A9\u29AA\u29AB\u29AC\u29AD\u29AE\u29AF\u29C0\u29C1\u29C4\u29C5\u29CF\u29D0\u29D1\u29D2\u29D4\u29D5\u29D8\u29D9\u29DA\u29DB\u29E8\u29E9\u29F8\u29F9\u29FC\u29FD\u2A2B\u2A2C\u2A2D\u2A2E\u2A34\u2A35\u2A3C\u2A3D\u2A64\u2A65\u2A79\u2A7A\u2A7B\u2A7C\u2A7D\u2A7E\u2A7F\u2A80\u2A81\u2A82\u2A83\u2A84\u2A85\u2A86\u2A87\u2A88\u2A89\u2A8A\u2A8B\u2A8C\u2A8D\u2A8E\u2A8F\u2A90\u2A91\u2A92\u2A93\u2A94\u2A95\u2A96\u2A97\u2A98\u2A99\u2A9A\u2A9B\u2A9C\u2A9D\u2A9E\u2A9F\u2AA0\u2AA1\u2AA2\u2AA6\u2AA7\u2AA8\u2AA9\u2AAA\u2AAB\u2AAC\u2AAD\u2AAF\u2AB0\u2AB1\u2AB2\u2AB3\u2AB4\u2AB5\u2AB6\u2AB7\u2AB8\u2AB9\u2ABA\u2ABB\u2ABC\u2ABD\u2ABE\u2ABF\u2AC0\u2AC1\u2AC2\u2AC3\u2AC4\u2AC5\u2AC6\u2AC7\u2AC8\u2AC9\u2ACA\u2ACB\u2ACC\u2ACD\u2ACE\u2ACF\u2AD0\u2AD1\u2AD2\u2AD3\u2AD4\u2AD5\u2AD6\u2AEC\u2AED\u2AF7\u2AF8\u2AF9\u2AFA\u2E02\u2E03\u2E04\u2E05\u2E09\u2E0A\u2E0C\u2E0D\u2E1C\u2E1D\u2E20\u2E21\u2E22\u2E23\u2E24\u2E25\u2E26\u2E27\u2E28\u2E29\u2E55\u2E56\u2E57\u2E58\u2E59\u2E5A\u2E5B\u2E5C\u2E62\u2E63\u3008\u3009\u300A\u300B\u300C\u300D\u300E\u300F\u3010\u3011\u3014\u3015\u3016\u3017\u3018\u3019\u301A\u301B\uFE59\uFE5A\uFE5B\uFE5C\uFE5D\uFE5E\uFE64\uFE65\uFF08\uFF09\uFF1C\uFF1E\uFF3B\uFF3D\uFF5B\uFF5D\uFF5F\uFF60\uFF62\uFF63\u{1DB03}\u{1DB04}\u{1DB05}\u{1DB06}\u{1DB08}\u{1DB09}";


const DROPPED_TABLES = ["DSIG"];
const TAG_CMAP = "cmap";
const TAG_GLYF = "glyf";
const TAG_LOCA = "loca";
const TAG_HEAD = "head";
const TAG_MAXP = "maxp";
const TAG_HMTX = "hmtx";
const TAG_HHEA = "hhea";
const TAG_OS2 = "OS/2";
const TAG_GSUB = "GSUB";
const REQUIRED_TABLES = [TAG_CMAP, TAG_GLYF, TAG_LOCA, TAG_HEAD, TAG_MAXP, TAG_HMTX];
const BIDI_MIRRORING = getBidiMirroring();

export {
	process
};

async function process(content, charCodeRanges, options = {}) {
	const data = new Uint8Array(content.buffer ? content : new Uint8Array(content));
	const brotli = getBrotli(options);
	let font;
	try {
		font = await parseFont(data, brotli);
	} catch {
		return null;
	}
	if (!font) {
		return null;
	}
	const tables = font.tables;
	if (REQUIRED_TABLES.find(tag => !tables.has(tag)) || UNSUPPORTED_TABLES.find(tag => tables.has(tag))) {
		return null;
	}
	const os2 = tables.get(TAG_OS2);
	if (os2 && os2.length > FSTYPE_OFFSET + 1 && (readUint16(os2, FSTYPE_OFFSET) & FSTYPE_NO_SUBSETTING)) {
		return null;
	}
	try {
		const glyphCount = readUint16(tables.get(TAG_MAXP), MAXP_GLYPHS_OFFSET);
		const locaOffsets = readLoca(tables.get(TAG_LOCA), glyphCount, readInt16(tables.get(TAG_HEAD), HEAD_LOCA_FORMAT_OFFSET));
		if (!locaOffsets) {
			return null;
		}
		const cmap = readCmap(tables.get(TAG_CMAP));
		const keptCharCodes = new Map();
		getDrawableCharCodes(charCodeRanges).forEach(charCode => {
			const glyphId = cmap.mapping.get(charCode);
			if (glyphId !== undefined && glyphId < glyphCount) {
				keptCharCodes.set(charCode, glyphId);
			}
		});
		const keptGlyphIds = new Set([NOTDEF_GLYPH_ID, ...keptCharCodes.values()]);
		cmap.variationGlyphIds.forEach((glyphIds, charCode) => {
			if (keptCharCodes.has(charCode)) {
				glyphIds.forEach(glyphId => keptGlyphIds.add(glyphId));
			}
		});
		if (tables.has(TAG_GSUB)) {
			addGsubClosure(tables.get(TAG_GSUB), keptGlyphIds);
		}
		const glyf = tables.get(TAG_GLYF);
		Array.from(keptGlyphIds).forEach(glyphId => addCompositeComponents(glyf, locaOffsets, glyphId, keptGlyphIds));
		let removedGlyphs = 0;
		for (let glyphId = 0; glyphId < glyphCount; glyphId++) {
			if (!keptGlyphIds.has(glyphId) && locaOffsets[glyphId + 1] > locaOffsets[glyphId]) {
				removedGlyphs++;
			}
		}
		if (!removedGlyphs && keptCharCodes.size == cmap.mapping.size) {
			return null;
		}
		const { glyfTable, locaTable } = writeGlyf(glyf, locaOffsets, glyphCount, keptGlyphIds);
		tables.set(TAG_GLYF, glyfTable);
		tables.set(TAG_LOCA, locaTable);
		tables.set(TAG_CMAP, writeCmap(keptCharCodes, cmap.variationSubtable));
		const head = new Uint8Array(tables.get(TAG_HEAD));
		writeInt16(head, HEAD_LOCA_FORMAT_OFFSET, LONG_LOCA_FORMAT);
		writeUint32(head, HEAD_CHECKSUM_OFFSET, 0);
		if (font.woff2) {
			writeUint16(head, HEAD_FLAGS_OFFSET, readUint16(head, HEAD_FLAGS_OFFSET) | HEAD_FLAGS_TRANSFORMED);
		}
		tables.set(TAG_HEAD, head);
		DROPPED_TABLES.forEach(tag => tables.delete(tag));
		const sfnt = writeSfnt(font.flavor, tables);
		let result;
		if (font.woff2) {
			result = await writeWoff2(sfnt, font, brotli, glyphCount);
		} else if (font.woff) {
			result = await writeWoff(sfnt, font);
		} else {
			result = sfnt.data;
		}
		if (result.length >= data.length || !await testFont(result)) {
			return null;
		}
		return result;
	} catch {
		return null;
	}
}

function getBidiMirroring() {
	const mirroring = new Map();
	const characters = Array.from(BIDI_MIRRORING_PAIRS);
	for (let indexPair = 0; indexPair < characters.length; indexPair += 2) {
		mirroring.set(characters[indexPair], characters[indexPair + 1]);
		mirroring.set(characters[indexPair + 1], characters[indexPair]);
	}
	return mirroring;
}

function getDrawableCharCodes(charCodeRanges) {
	const charCodes = new Set();
	const combiners = new Set();
	const addCharacter = character => {
		const charCode = character.codePointAt(0);
		if (!charCodes.has(charCode)) {
			charCodes.add(charCode);
			if (REGEXP_COMBINING_CHARACTER.test(character)) {
				combiners.add(character);
			}
			return true;
		}
		return false;
	};
	charCodeRanges.forEach(([fromCharCode, toCharCode]) => {
		for (let charCode = fromCharCode; charCode <= toCharCode; charCode++) {
			const character = String.fromCodePoint(charCode);
			addCharacter(character);
			Array.from(character.normalize("NFD")).forEach(addCharacter);
			Array.from(character.normalize("NFC")).forEach(addCharacter);
			if (BIDI_MIRRORING.has(character)) {
				addCharacter(BIDI_MIRRORING.get(character));
			}
		}
	});
	let composed;
	do {
		composed = false;
		Array.from(charCodes).forEach(charCode => {
			const base = String.fromCodePoint(charCode);
			combiners.forEach(combiner => {
				const composition = (base + combiner).normalize("NFC");
				if (Array.from(composition).length == 1 && addCharacter(composition)) {
					composed = true;
				}
			});
		});
	} while (composed);
	return charCodes;
}

function getBrotli(options) {
	if (options.brotli) {
		return options.brotli;
	}
	try {
		new CompressionStream("brotli");
		new DecompressionStream("brotli");
	} catch {
		return null;
	}
	return {
		compress: data => transform(data, new CompressionStream("brotli")),
		decompress: data => transform(data, new DecompressionStream("brotli"))
	};
}

async function testFont(data) {
	if (typeof globalThis.FontFace == "undefined") {
		return true;
	}
	try {
		await new globalThis.FontFace("single-file-test", data.buffer).load();
		return true;
	} catch {
		return false;
	}
}

async function parseFont(data, brotli) {
	if (data.length < SFNT_HEADER_LENGTH) {
		return null;
	}
	const signature = readUint32(data, 0);
	if (signature == SFNT_TRUETYPE || signature == SFNT_TRUE) {
		const tableCount = readUint16(data, 4);
		const tables = new Map();
		for (let indexTable = 0; indexTable < tableCount; indexTable++) {
			const entryOffset = SFNT_HEADER_LENGTH + indexTable * SFNT_ENTRY_LENGTH;
			const tag = readTag(data, entryOffset);
			const offset = readUint32(data, entryOffset + 8);
			const length = readUint32(data, entryOffset + 12);
			tables.set(tag, data.subarray(offset, offset + length));
		}
		return { flavor: signature, tables, woff: false };
	} else if (signature == SFNT_WOFF) {
		const flavor = readUint32(data, 4);
		if (flavor != SFNT_TRUETYPE && flavor != SFNT_TRUE) {
			return null;
		}
		const tableCount = readUint16(data, 12);
		const metaOffset = readUint32(data, 24);
		const metaLength = readUint32(data, 28);
		const metaOriginalLength = readUint32(data, 32);
		const privateOffset = readUint32(data, 36);
		const privateLength = readUint32(data, 40);
		const tables = new Map();
		for (let indexTable = 0; indexTable < tableCount; indexTable++) {
			const entryOffset = WOFF_HEADER_LENGTH + indexTable * WOFF_ENTRY_LENGTH;
			const tag = readTag(data, entryOffset);
			const offset = readUint32(data, entryOffset + 4);
			const compressedLength = readUint32(data, entryOffset + 8);
			const originalLength = readUint32(data, entryOffset + 12);
			const tableData = data.subarray(offset, offset + compressedLength);
			tables.set(tag, compressedLength < originalLength ? await inflate(tableData, originalLength) : tableData);
		}
		return {
			flavor,
			tables,
			woff: true,
			version: readUint32(data, 20),
			metadata: metaLength ? data.subarray(metaOffset, metaOffset + metaLength) : null,
			metaOriginalLength,
			privateData: privateLength ? data.subarray(privateOffset, privateOffset + privateLength) : null
		};
	} else if (signature == SFNT_WOFF2) {
		return parseWoff2(data, brotli);
	}
	return null;
}

async function parseWoff2(data, brotli) {
	const flavor = readUint32(data, 4);
	if ((flavor != SFNT_TRUETYPE && flavor != SFNT_TRUE) || !brotli || data.length < WOFF2_HEADER_LENGTH) {
		return null;
	}
	const tableCount = readUint16(data, 12);
	const totalCompressedSize = readUint32(data, 20);
	const metaOffset = readUint32(data, 28);
	const metaLength = readUint32(data, 32);
	const metaOriginalLength = readUint32(data, 36);
	const privateOffset = readUint32(data, 40);
	const privateLength = readUint32(data, 44);
	const entries = [];
	let offset = WOFF2_HEADER_LENGTH;
	for (let indexTable = 0; indexTable < tableCount; indexTable++) {
		const flags = data[offset++];
		let tag;
		if ((flags & WOFF2_ARBITRARY_TAG) == WOFF2_ARBITRARY_TAG) {
			tag = readTag(data, offset);
			offset += 4;
		} else {
			tag = WOFF2_KNOWN_TAGS[flags & WOFF2_ARBITRARY_TAG];
		}
		const transformVersion = flags >> WOFF2_TRANSFORM_VERSION_SHIFT;
		let originalLength, transformedLength, transformed;
		[originalLength, offset] = readBase128(data, offset);
		if (tag == TAG_GLYF || tag == TAG_LOCA) {
			if (transformVersion != WOFF2_GLYF_TRANSFORM && transformVersion != WOFF2_GLYF_NULL_TRANSFORM) {
				return null;
			}
			transformed = transformVersion == WOFF2_GLYF_TRANSFORM;
		} else if (tag == TAG_HMTX) {
			if (transformVersion > WOFF2_HMTX_TRANSFORM) {
				return null;
			}
			transformed = transformVersion == WOFF2_HMTX_TRANSFORM;
		} else if (transformVersion) {
			return null;
		}
		if (transformed) {
			[transformedLength, offset] = readBase128(data, offset);
		} else {
			transformedLength = originalLength;
		}
		entries.push({ tag, transformedLength, transformed });
	}
	const decompressed = await brotli.decompress(data.subarray(offset, offset + totalCompressedSize));
	if (decompressed.length != entries.reduce((length, entry) => length + entry.transformedLength, 0)) {
		throw new Error("Invalid WOFF2 data length");
	}
	const tables = new Map();
	let transformedGlyf, transformedHmtx, tableOffset = 0;
	entries.forEach(entry => {
		const tableData = decompressed.subarray(tableOffset, tableOffset + entry.transformedLength);
		tableOffset += entry.transformedLength;
		if (!entry.transformed) {
			tables.set(entry.tag, tableData);
		} else if (entry.tag == TAG_GLYF) {
			transformedGlyf = tableData;
		} else if (entry.tag == TAG_HMTX) {
			transformedHmtx = tableData;
		}
	});
	if (!tables.has(TAG_HEAD) || !tables.has(TAG_MAXP)) {
		return null;
	}
	const glyphCount = readUint16(tables.get(TAG_MAXP), MAXP_GLYPHS_OFFSET);
	let xMins;
	if (transformedGlyf) {
		const glyf = reconstructGlyf(transformedGlyf, glyphCount);
		tables.set(TAG_GLYF, glyf.glyfTable);
		tables.set(TAG_LOCA, glyf.locaTable);
		const head = new Uint8Array(tables.get(TAG_HEAD));
		writeInt16(head, HEAD_LOCA_FORMAT_OFFSET, LONG_LOCA_FORMAT);
		tables.set(TAG_HEAD, head);
		xMins = glyf.xMins;
	}
	if (transformedHmtx) {
		if (!tables.has(TAG_HHEA) || !tables.has(TAG_GLYF) || !tables.has(TAG_LOCA)) {
			return null;
		}
		if (!xMins) {
			const locaOffsets = readLoca(tables.get(TAG_LOCA), glyphCount, readInt16(tables.get(TAG_HEAD), HEAD_LOCA_FORMAT_OFFSET));
			if (!locaOffsets) {
				return null;
			}
			const glyf = tables.get(TAG_GLYF);
			xMins = locaOffsets.slice(0, glyphCount).map((glyphOffset, glyphId) => locaOffsets[glyphId + 1] - glyphOffset >= GLYPH_HEADER_LENGTH ? readInt16(glyf, glyphOffset + 2) : 0);
		}
		tables.set(TAG_HMTX, reconstructHmtx(transformedHmtx, xMins, readUint16(tables.get(TAG_HHEA), HHEA_METRICS_COUNT_OFFSET), glyphCount));
	}
	return {
		flavor,
		tables,
		woff: false,
		woff2: true,
		version: readUint32(data, 24),
		metadata: metaLength ? data.subarray(metaOffset, metaOffset + metaLength) : null,
		metaOriginalLength,
		privateData: privateLength ? data.subarray(privateOffset, privateOffset + privateLength) : null
	};
}

function reconstructGlyf(data, glyphCount) {
	const optionFlags = readUint16(data, 2);
	const streamSizes = [];
	for (let indexStream = 0; indexStream < 7; indexStream++) {
		streamSizes.push(readUint32(data, 8 + indexStream * 4));
	}
	let offset = WOFF2_GLYF_HEADER_LENGTH;
	const [nContourStream, nPointsStream, flagStream, glyphStream, compositeStream, bboxData, instructionStream] = streamSizes.map(size => {
		const stream = data.subarray(offset, offset + size);
		offset += size;
		return stream;
	});
	const bboxBitmapLength = 4 * Math.floor((glyphCount + 31) / 32);
	const bboxBitmap = bboxData.subarray(0, bboxBitmapLength);
	const bboxStream = bboxData.subarray(bboxBitmapLength);
	const overlapBitmap = optionFlags & WOFF2_OVERLAP_BITMAP_FLAG ? data.subarray(offset, offset + ((glyphCount + 7) >> 3)) : null;
	const cursors = { nPoints: 0, flag: 0, glyph: 0, composite: 0, bbox: 0, instruction: 0 };
	const glyphs = [];
	const xMins = [];
	for (let glyphId = 0; glyphId < glyphCount; glyphId++) {
		const contourCount = readInt16(nContourStream, glyphId * 2);
		const explicitBbox = Boolean(bboxBitmap[glyphId >> 3] & (0x80 >> (glyphId & 7)));
		if (contourCount == 0) {
			if (explicitBbox) {
				throw new Error("Invalid empty glyph");
			}
			glyphs.push(new Uint8Array(0));
			xMins.push(0);
		} else if (contourCount > 0) {
			const pointCounts = [];
			let pointCount = 0;
			for (let indexContour = 0; indexContour < contourCount; indexContour++) {
				const count = read255Uint16(nPointsStream, cursors, "nPoints");
				pointCounts.push(count);
				pointCount += count;
			}
			const flags = flagStream.subarray(cursors.flag, cursors.flag + pointCount);
			cursors.flag += pointCount;
			const points = [];
			let x = 0, y = 0;
			for (let indexPoint = 0; indexPoint < pointCount; indexPoint++) {
				const [dx, dy] = readTriplet(flags[indexPoint], glyphStream, cursors);
				x += dx;
				y += dy;
				points.push({ dx, dy, x, y, onCurve: !(flags[indexPoint] & WOFF2_TRIPLET_OFF_CURVE) });
			}
			const instructionLength = read255Uint16(glyphStream, cursors, "glyph");
			const instructions = instructionStream.subarray(cursors.instruction, cursors.instruction + instructionLength);
			cursors.instruction += instructionLength;
			let bbox;
			if (explicitBbox) {
				bbox = readBbox(bboxStream, cursors);
			} else {
				bbox = { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
				points.forEach(({ x, y }, indexPoint) => {
					if (!indexPoint || x < bbox.xMin) {
						bbox.xMin = x;
					}
					if (!indexPoint || x > bbox.xMax) {
						bbox.xMax = x;
					}
					if (!indexPoint || y < bbox.yMin) {
						bbox.yMin = y;
					}
					if (!indexPoint || y > bbox.yMax) {
						bbox.yMax = y;
					}
				});
			}
			const overlap = Boolean(overlapBitmap && (overlapBitmap[glyphId >> 3] & (0x80 >> (glyphId & 7))));
			glyphs.push(writeSimpleGlyph(pointCounts, points, instructions, bbox, overlap));
			xMins.push(bbox.xMin);
		} else {
			const componentsOffset = cursors.composite;
			let flags, hasInstructions = false;
			do {
				flags = readUint16(compositeStream, cursors.composite);
				cursors.composite += getComponentLength(flags);
				hasInstructions = hasInstructions || Boolean(flags & COMPOSITE_WE_HAVE_INSTRUCTIONS);
			} while (flags & COMPOSITE_MORE_COMPONENTS);
			const components = compositeStream.subarray(componentsOffset, cursors.composite);
			let instructions = null;
			if (hasInstructions) {
				const instructionLength = read255Uint16(glyphStream, cursors, "glyph");
				instructions = instructionStream.subarray(cursors.instruction, cursors.instruction + instructionLength);
				cursors.instruction += instructionLength;
			}
			if (!explicitBbox) {
				throw new Error("Missing composite glyph bounding box");
			}
			const bbox = readBbox(bboxStream, cursors);
			glyphs.push(writeCompositeGlyph(components, instructions, bbox));
			xMins.push(bbox.xMin);
		}
	}
	return { ...assembleGlyf(glyphs), xMins };
}

function readBbox(bboxStream, cursors) {
	const bbox = {
		xMin: readInt16(bboxStream, cursors.bbox),
		yMin: readInt16(bboxStream, cursors.bbox + 2),
		xMax: readInt16(bboxStream, cursors.bbox + 4),
		yMax: readInt16(bboxStream, cursors.bbox + 6)
	};
	cursors.bbox += 8;
	return bbox;
}

function readTriplet(flag, glyphStream, cursors) {
	const offset = cursors.glyph;
	flag &= 0x7F;
	let dx, dy;
	if (flag < 10) {
		dx = 0;
		dy = withSign(flag, ((flag & 14) << 7) + glyphStream[offset]);
		cursors.glyph += 1;
	} else if (flag < 20) {
		dx = withSign(flag, (((flag - 10) & 14) << 7) + glyphStream[offset]);
		dy = 0;
		cursors.glyph += 1;
	} else if (flag < 84) {
		const b0 = flag - 20;
		const b1 = glyphStream[offset];
		dx = withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4));
		dy = withSign(flag >> 1, 1 + ((b0 & 0x0C) << 2) + (b1 & 0x0F));
		cursors.glyph += 1;
	} else if (flag < 120) {
		const b0 = flag - 84;
		dx = withSign(flag, 1 + (Math.floor(b0 / 12) << 8) + glyphStream[offset]);
		dy = withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + glyphStream[offset + 1]);
		cursors.glyph += 2;
	} else if (flag < 124) {
		const b2 = glyphStream[offset + 1];
		dx = withSign(flag, (glyphStream[offset] << 4) + (b2 >> 4));
		dy = withSign(flag >> 1, ((b2 & 0x0F) << 8) + glyphStream[offset + 2]);
		cursors.glyph += 3;
	} else {
		dx = withSign(flag, (glyphStream[offset] << 8) + glyphStream[offset + 1]);
		dy = withSign(flag >> 1, (glyphStream[offset + 2] << 8) + glyphStream[offset + 3]);
		cursors.glyph += 4;
	}
	return [dx, dy];
}

function withSign(flag, value) {
	return flag & 1 ? value : -value;
}

function writeTriplet(dx, dy, onCurve, flagStream, glyphStream) {
	const onCurveFlag = onCurve ? 0 : WOFF2_TRIPLET_OFF_CURVE;
	const xSign = dx < 0 ? 0 : 1;
	const ySign = dy < 0 ? 0 : 1;
	const absDx = Math.abs(dx);
	const absDy = Math.abs(dy);
	if (dx == 0 && absDy < 1280) {
		flagStream.uint8(onCurveFlag + ((absDy & 0xF00) >> 7) + ySign);
		glyphStream.uint8(absDy & 0xFF);
	} else if (dy == 0 && absDx < 1280) {
		flagStream.uint8(onCurveFlag + 10 + ((absDx & 0xF00) >> 7) + xSign);
		glyphStream.uint8(absDx & 0xFF);
	} else if (absDx < 65 && absDy < 65) {
		flagStream.uint8(onCurveFlag + 20 + ((absDx - 1) & 0x30) + (((absDy - 1) & 0x30) >> 2) + xSign + (ySign << 1));
		glyphStream.uint8((((absDx - 1) & 0x0F) << 4) | ((absDy - 1) & 0x0F));
	} else if (absDx < 769 && absDy < 769) {
		flagStream.uint8(onCurveFlag + 84 + (12 * (((absDx - 1) & 0x300) >> 8)) + (((absDy - 1) & 0x300) >> 6) + xSign + (ySign << 1));
		glyphStream.uint8((absDx - 1) & 0xFF);
		glyphStream.uint8((absDy - 1) & 0xFF);
	} else if (absDx < 4096 && absDy < 4096) {
		flagStream.uint8(onCurveFlag + 120 + xSign + (ySign << 1));
		glyphStream.uint8(absDx >> 4);
		glyphStream.uint8(((absDx & 0x0F) << 4) | (absDy >> 8));
		glyphStream.uint8(absDy & 0xFF);
	} else {
		flagStream.uint8(onCurveFlag + 124 + xSign + (ySign << 1));
		glyphStream.uint8(absDx >> 8);
		glyphStream.uint8(absDx & 0xFF);
		glyphStream.uint8(absDy >> 8);
		glyphStream.uint8(absDy & 0xFF);
	}
}

function writeSimpleGlyph(pointCounts, points, instructions, bbox, overlap) {
	const writer = new ByteWriter();
	writer.int16(pointCounts.length);
	writer.int16(bbox.xMin);
	writer.int16(bbox.yMin);
	writer.int16(bbox.xMax);
	writer.int16(bbox.yMax);
	let endPoint = -1;
	pointCounts.forEach(count => {
		endPoint += count;
		writer.uint16(endPoint);
	});
	writer.uint16(instructions.length);
	writer.bytes(instructions);
	points.forEach(({ dx, dy, onCurve }, indexPoint) => {
		let flag = onCurve ? GLYPH_FLAG_ON_CURVE : 0;
		if (!indexPoint && overlap) {
			flag |= GLYPH_FLAG_OVERLAP_SIMPLE;
		}
		if (dx == 0) {
			flag |= GLYPH_FLAG_X_SAME_OR_POSITIVE;
		} else if (dx > -256 && dx < 256) {
			flag |= GLYPH_FLAG_X_SHORT | (dx > 0 ? GLYPH_FLAG_X_SAME_OR_POSITIVE : 0);
		}
		if (dy == 0) {
			flag |= GLYPH_FLAG_Y_SAME_OR_POSITIVE;
		} else if (dy > -256 && dy < 256) {
			flag |= GLYPH_FLAG_Y_SHORT | (dy > 0 ? GLYPH_FLAG_Y_SAME_OR_POSITIVE : 0);
		}
		writer.uint8(flag);
	});
	points.forEach(({ dx }) => {
		if (dx != 0) {
			if (dx > -256 && dx < 256) {
				writer.uint8(Math.abs(dx));
			} else {
				writer.int16(dx);
			}
		}
	});
	points.forEach(({ dy }) => {
		if (dy != 0) {
			if (dy > -256 && dy < 256) {
				writer.uint8(Math.abs(dy));
			} else {
				writer.int16(dy);
			}
		}
	});
	return writer.toUint8Array();
}

function writeCompositeGlyph(components, instructions, bbox) {
	const writer = new ByteWriter();
	writer.int16(-1);
	writer.int16(bbox.xMin);
	writer.int16(bbox.yMin);
	writer.int16(bbox.xMax);
	writer.int16(bbox.yMax);
	writer.bytes(components);
	if (instructions) {
		writer.uint16(instructions.length);
		writer.bytes(instructions);
	}
	return writer.toUint8Array();
}

function getComponentLength(flags) {
	let length = flags & COMPOSITE_ARG_1_AND_2_ARE_WORDS ? 8 : 6;
	if (flags & COMPOSITE_WE_HAVE_A_SCALE) {
		length += 2;
	} else if (flags & COMPOSITE_WE_HAVE_AN_X_AND_Y_SCALE) {
		length += 4;
	} else if (flags & COMPOSITE_WE_HAVE_A_TWO_BY_TWO) {
		length += 8;
	}
	return length;
}

function assembleGlyf(glyphs) {
	const glyphCount = glyphs.length;
	const glyfTable = new Uint8Array(glyphs.reduce((length, glyphData) => length + align(glyphData.length), 0));
	const locaTable = new Uint8Array((glyphCount + 1) * 4);
	let offset = 0;
	glyphs.forEach((glyphData, glyphId) => {
		writeUint32(locaTable, glyphId * 4, offset);
		glyfTable.set(glyphData, offset);
		offset += align(glyphData.length);
	});
	writeUint32(locaTable, glyphCount * 4, offset);
	return { glyfTable, locaTable };
}

function reconstructHmtx(data, xMins, metricsCount, glyphCount) {
	const flags = data[0];
	if (!(flags & (WOFF2_HMTX_NO_LSB_FLAG | WOFF2_HMTX_NO_LEFT_SIDE_BEARING_FLAG)) || metricsCount > glyphCount) {
		throw new Error("Invalid transformed hmtx table");
	}
	const hmtx = new Uint8Array(metricsCount * 4 + (glyphCount - metricsCount) * 2);
	let offset = 1;
	for (let glyphId = 0; glyphId < metricsCount; glyphId++) {
		writeUint16(hmtx, glyphId * 4, readUint16(data, offset));
		offset += 2;
	}
	for (let glyphId = 0; glyphId < metricsCount; glyphId++) {
		if (flags & WOFF2_HMTX_NO_LSB_FLAG) {
			writeInt16(hmtx, glyphId * 4 + 2, xMins[glyphId]);
		} else {
			writeInt16(hmtx, glyphId * 4 + 2, readInt16(data, offset));
			offset += 2;
		}
	}
	for (let glyphId = metricsCount; glyphId < glyphCount; glyphId++) {
		const lsbOffset = metricsCount * 4 + (glyphId - metricsCount) * 2;
		if (flags & WOFF2_HMTX_NO_LEFT_SIDE_BEARING_FLAG) {
			writeInt16(hmtx, lsbOffset, xMins[glyphId]);
		} else {
			writeInt16(hmtx, lsbOffset, readInt16(data, offset));
			offset += 2;
		}
	}
	return hmtx;
}

function transformGlyf(glyf, locaOffsets, glyphCount) {
	const nContourStream = new ByteWriter();
	const nPointsStream = new ByteWriter();
	const flagStream = new ByteWriter();
	const glyphStream = new ByteWriter();
	const compositeStream = new ByteWriter();
	const bboxStream = new ByteWriter();
	const instructionStream = new ByteWriter();
	const bboxBitmap = new Uint8Array(4 * Math.floor((glyphCount + 31) / 32));
	const overlapBitmap = new Uint8Array((glyphCount + 7) >> 3);
	let hasOverlap = false;
	for (let glyphId = 0; glyphId < glyphCount; glyphId++) {
		const glyphOffset = locaOffsets[glyphId];
		const glyphEnd = locaOffsets[glyphId + 1];
		const contourCount = glyphEnd - glyphOffset >= GLYPH_HEADER_LENGTH ? readInt16(glyf, glyphOffset) : 0;
		if (contourCount == 0) {
			nContourStream.int16(0);
		} else if (contourCount > 0) {
			nContourStream.int16(contourCount);
			let offset = glyphOffset + GLYPH_HEADER_LENGTH;
			let pointCount = 0;
			for (let indexContour = 0; indexContour < contourCount; indexContour++) {
				const endPoint = readUint16(glyf, offset);
				write255Uint16(nPointsStream, endPoint + 1 - pointCount);
				pointCount = endPoint + 1;
				offset += 2;
			}
			const instructionLength = readUint16(glyf, offset);
			offset += 2;
			const instructions = glyf.subarray(offset, offset + instructionLength);
			offset += instructionLength;
			const flags = [];
			while (flags.length < pointCount) {
				const flag = glyf[offset++];
				flags.push(flag);
				if (flag & GLYPH_FLAG_REPEAT) {
					let repeatCount = glyf[offset++];
					while (repeatCount-- > 0 && flags.length < pointCount) {
						flags.push(flag);
					}
				}
			}
			const deltas = [];
			flags.forEach(flag => {
				let dx = 0;
				if (flag & GLYPH_FLAG_X_SHORT) {
					dx = flag & GLYPH_FLAG_X_SAME_OR_POSITIVE ? glyf[offset] : -glyf[offset];
					offset += 1;
				} else if (!(flag & GLYPH_FLAG_X_SAME_OR_POSITIVE)) {
					dx = readInt16(glyf, offset);
					offset += 2;
				}
				deltas.push({ dx });
			});
			flags.forEach((flag, indexPoint) => {
				let dy = 0;
				if (flag & GLYPH_FLAG_Y_SHORT) {
					dy = flag & GLYPH_FLAG_Y_SAME_OR_POSITIVE ? glyf[offset] : -glyf[offset];
					offset += 1;
				} else if (!(flag & GLYPH_FLAG_Y_SAME_OR_POSITIVE)) {
					dy = readInt16(glyf, offset);
					offset += 2;
				}
				deltas[indexPoint].dy = dy;
			});
			const bbox = { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
			let x = 0, y = 0;
			deltas.forEach(({ dx, dy }, indexPoint) => {
				x += dx;
				y += dy;
				if (!indexPoint || x < bbox.xMin) {
					bbox.xMin = x;
				}
				if (!indexPoint || x > bbox.xMax) {
					bbox.xMax = x;
				}
				if (!indexPoint || y < bbox.yMin) {
					bbox.yMin = y;
				}
				if (!indexPoint || y > bbox.yMax) {
					bbox.yMax = y;
				}
				writeTriplet(dx, dy, Boolean(flags[indexPoint] & GLYPH_FLAG_ON_CURVE), flagStream, glyphStream);
			});
			write255Uint16(glyphStream, instructionLength);
			instructionStream.bytes(instructions);
			if (readInt16(glyf, glyphOffset + 2) != bbox.xMin || readInt16(glyf, glyphOffset + 4) != bbox.yMin || readInt16(glyf, glyphOffset + 6) != bbox.xMax || readInt16(glyf, glyphOffset + 8) != bbox.yMax) {
				bboxBitmap[glyphId >> 3] |= 0x80 >> (glyphId & 7);
				bboxStream.bytes(glyf.subarray(glyphOffset + 2, glyphOffset + GLYPH_HEADER_LENGTH));
			}
			if (flags.length && (flags[0] & GLYPH_FLAG_OVERLAP_SIMPLE)) {
				overlapBitmap[glyphId >> 3] |= 0x80 >> (glyphId & 7);
				hasOverlap = true;
			}
		} else {
			nContourStream.int16(-1);
			bboxBitmap[glyphId >> 3] |= 0x80 >> (glyphId & 7);
			bboxStream.bytes(glyf.subarray(glyphOffset + 2, glyphOffset + GLYPH_HEADER_LENGTH));
			let offset = glyphOffset + GLYPH_HEADER_LENGTH;
			let flags, hasInstructions = false;
			do {
				flags = readUint16(glyf, offset);
				offset += getComponentLength(flags);
				hasInstructions = hasInstructions || Boolean(flags & COMPOSITE_WE_HAVE_INSTRUCTIONS);
			} while ((flags & COMPOSITE_MORE_COMPONENTS) && offset < glyphEnd);
			compositeStream.bytes(glyf.subarray(glyphOffset + GLYPH_HEADER_LENGTH, offset));
			if (hasInstructions) {
				const instructionLength = readUint16(glyf, offset);
				write255Uint16(glyphStream, instructionLength);
				instructionStream.bytes(glyf.subarray(offset + 2, offset + 2 + instructionLength));
			}
		}
	}
	const streams = [nContourStream, nPointsStream, flagStream, glyphStream, compositeStream, null, instructionStream].map(stream => stream ? stream.toUint8Array() : concat([bboxBitmap, bboxStream.toUint8Array()]));
	const writer = new ByteWriter();
	writer.uint16(0);
	writer.uint16(hasOverlap ? WOFF2_OVERLAP_BITMAP_FLAG : 0);
	writer.uint16(glyphCount);
	writer.uint16(LONG_LOCA_FORMAT);
	streams.forEach(stream => writer.uint32(stream.length));
	streams.forEach(stream => writer.bytes(stream));
	if (hasOverlap) {
		writer.bytes(overlapBitmap);
	}
	return writer.toUint8Array();
}

function concat(arrays) {
	const result = new Uint8Array(arrays.reduce((length, array) => length + array.length, 0));
	let offset = 0;
	arrays.forEach(array => {
		result.set(array, offset);
		offset += array.length;
	});
	return result;
}

function read255Uint16(data, cursors, name) {
	const code = data[cursors[name]++];
	if (code == WOFF2_WORD_CODE) {
		const value = readUint16(data, cursors[name]);
		cursors[name] += 2;
		return value;
	} else if (code == WOFF2_ONE_MORE_BYTE_CODE_1) {
		return data[cursors[name]++] + WOFF2_LOWEST_U_CODE;
	} else if (code == WOFF2_ONE_MORE_BYTE_CODE_2) {
		return data[cursors[name]++] + WOFF2_LOWEST_U_CODE * 2;
	} else {
		return code;
	}
}

function write255Uint16(writer, value) {
	if (value < WOFF2_LOWEST_U_CODE) {
		writer.uint8(value);
	} else if (value < WOFF2_LOWEST_U_CODE * 2) {
		writer.uint8(WOFF2_ONE_MORE_BYTE_CODE_1);
		writer.uint8(value - WOFF2_LOWEST_U_CODE);
	} else if (value < WOFF2_LOWEST_U_CODE * 3) {
		writer.uint8(WOFF2_ONE_MORE_BYTE_CODE_2);
		writer.uint8(value - WOFF2_LOWEST_U_CODE * 2);
	} else {
		writer.uint8(WOFF2_WORD_CODE);
		writer.uint16(value);
	}
}

function readBase128(data, offset) {
	let value = 0;
	for (let indexByte = 0; indexByte < 5; indexByte++) {
		const byte = data[offset++];
		if ((!indexByte && byte == 0x80) || value >= 0x2000000) {
			throw new Error("Invalid UIntBase128");
		}
		value = value * 128 + (byte & 0x7F);
		if (!(byte & 0x80)) {
			return [value, offset];
		}
	}
	throw new Error("Invalid UIntBase128");
}

function writeBase128(writer, value) {
	const bytes = [];
	do {
		bytes.unshift(value & 0x7F);
		value = Math.floor(value / 128);
	} while (value > 0);
	bytes.forEach((byte, indexByte) => writer.uint8(indexByte < bytes.length - 1 ? byte | 0x80 : byte));
}

class ByteWriter {
	constructor() {
		this.data = new Uint8Array(256);
		this.length = 0;
	}

	ensure(count) {
		if (this.length + count > this.data.length) {
			let size = this.data.length * 2;
			while (size < this.length + count) {
				size *= 2;
			}
			const data = new Uint8Array(size);
			data.set(this.data.subarray(0, this.length));
			this.data = data;
		}
	}

	uint8(value) {
		this.ensure(1);
		this.data[this.length++] = value & 0xFF;
	}

	uint16(value) {
		this.ensure(2);
		writeUint16(this.data, this.length, value);
		this.length += 2;
	}

	int16(value) {
		this.uint16(value & 0xFFFF);
	}

	uint32(value) {
		this.ensure(4);
		writeUint32(this.data, this.length, value);
		this.length += 4;
	}

	bytes(data) {
		this.ensure(data.length);
		this.data.set(data, this.length);
		this.length += data.length;
	}

	toUint8Array() {
		return this.data.subarray(0, this.length);
	}
}

function readLoca(loca, glyphCount, locaFormat) {
	const offsets = [];
	if (locaFormat == LONG_LOCA_FORMAT) {
		if (loca.length < (glyphCount + 1) * 4) {
			return null;
		}
		for (let glyphId = 0; glyphId <= glyphCount; glyphId++) {
			offsets.push(readUint32(loca, glyphId * 4));
		}
	} else {
		if (loca.length < (glyphCount + 1) * 2) {
			return null;
		}
		for (let glyphId = 0; glyphId <= glyphCount; glyphId++) {
			offsets.push(readUint16(loca, glyphId * 2) * 2);
		}
	}
	return offsets;
}

function readCmap(cmap) {
	const mapping = new Map();
	const variationGlyphIds = new Map();
	let variationSubtable = null;
	const subtableCount = readUint16(cmap, 2);
	for (let indexSubtable = 0; indexSubtable < subtableCount; indexSubtable++) {
		const recordOffset = 4 + indexSubtable * 8;
		const platformId = readUint16(cmap, recordOffset);
		const encodingId = readUint16(cmap, recordOffset + 2);
		const offset = readUint32(cmap, recordOffset + 4);
		const format = readUint16(cmap, offset);
		if (format == CMAP_FORMAT_VARIATION) {
			if (platformId == CMAP_PLATFORM_UNICODE && encodingId == CMAP_ENCODING_UNICODE_VARIATION) {
				const length = readUint32(cmap, offset + 2);
				variationSubtable = cmap.subarray(offset, offset + length);
				readVariationGlyphIds(cmap, offset, variationGlyphIds);
			}
		} else if (platformId == CMAP_PLATFORM_UNICODE || (platformId == CMAP_PLATFORM_WINDOWS && (encodingId == CMAP_ENCODING_WINDOWS_BMP || encodingId == CMAP_ENCODING_WINDOWS_FULL))) {
			readCmapSubtable(cmap, offset, format, mapping);
		}
	}
	return { mapping, variationGlyphIds, variationSubtable };
}

function readCmapSubtable(cmap, offset, format, mapping) {
	const setMapping = (charCode, glyphId) => {
		if (glyphId && !mapping.has(charCode)) {
			mapping.set(charCode, glyphId);
		}
	};
	if (format == CMAP_FORMAT_BYTE) {
		for (let charCode = 0; charCode < 256; charCode++) {
			setMapping(charCode, cmap[offset + 6 + charCode]);
		}
	} else if (format == CMAP_FORMAT_SEGMENT) {
		const segmentCount = readUint16(cmap, offset + 6) / 2;
		const endCodesOffset = offset + 14;
		const startCodesOffset = endCodesOffset + segmentCount * 2 + 2;
		const deltasOffset = startCodesOffset + segmentCount * 2;
		const rangeOffsetsOffset = deltasOffset + segmentCount * 2;
		for (let indexSegment = 0; indexSegment < segmentCount; indexSegment++) {
			const endCode = readUint16(cmap, endCodesOffset + indexSegment * 2);
			const startCode = readUint16(cmap, startCodesOffset + indexSegment * 2);
			const delta = readUint16(cmap, deltasOffset + indexSegment * 2);
			const rangeOffsetOffset = rangeOffsetsOffset + indexSegment * 2;
			const rangeOffset = readUint16(cmap, rangeOffsetOffset);
			for (let charCode = startCode; charCode <= endCode && charCode != MAX_BMP_CHAR_CODE; charCode++) {
				if (rangeOffset) {
					const glyphOffset = rangeOffsetOffset + rangeOffset + (charCode - startCode) * 2;
					if (glyphOffset + 1 < cmap.length) {
						const glyphId = readUint16(cmap, glyphOffset);
						setMapping(charCode, glyphId ? (glyphId + delta) & 0xFFFF : 0);
					}
				} else {
					setMapping(charCode, (charCode + delta) & 0xFFFF);
				}
			}
		}
	} else if (format == CMAP_FORMAT_TRIMMED) {
		const firstCode = readUint16(cmap, offset + 6);
		const entryCount = readUint16(cmap, offset + 8);
		for (let indexEntry = 0; indexEntry < entryCount; indexEntry++) {
			setMapping(firstCode + indexEntry, readUint16(cmap, offset + 10 + indexEntry * 2));
		}
	} else if (format == CMAP_FORMAT_GROUPS) {
		const groupCount = readUint32(cmap, offset + 12);
		for (let indexGroup = 0; indexGroup < groupCount; indexGroup++) {
			const groupOffset = offset + 16 + indexGroup * 12;
			const startCharCode = readUint32(cmap, groupOffset);
			const endCharCode = readUint32(cmap, groupOffset + 4);
			const startGlyphId = readUint32(cmap, groupOffset + 8);
			for (let charCode = startCharCode; charCode <= endCharCode; charCode++) {
				setMapping(charCode, startGlyphId + charCode - startCharCode);
			}
		}
	}
}

function readVariationGlyphIds(cmap, offset, glyphIds) {
	const recordCount = readUint32(cmap, offset + 6);
	for (let indexRecord = 0; indexRecord < recordCount; indexRecord++) {
		const recordOffset = offset + 10 + indexRecord * 11;
		const nonDefaultOffset = readUint32(cmap, recordOffset + 7);
		if (nonDefaultOffset) {
			const mappingsOffset = offset + nonDefaultOffset;
			const mappingCount = readUint32(cmap, mappingsOffset);
			for (let indexMapping = 0; indexMapping < mappingCount; indexMapping++) {
				const mappingOffset = mappingsOffset + 4 + indexMapping * 5;
				const charCode = (cmap[mappingOffset] << 16) | (cmap[mappingOffset + 1] << 8) | cmap[mappingOffset + 2];
				if (!glyphIds.has(charCode)) {
					glyphIds.set(charCode, new Set());
				}
				glyphIds.get(charCode).add(readUint16(cmap, mappingOffset + 3));
			}
		}
	}
}

function addGsubClosure(gsub, keptGlyphIds) {
	const rules = [];
	const lookupListOffset = readUint16(gsub, 8);
	const lookupCount = readUint16(gsub, lookupListOffset);
	for (let indexLookup = 0; indexLookup < lookupCount; indexLookup++) {
		const lookupOffset = lookupListOffset + readUint16(gsub, lookupListOffset + 2 + indexLookup * 2);
		const lookupType = readUint16(gsub, lookupOffset);
		const subtableCount = readUint16(gsub, lookupOffset + 4);
		for (let indexSubtable = 0; indexSubtable < subtableCount; indexSubtable++) {
			readGsubRules(gsub, lookupType, lookupOffset + readUint16(gsub, lookupOffset + 6 + indexSubtable * 2), rules);
		}
	}
	let added;
	do {
		added = false;
		rules.forEach(rule => {
			if (!rule.done && rule.inputs.every(glyphId => keptGlyphIds.has(glyphId))) {
				rule.done = true;
				rule.outputs.forEach(glyphId => {
					if (!keptGlyphIds.has(glyphId)) {
						keptGlyphIds.add(glyphId);
						added = true;
					}
				});
			}
		});
	} while (added);
}

function readGsubRules(gsub, lookupType, offset, rules) {
	const format = readUint16(gsub, offset);
	if (lookupType == GSUB_LOOKUP_EXTENSION) {
		readGsubRules(gsub, readUint16(gsub, offset + 2), offset + readUint32(gsub, offset + 4), rules);
	} else if (lookupType == GSUB_LOOKUP_SINGLE) {
		const coverage = readCoverage(gsub, offset + readUint16(gsub, offset + 2));
		if (format == 1) {
			const delta = readInt16(gsub, offset + 4);
			coverage.forEach(glyphId => rules.push({ inputs: [glyphId], outputs: [(glyphId + delta) & 0xFFFF] }));
		} else {
			const substitutes = readGlyphArray(gsub, offset + 4);
			coverage.forEach((glyphId, indexGlyph) => rules.push({ inputs: [glyphId], outputs: substitutes.slice(indexGlyph, indexGlyph + 1) }));
		}
	} else if (lookupType == GSUB_LOOKUP_MULTIPLE || lookupType == GSUB_LOOKUP_ALTERNATE) {
		const coverage = readCoverage(gsub, offset + readUint16(gsub, offset + 2));
		const setCount = readUint16(gsub, offset + 4);
		for (let indexSet = 0; indexSet < setCount && indexSet < coverage.length; indexSet++) {
			rules.push({ inputs: [coverage[indexSet]], outputs: readGlyphArray(gsub, offset + readUint16(gsub, offset + 6 + indexSet * 2)) });
		}
	} else if (lookupType == GSUB_LOOKUP_LIGATURE) {
		const coverage = readCoverage(gsub, offset + readUint16(gsub, offset + 2));
		const setCount = readUint16(gsub, offset + 4);
		for (let indexSet = 0; indexSet < setCount && indexSet < coverage.length; indexSet++) {
			const setOffset = offset + readUint16(gsub, offset + 6 + indexSet * 2);
			const ligatureCount = readUint16(gsub, setOffset);
			for (let indexLigature = 0; indexLigature < ligatureCount; indexLigature++) {
				const ligatureOffset = setOffset + readUint16(gsub, setOffset + 2 + indexLigature * 2);
				const componentCount = readUint16(gsub, ligatureOffset + 2);
				const inputs = [coverage[indexSet]];
				for (let indexComponent = 1; indexComponent < componentCount; indexComponent++) {
					inputs.push(readUint16(gsub, ligatureOffset + 4 + (indexComponent - 1) * 2));
				}
				rules.push({ inputs, outputs: [readUint16(gsub, ligatureOffset)] });
			}
		}
	} else if (lookupType == GSUB_LOOKUP_REVERSE_CHAINING) {
		const coverage = readCoverage(gsub, offset + readUint16(gsub, offset + 2));
		const backtrackCount = readUint16(gsub, offset + 4);
		const lookaheadOffset = offset + 6 + backtrackCount * 2;
		const lookaheadCount = readUint16(gsub, lookaheadOffset);
		const substitutes = readGlyphArray(gsub, lookaheadOffset + 2 + lookaheadCount * 2);
		coverage.forEach((glyphId, indexGlyph) => rules.push({ inputs: [glyphId], outputs: substitutes.slice(indexGlyph, indexGlyph + 1) }));
	}
}

function readGlyphArray(data, offset) {
	const glyphIds = [];
	const glyphCount = readUint16(data, offset);
	for (let indexGlyph = 0; indexGlyph < glyphCount; indexGlyph++) {
		glyphIds.push(readUint16(data, offset + 2 + indexGlyph * 2));
	}
	return glyphIds;
}

function readCoverage(data, offset) {
	const glyphIds = [];
	const format = readUint16(data, offset);
	if (format == 1) {
		const glyphCount = readUint16(data, offset + 2);
		for (let indexGlyph = 0; indexGlyph < glyphCount; indexGlyph++) {
			glyphIds.push(readUint16(data, offset + 4 + indexGlyph * 2));
		}
	} else if (format == 2) {
		const rangeCount = readUint16(data, offset + 2);
		for (let indexRange = 0; indexRange < rangeCount; indexRange++) {
			const rangeOffset = offset + 4 + indexRange * 6;
			const startGlyphId = readUint16(data, rangeOffset);
			const endGlyphId = readUint16(data, rangeOffset + 2);
			for (let glyphId = startGlyphId; glyphId <= endGlyphId; glyphId++) {
				glyphIds.push(glyphId);
			}
		}
	}
	return glyphIds;
}

function addCompositeComponents(glyf, locaOffsets, glyphId, keptGlyphIds) {
	const glyphOffset = locaOffsets[glyphId];
	const glyphEnd = locaOffsets[glyphId + 1];
	if (glyphEnd - glyphOffset < 10 || readInt16(glyf, glyphOffset) >= 0) {
		return;
	}
	let offset = glyphOffset + 10;
	let flags;
	do {
		flags = readUint16(glyf, offset);
		const componentGlyphId = readUint16(glyf, offset + 2);
		offset += (flags & COMPOSITE_ARG_1_AND_2_ARE_WORDS) ? 8 : 6;
		if (flags & COMPOSITE_WE_HAVE_A_SCALE) {
			offset += 2;
		} else if (flags & COMPOSITE_WE_HAVE_AN_X_AND_Y_SCALE) {
			offset += 4;
		} else if (flags & COMPOSITE_WE_HAVE_A_TWO_BY_TWO) {
			offset += 8;
		}
		if (!keptGlyphIds.has(componentGlyphId)) {
			keptGlyphIds.add(componentGlyphId);
			addCompositeComponents(glyf, locaOffsets, componentGlyphId, keptGlyphIds);
		}
	} while ((flags & COMPOSITE_MORE_COMPONENTS) && offset < glyphEnd);
}

function writeGlyf(glyf, locaOffsets, glyphCount, keptGlyphIds) {
	const glyphs = [];
	let glyfLength = 0;
	for (let glyphId = 0; glyphId < glyphCount; glyphId++) {
		const glyphData = keptGlyphIds.has(glyphId) ? glyf.subarray(locaOffsets[glyphId], locaOffsets[glyphId + 1]) : new Uint8Array(0);
		glyphs.push(glyphData);
		glyfLength += align(glyphData.length);
	}
	const glyfTable = new Uint8Array(glyfLength);
	const locaTable = new Uint8Array((glyphCount + 1) * 4);
	let offset = 0;
	glyphs.forEach((glyphData, glyphId) => {
		writeUint32(locaTable, glyphId * 4, offset);
		glyfTable.set(glyphData, offset);
		offset += align(glyphData.length);
	});
	writeUint32(locaTable, glyphCount * 4, offset);
	return { glyfTable, locaTable };
}

function writeCmap(keptCharCodes, variationSubtable) {
	const charCodes = Array.from(keptCharCodes.keys()).sort((charCode, otherCharCode) => charCode - otherCharCode);
	const bmpCharCodes = charCodes.filter(charCode => charCode <= MAX_BMP_CHAR_CODE);
	const segmentSubtable = writeSegmentSubtable(bmpCharCodes, keptCharCodes);
	const groupsSubtable = charCodes.length > bmpCharCodes.length ? writeGroupsSubtable(charCodes, keptCharCodes) : null;
	const records = [[CMAP_PLATFORM_UNICODE, CMAP_ENCODING_UNICODE_BMP, segmentSubtable]];
	if (groupsSubtable) {
		records.push([CMAP_PLATFORM_UNICODE, CMAP_ENCODING_UNICODE_FULL, groupsSubtable]);
	}
	if (variationSubtable) {
		records.push([CMAP_PLATFORM_UNICODE, CMAP_ENCODING_UNICODE_VARIATION, variationSubtable]);
	}
	records.push([CMAP_PLATFORM_WINDOWS, CMAP_ENCODING_WINDOWS_BMP, segmentSubtable]);
	if (groupsSubtable) {
		records.push([CMAP_PLATFORM_WINDOWS, CMAP_ENCODING_WINDOWS_FULL, groupsSubtable]);
	}
	const subtables = [];
	const subtableOffsets = new Map();
	let offset = 4 + records.length * 8;
	records.forEach(([, , subtable]) => {
		if (!subtableOffsets.has(subtable)) {
			subtableOffsets.set(subtable, offset);
			subtables.push(subtable);
			offset += subtable.length;
		}
	});
	const cmap = new Uint8Array(offset);
	writeUint16(cmap, 0, 0);
	writeUint16(cmap, 2, records.length);
	records.forEach(([platformId, encodingId, subtable], indexRecord) => {
		const recordOffset = 4 + indexRecord * 8;
		writeUint16(cmap, recordOffset, platformId);
		writeUint16(cmap, recordOffset + 2, encodingId);
		writeUint32(cmap, recordOffset + 4, subtableOffsets.get(subtable));
	});
	subtables.forEach(subtable => cmap.set(subtable, subtableOffsets.get(subtable)));
	return cmap;
}

function writeSegmentSubtable(charCodes, keptCharCodes) {
	const segments = [];
	charCodes.forEach(charCode => {
		const lastSegment = segments[segments.length - 1];
		if (lastSegment && charCode == lastSegment.endCode + 1) {
			lastSegment.endCode = charCode;
			lastSegment.glyphIds.push(keptCharCodes.get(charCode));
		} else {
			segments.push({ startCode: charCode, endCode: charCode, glyphIds: [keptCharCodes.get(charCode)] });
		}
	});
	segments.forEach(segment => {
		const delta = (segment.glyphIds[0] - segment.startCode) & 0xFFFF;
		segment.delta = segment.glyphIds.every((glyphId, indexGlyph) => ((segment.startCode + indexGlyph + delta) & 0xFFFF) == glyphId) ? delta : null;
	});
	segments.push({ startCode: MAX_BMP_CHAR_CODE, endCode: MAX_BMP_CHAR_CODE, glyphIds: [], delta: 1 });
	const segmentCount = segments.length;
	const glyphIdArrayLength = segments.reduce((length, segment) => length + (segment.delta === null ? segment.glyphIds.length : 0), 0);
	const length = 16 + segmentCount * 8 + glyphIdArrayLength * 2;
	const subtable = new Uint8Array(length);
	const searchRange = 2 * Math.pow(2, Math.floor(Math.log2(segmentCount)));
	writeUint16(subtable, 0, CMAP_FORMAT_SEGMENT);
	writeUint16(subtable, 2, length);
	writeUint16(subtable, 4, 0);
	writeUint16(subtable, 6, segmentCount * 2);
	writeUint16(subtable, 8, searchRange);
	writeUint16(subtable, 10, Math.log2(searchRange / 2));
	writeUint16(subtable, 12, segmentCount * 2 - searchRange);
	const endCodesOffset = 14;
	const startCodesOffset = endCodesOffset + segmentCount * 2 + 2;
	const deltasOffset = startCodesOffset + segmentCount * 2;
	const rangeOffsetsOffset = deltasOffset + segmentCount * 2;
	const glyphIdArrayOffset = rangeOffsetsOffset + segmentCount * 2;
	let glyphIdArrayIndex = 0;
	segments.forEach((segment, indexSegment) => {
		writeUint16(subtable, endCodesOffset + indexSegment * 2, segment.endCode);
		writeUint16(subtable, startCodesOffset + indexSegment * 2, segment.startCode);
		if (segment.delta === null) {
			writeUint16(subtable, deltasOffset + indexSegment * 2, 0);
			writeUint16(subtable, rangeOffsetsOffset + indexSegment * 2, glyphIdArrayOffset + glyphIdArrayIndex * 2 - (rangeOffsetsOffset + indexSegment * 2));
			segment.glyphIds.forEach(glyphId => {
				writeUint16(subtable, glyphIdArrayOffset + glyphIdArrayIndex * 2, glyphId);
				glyphIdArrayIndex++;
			});
		} else {
			writeUint16(subtable, deltasOffset + indexSegment * 2, segment.delta);
			writeUint16(subtable, rangeOffsetsOffset + indexSegment * 2, 0);
		}
	});
	return subtable;
}

function writeGroupsSubtable(charCodes, keptCharCodes) {
	const groups = [];
	charCodes.forEach(charCode => {
		const glyphId = keptCharCodes.get(charCode);
		const lastGroup = groups[groups.length - 1];
		if (lastGroup && charCode == lastGroup.endCharCode + 1 && glyphId == lastGroup.startGlyphId + (charCode - lastGroup.startCharCode)) {
			lastGroup.endCharCode = charCode;
		} else {
			groups.push({ startCharCode: charCode, endCharCode: charCode, startGlyphId: glyphId });
		}
	});
	const length = 16 + groups.length * 12;
	const subtable = new Uint8Array(length);
	writeUint16(subtable, 0, CMAP_FORMAT_GROUPS);
	writeUint16(subtable, 2, 0);
	writeUint32(subtable, 4, length);
	writeUint32(subtable, 8, 0);
	writeUint32(subtable, 12, groups.length);
	groups.forEach((group, indexGroup) => {
		const groupOffset = 16 + indexGroup * 12;
		writeUint32(subtable, groupOffset, group.startCharCode);
		writeUint32(subtable, groupOffset + 4, group.endCharCode);
		writeUint32(subtable, groupOffset + 8, group.startGlyphId);
	});
	return subtable;
}

function writeSfnt(flavor, tables) {
	const tags = Array.from(tables.keys()).sort();
	const entries = [];
	let offset = SFNT_HEADER_LENGTH + tags.length * SFNT_ENTRY_LENGTH;
	tags.forEach(tag => {
		const table = tables.get(tag);
		entries.push({ tag, offset, length: table.length, checksum: checksum(table) });
		offset += align(table.length);
	});
	const data = new Uint8Array(offset);
	const searchRange = 16 * Math.pow(2, Math.floor(Math.log2(tags.length)));
	writeUint32(data, 0, flavor);
	writeUint16(data, 4, tags.length);
	writeUint16(data, 6, searchRange);
	writeUint16(data, 8, Math.log2(searchRange / 16));
	writeUint16(data, 10, tags.length * 16 - searchRange);
	entries.forEach((entry, indexEntry) => {
		const entryOffset = SFNT_HEADER_LENGTH + indexEntry * SFNT_ENTRY_LENGTH;
		writeTag(data, entryOffset, entry.tag);
		writeUint32(data, entryOffset + 4, entry.checksum);
		writeUint32(data, entryOffset + 8, entry.offset);
		writeUint32(data, entryOffset + 12, entry.length);
		data.set(tables.get(entry.tag), entry.offset);
	});
	const headEntry = entries.find(entry => entry.tag == TAG_HEAD);
	writeUint32(data, headEntry.offset + HEAD_CHECKSUM_OFFSET, (CHECKSUM_ADJUSTMENT_MAGIC - checksum(data)) >>> 0);
	return { data, entries };
}

async function writeWoff(sfnt, font) {
	const tables = await Promise.all(sfnt.entries.map(async entry => {
		const original = sfnt.data.subarray(entry.offset, entry.offset + entry.length);
		const compressed = await deflate(original);
		return { entry, data: compressed.length < original.length ? compressed : original };
	}));
	let offset = WOFF_HEADER_LENGTH + tables.length * WOFF_ENTRY_LENGTH;
	const tableOffsets = tables.map(({ data }) => {
		const tableOffset = offset;
		offset += align(data.length);
		return tableOffset;
	});
	const metaOffset = font.metadata ? offset : 0;
	offset += font.metadata ? align(font.metadata.length) : 0;
	const privateOffset = font.privateData ? offset : 0;
	offset += font.privateData ? font.privateData.length : 0;
	const data = new Uint8Array(offset);
	writeUint32(data, 0, SFNT_WOFF);
	writeUint32(data, 4, font.flavor);
	writeUint32(data, 8, offset);
	writeUint16(data, 12, tables.length);
	writeUint32(data, 16, sfnt.data.length);
	writeUint32(data, 20, font.version);
	writeUint32(data, 24, metaOffset);
	writeUint32(data, 28, font.metadata ? font.metadata.length : 0);
	writeUint32(data, 32, font.metadata ? font.metaOriginalLength : 0);
	writeUint32(data, 36, privateOffset);
	writeUint32(data, 40, font.privateData ? font.privateData.length : 0);
	tables.forEach(({ entry, data: tableData }, indexTable) => {
		const entryOffset = WOFF_HEADER_LENGTH + indexTable * WOFF_ENTRY_LENGTH;
		writeTag(data, entryOffset, entry.tag);
		writeUint32(data, entryOffset + 4, tableOffsets[indexTable]);
		writeUint32(data, entryOffset + 8, tableData.length);
		writeUint32(data, entryOffset + 12, entry.length);
		writeUint32(data, entryOffset + 16, entry.checksum);
		data.set(tableData, tableOffsets[indexTable]);
	});
	if (font.metadata) {
		data.set(font.metadata, metaOffset);
	}
	if (font.privateData) {
		data.set(font.privateData, privateOffset);
	}
	return data;
}

async function writeWoff2(sfnt, font, brotli, glyphCount) {
	const locaEntry = sfnt.entries.find(entry => entry.tag == TAG_LOCA);
	const locaOffsets = readLoca(sfnt.data.subarray(locaEntry.offset, locaEntry.offset + locaEntry.length), glyphCount, LONG_LOCA_FORMAT);
	const directory = new ByteWriter();
	const payload = new ByteWriter();
	sfnt.entries.forEach(entry => {
		const table = sfnt.data.subarray(entry.offset, entry.offset + entry.length);
		const knownTag = WOFF2_KNOWN_TAGS.indexOf(entry.tag);
		let transformVersion = 0, transformedTable = table;
		if (entry.tag == TAG_GLYF) {
			transformVersion = WOFF2_GLYF_TRANSFORM;
			transformedTable = transformGlyf(table, locaOffsets, glyphCount);
		} else if (entry.tag == TAG_LOCA) {
			transformVersion = WOFF2_GLYF_TRANSFORM;
			transformedTable = new Uint8Array(0);
		}
		directory.uint8((knownTag < 0 ? WOFF2_ARBITRARY_TAG : knownTag) | (transformVersion << WOFF2_TRANSFORM_VERSION_SHIFT));
		if (knownTag < 0) {
			directory.bytes(new Uint8Array([...entry.tag].map(character => character.charCodeAt(0))));
		}
		writeBase128(directory, entry.length);
		if (entry.tag == TAG_GLYF || entry.tag == TAG_LOCA) {
			writeBase128(directory, transformedTable.length);
		}
		payload.bytes(transformedTable);
	});
	const compressed = await brotli.compress(payload.toUint8Array());
	const directoryData = directory.toUint8Array();
	let offset = align(WOFF2_HEADER_LENGTH + directoryData.length + compressed.length);
	const metaOffset = font.metadata ? offset : 0;
	offset = font.metadata ? align(metaOffset + font.metadata.length) : offset;
	const privateOffset = font.privateData ? offset : 0;
	offset = font.privateData ? privateOffset + font.privateData.length : offset;
	const data = new Uint8Array(offset);
	writeUint32(data, 0, SFNT_WOFF2);
	writeUint32(data, 4, font.flavor);
	writeUint32(data, 8, offset);
	writeUint16(data, 12, sfnt.entries.length);
	writeUint32(data, 16, sfnt.data.length);
	writeUint32(data, 20, compressed.length);
	writeUint32(data, 24, font.version);
	writeUint32(data, 28, metaOffset);
	writeUint32(data, 32, font.metadata ? font.metadata.length : 0);
	writeUint32(data, 36, font.metadata ? font.metaOriginalLength : 0);
	writeUint32(data, 40, privateOffset);
	writeUint32(data, 44, font.privateData ? font.privateData.length : 0);
	data.set(directoryData, WOFF2_HEADER_LENGTH);
	data.set(compressed, WOFF2_HEADER_LENGTH + directoryData.length);
	if (font.metadata) {
		data.set(font.metadata, metaOffset);
	}
	if (font.privateData) {
		data.set(font.privateData, privateOffset);
	}
	return data;
}

async function inflate(data, originalLength) {
	const inflated = await transform(data, new DecompressionStream("deflate"));
	if (inflated.length != originalLength) {
		throw new Error("Invalid WOFF table length");
	}
	return inflated;
}

function deflate(data) {
	return transform(data, new CompressionStream("deflate"));
}

async function transform(data, stream) {
	return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer());
}

function checksum(data) {
	let sum = 0;
	const paddedLength = align(data.length);
	for (let offset = 0; offset < paddedLength; offset += 4) {
		let value = 0;
		for (let indexByte = 0; indexByte < 4; indexByte++) {
			value = (value << 8) | (offset + indexByte < data.length ? data[offset + indexByte] : 0);
		}
		sum = (sum + (value >>> 0)) >>> 0;
	}
	return sum;
}

function align(length) {
	return (length + 3) & ~3;
}

function readTag(data, offset) {
	return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
}

function writeTag(data, offset, tag) {
	for (let indexCharacter = 0; indexCharacter < 4; indexCharacter++) {
		data[offset + indexCharacter] = tag.charCodeAt(indexCharacter);
	}
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

function writeInt16(data, offset, value) {
	writeUint16(data, offset, value & 0xFFFF);
}

function writeUint32(data, offset, value) {
	data[offset] = (value >>> 24) & 0xFF;
	data[offset + 1] = (value >>> 16) & 0xFF;
	data[offset + 2] = (value >>> 8) & 0xFF;
	data[offset + 3] = value & 0xFF;
}
