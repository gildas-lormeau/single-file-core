import "./dom.js";

// core/util.js captures globalThis.DOMParser when it loads, and deno-dom throws on "text/xml", so
// the MAFF metadata could not be parsed here at all. This substitutes a stub for that one mime type,
// installed before common.js imports core, the same ordering constraint dom.js itself documents.
//
// What the stub stands for and what it does not. The two defects fixed alongside this suite are both
// about what core does with what the parser HANDS BACK — an attribute that came back null, and which
// of two almost-identical option fields gets written out — so a stub returning null or a string
// covers them faithfully. It does NOT cover the parse: that `RDF > Description > originalurl` matches
// `<RDF:RDF><RDF:Description><MAF:originalurl>` by local name, and that getAttributeNS resolves the
// RDF prefix, are properties of a real XML DOM that only a browser suite can confirm.
const XML_DOCUMENTS = new Map();
const NativeDOMParser = globalThis.DOMParser;

class StubXMLDocument {
	constructor(values) {
		this.values = values;
	}
	// undefined means the element is absent, null means it is present with no RDF:resource attribute
	querySelector(selector) {
		const localName = selector.split(">").pop().trim();
		const value = this.values[localName];
		return value === undefined ? null : { getAttributeNS: () => value };
	}
}

globalThis.DOMParser = class {
	parseFromString(content, mimeType) {
		if (mimeType == "text/xml") {
			return new StubXMLDocument(XML_DOCUMENTS.get(content) || {});
		}
		return new NativeDOMParser().parseFromString(content, mimeType);
	}
};

const { capture, frameData, html, WIN_ID_ATTRIBUTE_NAME } = await import("./common.js");

const PAGE_URL = "https://example.com/page.html";
const RDF_URL = "https://example.com/index.rdf";
const FRAME_URL = "https://example.com/frame-dir/frame.html";
const FRAME_RDF_URL = "https://example.com/frame-dir/index.rdf";
const ORIGINAL_URL = "https://original.example/real.html";
const ARCHIVE_TIME = "Mon, 01 Jan 2024 10:20:30 GMT";
const ARCHIVE_TIME_MS = new Date(ARCHIVE_TIME).getTime();
const COMPLETE = { originalurl: ORIGINAL_URL, archivetime: ARCHIVE_TIME };
const PAGE = html("<h1>page</h1>");
const FRAME_PAGE = html("<h1>frame</h1>");
const HOST_PAGE = html("<h1>host</h1><iframe src=\"" + FRAME_URL + "\" " + WIN_ID_ATTRIBUTE_NAME + "=\"0.1\"></iframe>");

// The canonical link would be the obvious place to read the recovered url, but deno-dom reflects
// neither the href nor the type property, so core's `element.href = ...` leaves no attribute behind.
// Two observables survive that: the SingleFile comment, which core builds from options.saveUrl, and
// the embedded options block, which is where the second defect lives.
const OPTIONS_BLOCK = /<script data-single-file-options[^>]*>([^<]*)<\/script>/;

let fixtureIndex = 0;

function rdf(values) {
	const content = "<?xml version=\"1.0\"?><!-- fixture " + (fixtureIndex++) + " -->";
	XML_DOCUMENTS.set(content, values);
	return content;
}

class CountingResources extends Map {
	constructor(entries) {
		super(entries);
		this.counts = new Map();
	}
	get(key) {
		this.counts.set(key, (this.counts.get(key) || 0) + 1);
		return super.get(key);
	}
	countOf(key) {
		return this.counts.get(key) || 0;
	}
}

function resources(rdfContent) {
	const entries = [
		[PAGE_URL, { body: PAGE }],
		[FRAME_URL, { body: FRAME_PAGE }]
	];
	if (rdfContent !== undefined) {
		entries.push([RDF_URL, { body: rdfContent, contentType: "text/xml" }]);
	}
	return new CountingResources(entries);
}

function commentURL(content) {
	const match = content.match(/ url: ([^\n]*)/);
	return match && match[1].trim();
}

function embeddedOptions(content) {
	const match = content.match(OPTIONS_BLOCK);
	return match && JSON.parse(match[1]);
}

let failed = false;

// readMaffMetadata is the new name of enableMaff, which was implemented in core and set by nothing:
// no CLI flag, no config key, no UI anywhere. That is what made renaming it free, and exposing it is
// what made the two defects below reachable by a user.
{
	const map = resources(rdf(COMPLETE));
	const content = await capture(map, { url: PAGE_URL, content: PAGE, insertSingleFileComment: true });
	check("index.rdf is not requested when the option is off", map.countOf(RDF_URL), 0);
	check("the page url is saved when the option is off", commentURL(content), PAGE_URL);
}

{
	const map = resources(rdf(COMPLETE));
	const content = await capture(map, { url: PAGE_URL, content: PAGE, readMaffMetadata: true, insertSingleFileComment: true });
	check("index.rdf is requested when the option is on", map.countOf(RDF_URL), 1);
	check("the original url is recovered", commentURL(content), ORIGINAL_URL);
}

// THE CRASH. An originalurl with no RDF:resource made getAttributeNS return null, saveUrl became
// null, and the canonical link then called .match() on it and failed the whole capture with a
// TypeError. The archivetime branch beside it had always guarded its own value, so the two halves of
// one method disagreed with each other.
{
	let threw = false;
	let content = "";
	try {
		content = await capture(resources(rdf({ originalurl: null, archivetime: ARCHIVE_TIME })), {
			url: PAGE_URL,
			content: PAGE,
			readMaffMetadata: true,
			insertSingleFileComment: true
		});
	} catch {
		threw = true;
	}
	check("an originalurl with no resource attribute does not fail the capture", threw, false);
	check("and the page url is kept", commentURL(content), PAGE_URL);
}

{
	const content = await capture(resources(rdf({ originalurl: ORIGINAL_URL, archivetime: null })), {
		url: PAGE_URL,
		content: PAGE,
		readMaffMetadata: true,
		insertSingleFileComment: true
	});
	check("an archivetime with no resource attribute is tolerated", commentURL(content), ORIGINAL_URL);
}

{
	const content = await capture(resources(), { url: PAGE_URL, content: PAGE, readMaffMetadata: true, insertSingleFileComment: true });
	check("a missing index.rdf leaves the page url in place", commentURL(content), PAGE_URL);
}

// THE INCONSISTENCY. saveFilenameTemplateData wrote saveUrl from options.url, one line above writing
// saveDate from the value MAFF had just recovered, so the embedded block paired the archive's date
// with the extracted copy's path, and a recompute in the editor resolved {url-*} against the wrong
// one. options.saveUrl and options.url are identical on every other code path, which is what let it
// sit unnoticed.
{
	const content = await capture(resources(rdf(COMPLETE)), {
		url: PAGE_URL,
		content: PAGE,
		readMaffMetadata: true,
		saveFilenameTemplateData: true
	});
	const embedded = embeddedOptions(content);
	check("the embedded options block exists", Boolean(embedded), true);
	if (embedded) {
		check("the embedded saveUrl is the recovered one", embedded.saveUrl, ORIGINAL_URL);
		check("the embedded saveDate is the recovered one", embedded.saveDate, ARCHIVE_TIME_MS);
	}
}

{
	const content = await capture(resources(rdf(COMPLETE)), { url: PAGE_URL, content: PAGE, saveFilenameTemplateData: true });
	const embedded = embeddedOptions(content);
	check("the embedded saveUrl is the page url when the option is off", embedded && embedded.saveUrl, PAGE_URL);
}

// Only the root document reaches Processor.initialize, because Runner.run guards that call with
// `if (this.root)`. That guard is the whole reason a page with twenty frames does not make twenty
// pointless index.rdf requests, and nothing else pins it. Note initializeProcessor resets a list of
// root-only options for frames and readMaffMetadata is deliberately NOT in it: next to this guard
// such a reset is dead code, which is exactly what adding one and watching nothing change proved.
{
	const map = resources(rdf(COMPLETE));
	const frames = [frameData("0.1", FRAME_URL, FRAME_PAGE)];
	const content = await capture(map, { url: PAGE_URL, content: HOST_PAGE, frames, readMaffMetadata: true });
	check("the root asks for its index.rdf", map.countOf(RDF_URL), 1);
	check("a frame does not ask for one of its own", map.countOf(FRAME_RDF_URL), 0);
	check("the frame is still captured", content.includes("frame"), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
