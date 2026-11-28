// removeSavedDate ("do not include the saved date") promises a file that does not tell when it was
// saved. In a ZIP file the date was still written three times: on every entry as its modification
// date, in the extended timestamp field zip.js adds beside it, and as `archiveTime` in
// manifest.json. Two saves of the same page therefore never gave the same file, which is what
// SingleFile#1918 asks for.
//
// With the option, every entry is dated 1 January 1980, the first date the ZIP format can hold,
// no extended timestamp is written and the manifest has no `archiveTime`. The date is the LOCAL
// one: the format stores a local time, so a UTC date would be written differently from one time
// zone to another. The extended timestamp is a UTC time, which a local date cannot keep constant,
// and this is why it is left out rather than set.
//
// Each case saves the same page under two different clocks. The clocks are given, never waited
// for: the modification date is passed to process(), and the multi-page writer reads a frozen Date.
import "./dom-stub.js";
import { makePageData, makeOptions, runProcess, freezeDate, sameBytes, firstDifference } from "./common.js";
import { createPagesArchive } from "../../processors/compression/compression-packager.js";
import { ZipReader, BlobReader, TextWriter } from "../../vendor/zip/zip.js";

const SEED = 3;
const SIZE = 4 * 1024;
const FIRST_DATE = new Date("2021-03-04T05:06:08Z");
const SECOND_DATE = new Date("2024-07-08T09:10:12Z");
const PAGE_URL = "https://example.com/page.html";
const EXTENDED_TIMESTAMP_TYPE = 0x5455;
const FORMATS = [
	{ label: "a ZIP file", options: { selfExtractingArchive: false } },
	{ label: "a self-extracting file", options: {} },
	{ label: "a self-extracting file read by fetch", options: { extractDataFromPage: false } }
];

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

for (const { label, options } of FORMATS) {
	const first = await savePage(FIRST_DATE, { ...options, removeSavedDate: true });
	const second = await savePage(SECOND_DATE, { ...options, removeSavedDate: true });
	check(label + " is the same when saved at another date", sameBytes(first, second) || "first difference at " + firstDifference(first, second), true);
	const entries = await readEntries(first);
	check(label + ": every entry is dated 1 January 1980", entries.map(entry => formatDate(entry.lastModDate)).filter(date => date != "1980-1-1 0:0:0").join(), "");
	check(label + ": no entry has an extended timestamp", entries.filter(entry => entry.extraField && entry.extraField.has(EXTENDED_TIMESTAMP_TYPE)).length, 0);
	check(label + ": the manifest has no archiveTime", "archiveTime" in JSON.parse(await readText(entries, "manifest.json")), false);
	// the control: without the option the dates are written, and they make the two files differ
	const datedFirst = await savePage(FIRST_DATE, options);
	const datedSecond = await savePage(SECOND_DATE, options);
	check(label + " differs when saved at another date without the option", sameBytes(datedFirst, datedSecond), false);
	check(label + ": the manifest has an archiveTime without the option", "archiveTime" in JSON.parse(await readText(await readEntries(datedFirst), "manifest.json")), true);
}

// The multi-page writer adds entries of its own (the list of pages, the table of contents) and
// dates them with the current time: frozen here at one date, and read from the real clock for the
// second archive. The pages inside are the same bytes in both.
{
	const pageBytes = await savePage(FIRST_DATE, { removeSavedDate: true });
	const pages = [
		{ url: PAGE_URL, title: "First", getData: async () => pageBytes },
		{ url: "https://example.com/other.html", title: "Second", getData: async () => pageBytes }
	];
	const archiveOptions = { selfExtractingArchive: true, extractDataFromPage: true, zipScript: "/* zip script stub */", tocPage: true, pageList: true, insertSingleFileComment: true, removeSavedDate: true };
	const restoreDate = freezeDate();
	let first;
	try {
		first = await createPagesArchive(pages, { ...archiveOptions });
	} finally {
		restoreDate();
	}
	const second = await createPagesArchive(pages, { ...archiveOptions });
	check("an archive of several pages is the same when packed at another date", sameBytes(first, second) || "first difference at " + firstDifference(first, second), true);
	const entries = await readEntries(first);
	check("an archive of several pages: every entry is dated 1 January 1980", entries.map(entry => formatDate(entry.lastModDate)).filter(date => date != "1980-1-1 0:0:0").join(), "");
	const dated = await createPagesArchive(pages, { ...archiveOptions, removeSavedDate: false });
	check("an archive of several pages is dated without the option", (await readEntries(dated)).some(entry => entry.lastModDate.getFullYear() != 1980), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function savePage(lastModDate, options) {
	const { bytes } = await runProcess(makePageData(SEED, SIZE), makeOptions({ url: PAGE_URL, ...options }), lastModDate);
	return bytes;
}

async function readEntries(bytes) {
	const zipReader = new ZipReader(new BlobReader(new Blob([bytes])));
	const entries = await zipReader.getEntries();
	await zipReader.close();
	return entries;
}

function readText(entries, filename) {
	return entries.find(entry => entry.filename == filename).getData(new TextWriter());
}

function formatDate(date) {
	return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-") + " " + [date.getHours(), date.getMinutes(), date.getSeconds()].join(":");
}
