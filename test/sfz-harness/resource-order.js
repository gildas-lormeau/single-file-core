// Two captures of an unchanged page produced archives with the same entries in a different order, so
// an SFZ could never be hashed to answer "did this page change". The names were never the problem:
// indexResource is assigned synchronously in BatchRequest.run before the first await, in the order the
// requests were registered. What moved was the order the entries were WRITTEN in. processFont and its
// neighbours fill resources.fonts after `await batchRequest.addURL(...)` resolves, so the Map is in
// fetch-completion order; getAdditionalPageData turned it straight into an array and compression.js
// adds the zip entries in that array order.
//
// Measured on three captures of sandordargo.com, same build, --remove-saved-date=true: identical names
// every run, written as 20,18,19,21 then 21,18,19,20 then 18,21,19,20, and the only differences in
// index.html were Disqus's random iframe ids. Four captures of a local file:// fixture were byte-
// identical, because local fetches resolve in registration order — which is why this is a unit test
// on a deliberately shuffled Map rather than a capture. No fixture will ever reproduce the race.
//
// frames is the one map not keyed by indexResource: its key is the frame's window id and its name is
// assigned from resources.frames.size at completion, so a frame's position in the Map already matches
// its own name and sorting by that key would move it away from it. Hence the type test rather than an
// unconditional sort.
import * as cssTree from "../../vendor/css-tree.js";

// helper.js reaches the frame hooks, which install themselves against window and document as they are
// evaluated: the stubs go in before the dynamic import
globalThis.window = globalThis;
globalThis.document = {};
globalThis.Document = class Document { };
globalThis.MutationObserver = class MutationObserver { observe() { } };
const { getProcessorHelperClass } = await import("../../core/lib/processor-helper.js");

const util = {
	getDoctypeString: () => "<!DOCTYPE html>"
};
const ProcessorHelper = getProcessorHelperClass(util, cssTree);
const helper = new ProcessorHelper();

const DOC = { head: { querySelector: () => null } };

let failed = false;

// the keys are the indexResource values the fetches were registered under, the insertion order is the
// order they came back in
function resourceMap(entries) {
	return new Map(entries.map(([indexResource, name]) => [indexResource, { name, content: "" }]));
}

function emptyResources() {
	return { cssVariables: new Map(), fonts: new Map(), worklets: new Map(), stylesheets: new Map(), scripts: new Map(), images: new Map(), frames: new Map() };
}

function namesOf(resources, content) {
	return helper.getAdditionalPageData(DOC, content, resources).resources;
}

{
	const resources = emptyResources();
	resources.fonts = resourceMap([[20, "fonts/20.woff2"], [18, "fonts/18.woff2"], [19, "fonts/19.woff2"], [21, "fonts/21.woff2"]]);
	const content = "fonts/20.woff2 fonts/18.woff2 fonts/19.woff2 fonts/21.woff2";
	check("fonts are written in index order, not arrival order", namesOf(resources, content).fonts.map(resource => resource.name),
		["fonts/18.woff2", "fonts/19.woff2", "fonts/20.woff2", "fonts/21.woff2"]);
}

// the same Map arriving in a different order has to come out the same, which is the whole point
{
	const resources = emptyResources();
	resources.fonts = resourceMap([[21, "fonts/21.woff2"], [19, "fonts/19.woff2"], [20, "fonts/20.woff2"], [18, "fonts/18.woff2"]]);
	const content = "fonts/20.woff2 fonts/18.woff2 fonts/19.woff2 fonts/21.woff2";
	check("a different arrival order gives the same output", namesOf(resources, content).fonts.map(resource => resource.name),
		["fonts/18.woff2", "fonts/19.woff2", "fonts/20.woff2", "fonts/21.woff2"]);
}

// index order is numeric, so the sort cannot be the lexicographic one a name comparison would give
{
	const resources = emptyResources();
	resources.images = resourceMap([[10, "images/10.png"], [2, "images/2.png"], [1, "images/1.png"]]);
	const content = "images/10.png images/2.png images/1.png";
	check("index 10 sorts after index 2", namesOf(resources, content).images.map(resource => resource.name),
		["images/1.png", "images/2.png", "images/10.png"]);
}

// frames keep the order they were added in, which is already the order their names were assigned in
{
	const resources = emptyResources();
	resources.frames = new Map([["0.2", { name: "frames/0/" }], ["0.1", { name: "frames/1/" }], ["0.3", { name: "frames/2/" }]]);
	const content = "frames/0/index.html frames/1/index.html frames/2/index.html";
	check("frames stay in the order their names were assigned", namesOf(resources, content).frames.map(resource => resource.name),
		["frames/0/", "frames/1/", "frames/2/"]);
}

// the control for all of the above: ordering must not resurrect a resource the page stopped
// referencing, which is what this function was doing before the sort was added to it
{
	const resources = emptyResources();
	resources.fonts = resourceMap([[3, "fonts/3.woff2"], [1, "fonts/1.woff2"], [2, "fonts/2.woff2"]]);
	const content = "fonts/3.woff2 fonts/1.woff2";
	check("an unreferenced resource is still dropped", namesOf(resources, content).fonts.map(resource => resource.name),
		["fonts/1.woff2", "fonts/3.woff2"]);
}

if (failed) {
	console.log("\nchecks failed");
	Deno.exit(1);
} else {
	console.log("\nall checks passed");
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
