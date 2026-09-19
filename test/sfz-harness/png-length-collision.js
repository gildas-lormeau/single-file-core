// §5.1: the tEXt "ZIP" chunk's length field is patched after the wrapper test, and a big-endian
// length can spell a three-byte close pattern in its low three bytes under a zero top byte: -->
// is 00 2D 2D 3E, a chunk of exactly 2,960,702 bytes, and the CDATA rung's ]]> is 00 5D 5D 3E.
// The pixel-data wrapper is open across the field, so an untested length closes it early. The
// writer re-tests the four bytes with their neighbours and, on a hit, pads the appended run by
// one byte, which moves the length off the pattern and cannot loop: 00 2D 2D 3F matches nothing.
//
// The lever is a stored image resource, one byte in the archive per byte of content, so the
// chunk length can be steered onto the pattern exactly. The two neighbours are the controls:
// one byte short and one byte over must both go out unpadded.
import "./dom-stub.js";
import { makePageData, makeOptions, runProcess, freezeDate } from "./common.js";

const TARGET = 0x002D2D3E;
const KEYWORD = "tEXtZIP\0";
const PNG_TAIL_LENGTH = 4 + 12;
const CRC32_TABLE = new Uint32Array(256).map((_, indexTable) => {
	let crc = indexTable;
	for (let indexBits = 0; indexBits < 8; indexBits++) {
		crc = crc & 1 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1;
	}
	return crc;
});

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

function crc32(bytes) {
	let crc = -1;
	for (const byte of bytes) {
		crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
	}
	return (crc ^ -1) >>> 0;
}

function embeddedImage() {
	const bytes = new Uint8Array(8 + 25 + 512 + 12);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	bytes.fill(0x41, 33, 33 + 512);
	return bytes;
}

async function build(imageLength) {
	const pageData = makePageData(30, 4 * 1024);
	pageData.resources.images = [{ name: "images/0.png", extension: ".png", content: new Uint8Array(imageLength).fill(0x21), url: "https://example.com/0.png" }];
	const { bytes } = await runProcess(pageData, makeOptions({ embeddedImage: embeddedImage() }));
	const text = new TextDecoder("windows-1252").decode(bytes);
	const keyword = text.indexOf(KEYWORD);
	const view = new DataView(bytes.buffer, bytes.byteOffset);
	const length = view.getUint32(keyword - 4);
	return {
		length,
		lengthField: Array.from(bytes.subarray(keyword - 4, keyword)).join(),
		padded: bytes[bytes.length - PNG_TAIL_LENGTH - 1] == 0x20,
		covers: keyword + 4 + length + PNG_TAIL_LENGTH == bytes.length,
		crcMatches: crc32(bytes.subarray(keyword, keyword + 4 + length)) == view.getUint32(keyword + 4 + length),
		closeTags: text.split("-->").length - 1
	};
}

// the chunk holds the image plus the prologue, the bootstrap, the 4 KB of page text and the ZIP
// framing, so start well below and let the measured shortfall steer; the payload's base64 length
// can move by a quantum of 4 between two sizes, which is what the extra passes absorb. The date
// is frozen because manifest.json carries the archive time and deflates to a length that moves
// with its digits, which would make the one-byte controls below measure the clock
const restoreDate = freezeDate();
let imageLength = TARGET - 64 * 1024;
let result = await build(imageLength);
let passes = 1;
while (!result.padded && result.length != TARGET && passes < 8) {
	imageLength += TARGET - result.length;
	result = await build(imageLength);
	passes++;
}
console.log(`INFO steered onto the pattern in ${passes} passes, image of ${imageLength} bytes`);

check("the length that spells --> is padded", result.padded, true);
check("the padded length is one past the pattern", result.length, TARGET + 1);
check("the length field no longer spells the close tag", result.lengthField == "0,45,45,62", false);
check("the declared length covers the file through the padding", result.covers, true);
check("the chunk CRC covers the padding", result.crcMatches, true);

const below = await build(imageLength - 1);
const above = await build(imageLength + 1);
check("one byte short: the length is left alone", below.padded, false);
check("one byte short: length", below.length, TARGET - 1);
check("one byte over: the length is left alone", above.padded, false);
check("one byte over: length", above.length, TARGET + 1);
check("the padded build closes as many wrappers as its neighbour", result.closeTags, below.closeTags);
restoreDate();

Deno.exit(failed ? 1 : 0);
