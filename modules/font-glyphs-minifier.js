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
const SFNT_HEADER_LENGTH = 12;
const SFNT_ENTRY_LENGTH = 16;
const WOFF_HEADER_LENGTH = 44;
const WOFF_ENTRY_LENGTH = 20;
const CHECKSUM_ADJUSTMENT_MAGIC = 0xB1B0AFBA;
const HEAD_CHECKSUM_OFFSET = 8;
const HEAD_LOCA_FORMAT_OFFSET = 50;
const MAXP_GLYPHS_OFFSET = 4;
const FSTYPE_OFFSET = 8;
const FSTYPE_NO_SUBSETTING = 0x0100;
const LONG_LOCA_FORMAT = 1;
const NOTDEF_GLYPH_ID = 0;
const COMPOSITE_ARG_1_AND_2_ARE_WORDS = 0x0001;
const COMPOSITE_WE_HAVE_A_SCALE = 0x0008;
const COMPOSITE_MORE_COMPONENTS = 0x0020;
const COMPOSITE_WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const COMPOSITE_WE_HAVE_A_TWO_BY_TWO = 0x0080;
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
const UNSUPPORTED_TABLES = ["CFF ", "CFF2", "gvar", "fvar", "COLR", "CBDT", "sbix", "SVG ", "morx", "mort"];
const DROPPED_TABLES = ["DSIG"];
const TAG_CMAP = "cmap";
const TAG_GLYF = "glyf";
const TAG_LOCA = "loca";
const TAG_HEAD = "head";
const TAG_MAXP = "maxp";
const TAG_HMTX = "hmtx";
const TAG_OS2 = "OS/2";
const TAG_GSUB = "GSUB";
const REQUIRED_TABLES = [TAG_CMAP, TAG_GLYF, TAG_LOCA, TAG_HEAD, TAG_MAXP, TAG_HMTX];

export {
	process
};

async function process(content, charCodeRanges) {
	const data = new Uint8Array(content.buffer ? content : new Uint8Array(content));
	let font;
	try {
		font = await parseFont(data);
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
		charCodeRanges.forEach(([fromCharCode, toCharCode]) => {
			for (let charCode = fromCharCode; charCode <= toCharCode; charCode++) {
				const glyphId = cmap.mapping.get(charCode);
				if (glyphId !== undefined && glyphId < glyphCount) {
					keptCharCodes.set(charCode, glyphId);
				}
			}
		});
		const keptGlyphIds = new Set([NOTDEF_GLYPH_ID, ...keptCharCodes.values()]);
		cmap.variationGlyphIds.forEach((glyphId, charCode) => {
			if (keptCharCodes.has(charCode)) {
				keptGlyphIds.add(glyphId);
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
		tables.set(TAG_HEAD, head);
		DROPPED_TABLES.forEach(tag => tables.delete(tag));
		const sfnt = writeSfnt(font.flavor, tables);
		return font.woff ? await writeWoff(sfnt, font) : sfnt.data;
	} catch {
		return null;
	}
}

async function parseFont(data) {
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
	}
	return null;
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
				glyphIds.set((cmap[mappingOffset] << 16) | (cmap[mappingOffset + 1] << 8) | cmap[mappingOffset + 2], readUint16(cmap, mappingOffset + 3));
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

async function inflate(data, originalLength) {
	const inflated = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
	if (inflated.length != originalLength) {
		throw new Error("Invalid WOFF table length");
	}
	return inflated;
}

async function deflate(data) {
	return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
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
