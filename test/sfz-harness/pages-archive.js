// createPagesArchive packs several single-page archives into one. Nothing exercised it until this
// file: the module was reachable only through a crawl, so a change to the folder layout, the
// manifest, the deduplication or the table of contents broke nothing that anyone ran.
//
// Three of its rules are worth stating, because they look arbitrary in the code:
//
//   - the first page is stored at the ROOT and the others under pages/N/. The root page is what a
//     reader opens, so it cannot be moved into a folder without changing every relative URL the
//     capture already resolved.
//   - a duplicate entry becomes a SYMLINK rather than being dropped. The router resolves it from
//     the alias map in the manifest and never reads it, but a plain unzip has to produce complete
//     page folders, and only a symlink gives both.
//   - the titles written into the table of contents are CRAWLED, so they are attacker-controlled
//     text going into an href attribute and into element content. Both escapers are checked here.
import "./dom-stub.js";
import { makePageData, makeOptions, runProcess, freezeDate } from "./common.js";
import { createPagesArchive } from "../../processors/compression/compression-packager.js";
import { ZipReader, ZipWriter, BlobReader, TextReader, TextWriter, Uint8ArrayWriter } from "../../vendor/zip/zip.js";

// a title as it comes back from a crawl: the quote closes the href it is written into, the angle
// bracket opens an element, and the ampersand is what a naive escaper double-encodes
const HOSTILE_TITLE = "Intro & \"start\" <b>";
const SYMLINK_UNIX_MODE = 0o120777;
const SOURCE_DATE = new Date("2021-03-04T05:06:08Z");

let failed = false;

const pages = [
	await makePage(1, { url: "https://example.com/docs/intro.html", title: HOSTILE_TITLE, originalUrls: ["https://example.com/docs/"] }),
	await makePage(2, { url: "https://example.com/docs/api/reference.html", title: "Reference" })
];

{
	const entries = await readArchive(await createPagesArchive(pages, packagerOptions()));
	const manifest = JSON.parse(await readEntry(entries, "sfz-pages.json"));
	check("the first page is stored at the root of the archive", entries.has("index.html"), true);
	check("a later page is stored in a folder of its own", entries.has("pages/2/index.html"), true);
	check("the manifest names the path of every page",
		manifest.pages.map(page => page.path).join(" "), " pages/2/");
	check("the manifest names the url of every page",
		manifest.pages.map(page => page.url).join(" "), "https://example.com/docs/intro.html https://example.com/docs/api/reference.html");
	check("the manifest keeps the title a page was saved with", manifest.pages[0].title, HOSTILE_TITLE);
	// a page reached through several urls has to answer to all of them, or a link to the url the
	// crawler did not settle on leaves the archive
	check("the manifest keeps the urls a page was reached by",
		(manifest.pages[0].originalUrls || []).join(" "), "https://example.com/docs/");
}

// the router reads these two out of the manifest, and "auto" is the absence of a choice rather
// than a value: writing it would pin the default of the day into every archive
{
	const entries = await readArchive(await createPagesArchive(pages, packagerOptions({ markUnarchivedLinks: true, pageTransitions: "slide" })));
	const manifest = JSON.parse(await readEntry(entries, "sfz-pages.json"));
	check("the manifest records that unarchived links are marked", manifest.markUnarchivedLinks, true);
	check("the manifest records the page transition it was given", manifest.pageTransitions, "slide");
}

{
	const entries = await readArchive(await createPagesArchive(pages, packagerOptions({ pageTransitions: "auto" })));
	const manifest = JSON.parse(await readEntry(entries, "sfz-pages.json"));
	check("the default page transition is not written to the manifest", "pageTransitions" in manifest, false);
}

// Both fixtures declare the same stylesheet, so pages/2/styles.css is byte-for-byte the entry
// already written at the root.
{
	const entries = await readArchive(await createPagesArchive(pages, packagerOptions({ dedupPages: true })));
	const manifest = JSON.parse(await readEntry(entries, "sfz-pages.json"));
	const duplicate = entries.get("pages/2/styles.css");
	check("a repeated entry is still present after deduplication", Boolean(duplicate), true);
	check("the repeated entry points at the one that was kept",
		await readEntry(entries, "pages/2/styles.css"), "../../styles.css");
	// without the mode, tar and unzip write the path as the FILE CONTENT and the page folder ends
	// up holding a text file where a stylesheet belongs
	check("the repeated entry carries the unix symlink mode",
		duplicate.externalFileAttributes >>> 16, SYMLINK_UNIX_MODE);
	// read through a default, so that a manifest with no aliases at all reports as a failed check
	// rather than throwing and taking every check after it down with it
	check("the manifest maps the repeated entry to the one it aliases",
		(manifest.aliases || {})["pages/2/styles.css"], "styles.css");
	check("an entry that is not repeated is left alone",
		"pages/2/index.html" in (manifest.aliases || {}), false);
}

{
	const entries = await readArchive(await createPagesArchive(pages, packagerOptions()));
	const manifest = JSON.parse(await readEntry(entries, "sfz-pages.json"));
	check("nothing is aliased when deduplication is off", "aliases" in manifest, false);
	check("a repeated entry is stored whole when deduplication is off",
		(await readEntry(entries, "pages/2/styles.css")).includes("font-family"), true);
}

// Every entry is copied with passThrough, i.e. its stored bytes are written back without being
// decompressed, so everything that DESCRIBES those bytes has to travel with them. Forwarding a
// subset does not make a partial copy, it makes a corrupt one: the writer cannot tell that a
// compression method it did not choose describes data it is about to store verbatim.
//
// The pages the rest of this file uses cannot show that, because they are written by the same
// writer with the same defaults as the archive they are copied into, so every value the copy
// drops is replaced by the one it had. This page carries values the packager's own defaults do
// not produce. It is the first page, so it is copied to the root under its own names.
{
	const metadataPages = [await makeMetadataPage(), pages[1]];
	const sourceEntries = await readArchive(await metadataPages[0].getData());
	const entries = await readArchive(await createPagesArchive(metadataPages, packagerOptions()));
	const copied = [...sourceEntries.keys()].filter(filename => entries.has(filename));
	check("every entry of the first page is copied", copied.length, sourceEntries.size);
	for (const property of ["comment", "compressionMethod", "uncompressedSize", "crc32", "filenameUTF8", "externalFileAttributes", "versionMadeBy", "internalFileAttributes", "uid", "gid", "directory"]) {
		check("a copied entry keeps its " + property,
			copied.every(filename => entries.get(filename)[property] === sourceEntries.get(filename)[property]), true);
	}
	for (const property of ["lastModDate", "creationDate", "lastAccessDate"]) {
		check("a copied entry keeps its " + property,
			copied.every(filename => dateOf(entries.get(filename)[property]) === dateOf(sourceEntries.get(filename)[property])), true);
	}
	// the level bits say how hard the deflater tried, and a copy that drops them reports the
	// packager's default instead of the level the entry was actually written at
	check("a copied entry keeps the deflate level it was written at",
		copied.every(filename => entries.get(filename).bitFlag.level === sourceEntries.get(filename).bitFlag.level), true);
	// zip.js rebuilds the fields it interprets itself, so what has to survive is the rest
	check("a copied entry keeps an extra field zip.js does not interpret",
		extraFieldOf(entries.get("styles.css")), extraFieldOf(sourceEntries.get("styles.css")));
	const sameBytes = await Promise.all(copied.map(async filename => equalData(
		await readRawData(entries.get(filename)),
		await readRawData(sourceEntries.get(filename)))));
	check("a copied entry holds the bytes it was read from", sameBytes.every(Boolean), true);
}

{
	const entries = await readArchive(await createPagesArchive(pages, packagerOptions({ tocPage: true })));
	const toc = await readEntry(entries, "sfz-toc.html");
	check("the table of contents page is stored when it is asked for", entries.has("sfz-toc.html"), true);
	check("the table of contents links to the page at the root", toc.includes("href=\"index.html\""), true);
	check("the table of contents links to the page in its folder", toc.includes("href=\"pages/2/index.html\""), true);
	// the escaped form has to be there AND the raw form has to be absent: a title written twice,
	// once escaped and once not, passes any check that only looks for the escaped one
	check("a crawled title is escaped into the table of contents",
		toc.includes("Intro &amp; &quot;start&quot; &lt;b&gt;"), true);
	check("a crawled title is not also written raw", toc.includes(HOSTILE_TITLE), false);
	// the groups are details/summary and nothing else on purpose: the page has to stay usable
	// after a plain unzip, where no script runs
	check("pages are grouped by the segments of their path",
		toc.includes("<details open><summary>docs</summary>"), true);
	check("the table of contents needs no script", toc.includes("<script"), false);
}

{
	const entries = await readArchive(await createPagesArchive(pages, packagerOptions()));
	check("no table of contents page is stored when it is not asked for", entries.has("sfz-toc.html"), false);
}

// one origin is the whole archive's origin and adding it to every path would say nothing; two
// origins make it the first thing that tells two pages apart
{
	const mixedPages = [pages[0], await makePage(3, { url: "https://other.example.org/notes.html", title: "Notes" })];
	const entries = await readArchive(await createPagesArchive(mixedPages, packagerOptions({ tocPage: true })));
	const toc = await readEntry(entries, "sfz-toc.html");
	check("pages from several origins are grouped by origin",
		toc.includes("<summary>https://example.com</summary>"), true);
}

// the prelude list is read without decompressing anything, by tools that never extract the
// archive, so it is the only place the pages are named in plain text
{
	const bytes = await createPagesArchive(pages, packagerOptions({ pageList: true }));
	const prelude = new TextDecoder("windows-1252").decode(bytes);
	check("the prelude lists the pages when the page list is asked for",
		prelude.includes("<a href=\"https://example.com/docs/api/reference.html\">Reference</a>"), true);
	// anchored on the link, not on the escaped text alone: the same title is also written into the
	// wrapper's own <title>, which the writer escapes the same way, so a search for the escaped
	// form anywhere in the archive passes even when the page list itself is written raw
	check("the prelude escapes a crawled title too",
		prelude.includes("<a href=\"https://example.com/docs/intro.html\">Intro &#38; &#34;start&#34; &#60;b&#62;</a>"), true);
	check("the prelude is not written when the page list is not asked for",
		new TextDecoder("windows-1252").decode(await createPagesArchive(pages, packagerOptions())).includes("<nav><ul>"), false);
}

// the options handed to the archive writer are DERIVED from PROCESS_OPTION_NAMES, not hand-listed.
// The hand copy carried eleven names and silently dropped maxAppendedDataLength, so
// --max-appended-data-length did nothing on any multi-page save and nothing failed for months.
// A one-byte budget has to reach the writer, where it is indistinguishable from refusing to append
{
	const unfreeze = freezeDate();
	try {
		const budgeted = await createPagesArchive(pages, packagerOptions({ maxAppendedDataLength: 1 }));
		const prevented = await createPagesArchive(pages, packagerOptions({ preventAppendedData: true }));
		const unbudgeted = await createPagesArchive(pages, packagerOptions());
		check("a one-byte appended-data budget reaches the archive writer", equalData(budgeted, prevented), true);
		check("and appending is what the writer does without one", equalData(unbudgeted, prevented), false);
	} finally {
		unfreeze();
	}
}

// `password` is the one name the derivation must NOT forward. An encrypted multi-page archive
// cannot be written yet, and forwarding the password would half-ship it: the writer would start
// withholding the prologue's title as if the archive were encrypted, while the table of contents
// and every entry comment — each one a resource URL — kept riding in that same cleartext prologue
{
	const prologue = new TextDecoder("windows-1252").decode(await createPagesArchive(pages, packagerOptions({ password: "secret" })));
	check("a password is not forwarded to the archive writer",
		prologue.includes("<title>Intro &#38; &#34;start&#34; &#60;b&#62;</title>"), true);
}

console.log(failed ? "\nsome checks FAILED" : "\nall checks passed");
Deno.exit(failed ? 1 : 0);

// each page of a multi-page archive is a single-page archive, so the fixtures are built by the
// writer the rest of the harness already covers
async function makePage(seed, { url, title, originalUrls }) {
	const pageData = makePageData(seed, 2 * 1024);
	pageData.title = title;
	const { bytes } = await runProcess(pageData, makeOptions({ url }));
	return { url, title, originalUrls, getData: async () => bytes };
}

// a page archive holding, on purpose, nothing the packager's own writer would produce by default:
// a directory record, a name that needs the language encoding flag, a stored entry beside one
// deflated at the highest level, unix ownership, an extra field zip.js does not interpret, and
// dates outside the one the packager pins on its writer
async function makeMetadataPage() {
	const zipWriter = new ZipWriter(new Uint8ArrayWriter(), { lastModDate: SOURCE_DATE });
	await zipWriter.add("folder/", null, { directory: true, comment: "a folder" });
	await zipWriter.add("styles.css", new TextReader("body{font-family:serif}"), {
		level: 9,
		comment: "https://example.com/café.css",
		creationDate: SOURCE_DATE,
		lastAccessDate: SOURCE_DATE,
		internalFileAttributes: 1,
		msDosCompatible: false,
		unixMode: 0o100755,
		uid: 501,
		gid: 20,
		extraField: new Map([[0x7777, new Uint8Array([1, 2, 3, 4])]])
	});
	await zipWriter.add("café.txt", new TextReader("un café"), { level: 0 });
	const bytes = await zipWriter.close();
	return { url: "https://example.com/metadata.html", title: "Metadata", getData: async () => bytes };
}

function dateOf(value) {
	return value === undefined ? undefined : value.getTime();
}

function extraFieldOf(entry) {
	const value = entry.extraField && entry.extraField.get(0x7777);
	return value ? value.data.join(",") : undefined;
}

function packagerOptions(overrides = {}) {
	return {
		selfExtractingArchive: true,
		extractDataFromPage: true,
		zipScript: "/* zip script stub */",
		...overrides
	};
}

async function readArchive(bytes) {
	const zipReader = new ZipReader(new BlobReader(new Blob([bytes])));
	const entries = await zipReader.getEntries();
	await zipReader.close();
	return new Map(entries.map(entry => [entry.filename, entry]));
}

function readEntry(entries, filename) {
	return entries.get(filename).getData(new TextWriter());
}

function readRawData(entry) {
	return entry.getData(new Uint8ArrayWriter(), { passThrough: true, checkCrc32: false });
}

function equalData(dataLeft, dataRight) {
	return dataLeft.length == dataRight.length && dataLeft.every((value, index) => value == dataRight[index]);
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
