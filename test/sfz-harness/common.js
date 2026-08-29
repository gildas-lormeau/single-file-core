import { process } from "../../processors/compression/compression.js";
import { configure, ZipWriter, BlobWriter, TextReader } from "../../vendor/zip/zip.js";

configure({ useWebWorkers: false });

const RealDate = Date;
const FIXED_TIME = 1755129600000;
const FIXED_DATE = new RealDate(FIXED_TIME);

const WORDS = ("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt " +
	"ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco").split(" ");

export {
	process,
	RealDate,
	FIXED_TIME,
	FIXED_DATE,
	mulberry32,
	generateContent,
	makePageData,
	makeOptions,
	runProcess,
	freezeDate,
	buildZip,
	blobBytes,
	sameBytes,
	firstDifference,
	scanDelimiters
};

function mulberry32(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6D2B79F5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function generateContent(seed, targetLength) {
	const rand = mulberry32(seed);
	const parts = ["seed " + seed];
	let length = 0;
	while (length < targetLength) {
		const token = rand() < 0.25 ?
			((rand() * 0x100000000) >>> 0).toString(36) :
			WORDS[(rand() * WORDS.length) | 0];
		parts.push(token);
		length += token.length + 1;
		if (!(parts.length % 16)) {
			parts.push("\n");
			length += 2;
		}
	}
	return parts.join(" ");
}

function makePageData(seed, targetLength) {
	return {
		title: "fixture " + seed,
		doctype: "<!DOCTYPE html>",
		content: "<html><body><p>" + generateContent(seed, targetLength) + "</p></body></html>",
		resources: {
			stylesheets: [{ name: "styles.css", extension: ".css", content: "body { font-family: serif; color: rgb(20, 20, 20) }" }],
			images: []
		}
	};
}

function makeOptions(overrides = {}) {
	return {
		selfExtractingArchive: true,
		extractDataFromPage: true,
		zipScript: "/* zip script stub */",
		url: "https://example.com/",
		...overrides
	};
}

async function runProcess(pageData, options, lastModDate = FIXED_DATE) {
	const blob = await process(pageData, options, lastModDate);
	return {
		bytes: await blobBytes(blob),
		fallbackTag: options.extractDataFromPageTags ? options.extractDataFromPageTags[0] : null,
		extractionDisabled: options.extractDataFromPage === false
	};
}

function freezeDate() {
	class FrozenDate extends RealDate {
		constructor(...args) {
			if (args.length) {
				super(...args);
			} else {
				super(FIXED_TIME);
			}
		}
		static now() {
			return FIXED_TIME;
		}
	}
	globalThis.Date = FrozenDate;
	return () => {
		globalThis.Date = RealDate;
	};
}

async function buildZip(content, { useCompressionStream, level }) {
	const writer = new ZipWriter(new BlobWriter("application/zip"), {
		useCompressionStream,
		level,
		lastModDate: FIXED_DATE
	});
	await writer.add("data.txt", new TextReader(content));
	return blobBytes(await writer.close());
}

async function blobBytes(blob) {
	return new Uint8Array(await blob.arrayBuffer());
}

function sameBytes(a, b) {
	if (a.length != b.length) {
		return false;
	}
	return firstDifference(a, b) == -1;
}

function firstDifference(a, b) {
	const length = Math.min(a.length, b.length);
	for (let index = 0; index < length; index++) {
		if (a[index] != b[index]) {
			return index;
		}
	}
	return a.length == b.length ? -1 : length;
}

function scanDelimiters(bytes) {
	const text = new TextDecoder("windows-1252").decode(bytes);
	const found = [];
	for (const [name, regExp] of [
		["comment open", /<!--/i],
		["comment close", /--!?>/i]
	]) {
		const match = text.match(regExp);
		if (match) {
			found.push({ name, index: match.index });
		}
	}
	return found;
}
