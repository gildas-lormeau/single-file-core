// The router picks the page a multi-page archive opens on. Nothing drove it until this file: the
// function is inlined into the archive as source text, so it only ever ran inside a saved page,
// and the suites around it checked what the packager WROTE rather than what a reader would see.
// That is how the table of contents shipped unreachable. It was stored, the route existed, and
// no link and no landing rule pointed at it, so --crawl-save-archive-toc looked like it did
// nothing at all.
//
// The rule this file pins: an archive that stores a table of contents opens on it, and one that
// does not opens on the first page. Two cases guard the edges of that rule. A route in the hash
// names a page explicitly and has to win over the landing rule, or every deep link into an
// archive would land on the table of contents instead. A hash that is NOT a route is a plain
// fragment, and the only page it can mean is the first one, which is where the archive used to
// land before the fragment was ever read.
import "./dom-stub.js";
import { makePageData, makeOptions, runProcess } from "./common.js";
import { createPagesArchive } from "../../processors/compression/compression-packager.js";
import { router } from "../../processors/compression/compression-router.js";
import * as zip from "../../vendor/zip/zip.js";

const ARCHIVE_URL = "https://example.com/archive.html";

let failed = false;

const pages = [
	await makePage(1, { url: "https://example.com/docs/intro.html", title: "Intro" }),
	await makePage(2, { url: "https://example.com/docs/api/reference.html", title: "Reference" })
];
const withTOC = await createPagesArchive(pages, packagerOptions({ tocPage: true }));
const withoutTOC = await createPagesArchive(pages, packagerOptions());

{
	const content = await open(withTOC);
	check("an archive holding a table of contents opens on it", content.includes("<h1>Table of contents</h1>"), true);
}

{
	const content = await open(withoutTOC);
	check("an archive holding no table of contents opens on the first page", content, "page at \"\"");
}

{
	const content = await open(withTOC, "#sfz/pages/2/");
	check("a route in the hash names the page to open", content, "page at \"pages/2/\"");
}

// a bare fragment is what a hand-written link into the saved page looks like. The router scrolls
// to it after rendering, and the table of contents is not the document it belongs to
{
	const content = await open(withTOC, "#introduction");
	check("a hash that is not a route opens the first page", content, "page at \"\"");
}

console.log(failed ? "\nsome checks FAILED" : "\nall checks passed");
Deno.exit(failed ? 1 : 0);

// the router reads its world out of globalThis and renders through the two functions it is given,
// so a stub of each is enough to see the page it chose. Only what the first render touches is
// stubbed here; navigation, scroll restoration and link marking read more of the DOM than this
async function open(bytes, hash = "") {
	let displayed;
	installEnvironment(hash);
	await router(new Blob([bytes]), {
		extract: (content, { pagePath }) => ({ docContent: "page at " + JSON.stringify(pagePath) }),
		display: (document, docContent) => displayed = docContent
	});
	return displayed;
}

function installEnvironment(hash) {
	// the router asks for web workers, which the archive serves from its own extension URL. There
	// is no such URL here, so the request is answered with the synchronous codec instead
	globalThis.zip = { ...zip, configure: options => zip.configure({ ...options, useWebWorkers: false }) };
	globalThis.document = {
		head: { appendChild() { } },
		styleSheets: [],
		createElement: () => ({ setAttribute() { }, remove() { } }),
		querySelectorAll: () => [],
		querySelector: () => null,
		getElementById: () => null
	};
	globalThis.history = {
		state: null,
		scrollRestoration: "auto",
		replaceState(state) {
			this.state = state;
		}
	};
	// Deno defines location as a getter that throws without --location, so it is replaced rather
	// than assigned
	Object.defineProperty(globalThis, "location", {
		value: { href: ARCHIVE_URL + hash, hash },
		configurable: true,
		writable: true
	});
}

async function makePage(seed, { url, title }) {
	const pageData = makePageData(seed, 2 * 1024);
	pageData.title = title;
	const { bytes } = await runProcess(pageData, makeOptions({ url }));
	return { url, title, getData: async () => bytes };
}

function packagerOptions(overrides = {}) {
	return {
		selfExtractingArchive: true,
		extractDataFromPage: true,
		zipScript: "/* zip script stub */",
		...overrides
	};
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
