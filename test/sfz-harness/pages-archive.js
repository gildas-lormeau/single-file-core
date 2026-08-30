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
import { makePageData, makeOptions, runProcess } from "./common.js";
import { createPagesArchive } from "../../processors/compression/compression-packager.js";
import { ZipReader, BlobReader, TextWriter } from "../../vendor/zip/zip.js";

// a title as it comes back from a crawl: the quote closes the href it is written into, the angle
// bracket opens an element, and the ampersand is what a naive escaper double-encodes
const HOSTILE_TITLE = "Intro & \"start\" <b>";
const SYMLINK_UNIX_MODE = 0o120777;

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

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
