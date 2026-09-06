/*
 * Copyright 2010-2026 Gildas Lormeau
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
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 *   General Public License for more details.
 *
 *   As additional permission under GNU AGPL version 3 section 7, you may
 *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU
 *   AGPL normally required by section 4, provided you include this license
 *   notice and a URL through which recipients can access the Corresponding
 *   Source.
 */

// Universal mode recovers the ZIP region from the characters the HTML parser produced, so the
// declared charset has to carry all 256 byte values through a decode injectively (§2.1). Which
// encodings do is a property of the WHATWG index, not of this repository, and §8.4 prints the
// answer as a table: 20 qualify, 18 do not, and each qualifying one needs a reverse table of a
// stated size. Nothing re-derived that table -- it was measured once, by hand, outside the repo,
// and would go stale silently if an index changed or the prose were edited.
//
// The last check is the one with teeth. §5.5 requires the reverse table to be derived from the
// WHATWG index and NOT from a platform codec of the same name, because most platform codecs
// leave five windows-1252 positions undefined and those bytes occur in ordinary compressed data.
// The extractor ships that table as a literal, so it is derived once at authoring time and never
// again; here it is re-derived from the runtime's own decoder and compared entry by entry.

const BYTES = new Uint8Array(256).map((_, index) => index);

// the 20 of §8.4, in the order the section lists them
const QUALIFYING = [
	"windows-1252", "iso-8859-2", "iso-8859-4", "iso-8859-5", "iso-8859-10", "iso-8859-13",
	"iso-8859-14", "iso-8859-15", "iso-8859-16", "koi8-r", "koi8-u", "macintosh", "windows-1250",
	"windows-1251", "windows-1254", "windows-1256", "windows-1258", "x-mac-cyrillic", "ibm866",
	"x-user-defined"
];
// the 18 that do not: eight single-byte encodings with undefined positions in their index, then
// the multi-byte ones, which decode a lone byte sequence to U+FFFD or to fewer than 256 characters
const DISQUALIFIED = [
	"iso-8859-3", "iso-8859-6", "iso-8859-7", "iso-8859-8", "windows-874", "windows-1253",
	"windows-1255", "windows-1257",
	"utf-8", "utf-16le", "utf-16be", "gbk", "gb18030", "big5", "euc-jp", "shift_jis", "euc-kr",
	"iso-2022-jp"
];

let failures = 0;

function describe(label) {
	const points = Array.from(new TextDecoder(label).decode(BYTES));
	if (points.length != 256) {
		return { qualifies: false, reason: points.length + " characters" };
	}
	const table = new Map();
	const seen = new Set();
	let identity = 0;
	for (let byte = 0; byte < 256; byte++) {
		const codePoint = points[byte].codePointAt(0);
		if (codePoint == 0xFFFD) {
			return { qualifies: false, reason: "U+FFFD at 0x" + byte.toString(16) };
		}
		if (seen.has(codePoint)) {
			return { qualifies: false, reason: "collision at 0x" + byte.toString(16) };
		}
		seen.add(codePoint);
		if (codePoint == byte) {
			identity++;
		} else {
			table.set(codePoint, byte);
		}
	}
	return { qualifies: true, identity, table, points };
}

const described = new Map([...QUALIFYING, ...DISQUALIFIED].map(label => [label, describe(label)]));

check("§8.4 covers the whole standard: 20 qualifying + 18 disqualified",
	QUALIFYING.length + DISQUALIFIED.length == 38 && new Set([...QUALIFYING, ...DISQUALIFIED]).size == 38);

const wrongVerdict = [...described].filter(([label, result]) =>
	result.qualifies != QUALIFYING.includes(label));
check("every encoding falls on the side of the table §8.4 puts it on", wrongVerdict.length == 0,
	wrongVerdict.map(([label, result]) => label + " " + (result.reason || "qualifies")).join(", "));

// §8.4 quotes the extremes of the reverse-table sizes; they bound what an implementation has to
// carry to support any qualifying charset rather than only the one the reference writer declares
const qualifying = QUALIFYING.filter(label => described.get(label).qualifies);
const sizes = qualifying.map(label => [label, described.get(label).table.size]);
const smallest = Math.min(...sizes.map(([, size]) => size));
const largest = Math.max(...sizes.map(([, size]) => size));
check("the smallest reverse table is 8 entries, iso-8859-15", smallest == 8 &&
	sizes.filter(([, size]) => size == smallest).map(([label]) => label).join() == "iso-8859-15");
check("the largest is 128, for koi8-r, koi8-u, ibm866 and x-user-defined", largest == 128 &&
	sizes.filter(([, size]) => size == largest).map(([label]) => label).sort().join() ==
	"ibm866,koi8-r,koi8-u,x-user-defined");

const windows1252 = described.get("windows-1252");
check("windows-1252 decodes 229 of the 256 values to themselves (§5.5 rule 1)",
	windows1252.identity == 229, String(windows1252.identity));
check("its reverse table is the remaining 27 (§5.5 rule 2)", windows1252.table.size == 27,
	String(windows1252.table.size));

// the trap of §5.5: iso-8859-1 is a LABEL of windows-1252, not the identity mapping its name
// suggests, so a reader that treats it as latin-1 builds a table with no entries at all
check("iso-8859-1 is a label of windows-1252, not a separate identity encoding",
	new TextDecoder("iso-8859-1").encoding == "windows-1252" &&
	new TextDecoder("latin1").encoding == "windows-1252");

// the five positions of the §5.5 table: the WHATWG index assigns them, most platform codecs do not
check("the WHATWG index assigns 0x81, 0x8D, 0x8F, 0x90 and 0x9D (§5.5)",
	[0x81, 0x8D, 0x8F, 0x90, 0x9D].every(byte =>
		windows1252.points[byte].codePointAt(0) == byte && !windows1252.table.has(byte)));

// §8.4's caveat on x-user-defined: it qualifies on the criterion and is still a poor choice
check("x-user-defined maps 0x80-0xFF into the Private Use Area, U+F780-U+F7FF",
	[...Array(128).keys()].every(index =>
		described.get("x-user-defined").points[128 + index].codePointAt(0) == 0xF780 + index));

// the round trip of §5.5 rules 1 and 2, on every byte value and every qualifying charset. NUL and
// the newlines need rules 3 and 4 in a browser, where the parser has replaced and normalized them;
// through a decoder alone they arrive intact, so the mapping is exact for all 256 values here
const broken = qualifying.filter(label => {
	const { table, points } = described.get(label);
	return points.some((character, byte) => {
		const codePoint = character.codePointAt(0);
		return (table.has(codePoint) ? table.get(codePoint) : codePoint) != byte;
	});
});
check("all 256 byte values survive decode and reverse mapping, under every qualifying charset",
	broken.length == 0, broken.join(", "));

// the extractor's own table, re-derived. It is inlined into every archive, so an error here is
// not caught by any build step and corrupts one byte per occurrence in the recovered region
const compression = await Deno.readTextFile(new URL("../../processors/compression/compression.js", import.meta.url));
const literal = compression.slice(compression.indexOf("const characterMap = new Map(["));
const shipped = new Map([...literal.slice(0, literal.indexOf("]);")).matchAll(/\[(\d+),\s*(\d+)\]/g)]
	.map(([, codePoint, byte]) => [Number(codePoint), Number(byte)]));
const expected = new Map([[0xFFFD, 0], ...windows1252.table]);
const wrongEntries = [...expected].filter(([codePoint, byte]) => shipped.get(codePoint) !== byte);
const extraEntries = [...shipped].filter(([codePoint]) => !expected.has(codePoint));
check("the extractor's characterMap is the derived windows-1252 table plus U+FFFD (28 entries)",
	shipped.size == 28 && wrongEntries.length == 0 && extraEntries.length == 0,
	"missing/wrong " + JSON.stringify(wrongEntries) + " extra " + JSON.stringify(extraEntries));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
Deno.exit(failures ? 1 : 0);

function check(label, condition, detail) {
	if (!condition) {
		failures++;
	}
	console.log((condition ? "PASS" : "FAIL") + " " + label + (condition || !detail ? "" : ": " + detail));
}
