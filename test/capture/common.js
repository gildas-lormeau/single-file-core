import "./dom.js";

const { init, getPageData, helper } = await import("../../single-file.js");

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
	frameData,
	html,
	WIN_ID_ATTRIBUTE_NAME
};

async function capture(pageResources, options) {
	resources = pageResources instanceof Map ? pageResources : new Map(Object.entries(pageResources));
	const pageData = await getPageData({ ...EMPTY_DOC_DATA, ...options }, initOptions, null, null);
	return pageData.content;
}

function fetchResource(url) {
	const resource = resources.get(url);
	if (!resource) {
		return Promise.resolve(new Response("", { status: 404 }));
	}
	const contentType = resource.contentType || "text/html";
	return Promise.resolve(new Response(resource.body, {
		status: resource.status || 200,
		headers: { "content-type": contentType }
	}));
}

// A frame whose content was captured by the content script arrives as frame data keyed by the window
// id its element carries. Outside raw mode this is the only way a frame is ever filled.
function frameData(windowId, baseURI, content) {
	return { ...EMPTY_DOC_DATA, windowId, baseURI, content, scrollPosition: { x: 0, y: 0 } };
}

// deno-dom materializes a whole NodeList when children is read, and buildTrackIdMap walks the tree
// child by child, so a fixture with 100k siblings overflows the stack. Size a fixture with long text
// in few elements, never with many elements.
function html(body, head = "") {
	return "<!DOCTYPE html><html><head>" + head + "</head><body>" + body + "</body></html>";
}
