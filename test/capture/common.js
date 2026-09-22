import "./dom.js";

// the namespace rather than a destructured SingleFile: single-file.js declares it with `let` and
// assigns it inside init(), so only the live binding on the namespace is the class
const singleFile = await import("../../single-file.js");
const { init, getPageData, helper } = singleFile;

const WIN_ID_ATTRIBUTE_NAME = helper.WIN_ID_ATTRIBUTE_NAME;

// preProcessDoc fills these from the live document, and it only runs when a doc is passed. A capture
// driven from here passes none, so the arrays it would have produced have to be supplied empty:
// processWorklets and its neighbours read .length with no guard.
const EMPTY_DOC_DATA = {
	adoptedStyleSheets: [],
	canvases: [],
	fonts: [],
	images: [],
	posters: [],
	referrer: "",
	shadowRoots: [],
	stylesheets: [],
	usedFonts: [],
	usedFontsCharacters: [],
	videos: [],
	worklets: []
};

// init() builds the util instance once per process and returns early ever after, so the fetch cannot
// be swapped per capture. One dispatcher is installed here and capture() points it at the resources
// of the run in progress; captures are sequential, so nothing races.
let resources = new Map();

const initOptions = {
	fetch: fetchResource,
	frameFetch: fetchResource
};

init(initOptions);

export {
	capture,
	captureArchive,
	createProcessor,
	frameData,
	html,
	helper,
	WIN_ID_ATTRIBUTE_NAME
};

async function capture(pageResources, options) {
	resources = pageResources instanceof Map ? pageResources : new Map(Object.entries(pageResources));
	const pageData = await getPageData({ ...EMPTY_DOC_DATA, ...options }, initOptions, null, null);
	return pageData.content;
}

// The archive side of the helper split. core/processor-helper.js picks the helper from
// options.compressContent, so anything in core/lib/processor-helper.js is unreachable through
// capture() above, which always takes the inline one. Driving the class directly also stops one step
// short of single-file.js, which compresses pageData and then deletes pageData.resources — the very
// map these tests need to read. Returns the whole pageData: .content is the page, .resources holds
// the separate files the archive would carry.
async function captureArchive(pageResources, options) {
	resources = pageResources instanceof Map ? pageResources : new Map(Object.entries(pageResources));
	const processor = new singleFile.SingleFile(helper.normalizeOptions({ ...EMPTY_DOC_DATA, ...options, compressContent: true }));
	await processor.run();
	return processor.getPageData();
}

// capture() resolves to the saved page, which is all a suite needs until it wants to act on the
// capture while it runs. cancel() lives on the SingleFile instance, so a suite testing it drives the
// class the way captureArchive does and calls run() itself.
function createProcessor(pageResources, options) {
	resources = pageResources instanceof Map ? pageResources : new Map(Object.entries(pageResources));
	return new singleFile.SingleFile(helper.normalizeOptions({ ...EMPTY_DOC_DATA, ...options }));
}

// A data: URL carries its own bytes, and the fetch core is given in the field — the page's in the
// extension, the browser's in the CLI — resolves one without asking the network. The map here holds
// the pages and their files, never a data: URL, so those go to the real fetch rather than to a 404.
function fetchResource(url) {
	if (url.startsWith("data:")) {
		return globalThis.fetch(url);
	}
	const resource = resources.get(url);
	if (!resource) {
		return Promise.resolve(new Response("", { status: 404 }));
	}
	const contentType = resource.contentType || "text/html";
	const response = new Response(resource.body, {
		status: resource.status || 200,
		headers: { "content-type": contentType }
	});
	// Every other resource here answers in the same microtask, so a capture driven from this file has
	// no latency and nothing that races in the field races here. A resource declaring `delay` answers
	// late instead, which is the only way a suite can decide which of two frames finishes first.
	return resource.delay ? new Promise(resolve => setTimeout(() => resolve(response), resource.delay)) : Promise.resolve(response);
}

// A frame whose content was captured by the content script arrives as frame data keyed by the window
// id its element carries. Outside raw mode this is the only way a frame is ever filled.
function frameData(windowId, baseURI, content) {
	return { ...EMPTY_DOC_DATA, windowId, baseURI, content, scrollPosition: { x: 0, y: 0 } };
}

// buildTrackIdMap walks the tree child by child, so a fixture with 100k siblings overflows the
// stack. Size a fixture with long text in few elements, never with many elements.
function html(body, head = "") {
	return "<!DOCTYPE html><html><head>" + head + "</head><body>" + body + "</body></html>";
}
