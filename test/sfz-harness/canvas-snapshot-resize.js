// imageReductionFactor resized the images fetched from HTML attributes, but not the snapshots SingleFile
// takes of <canvas> elements: they were saved as full-size PNG, the format where resizing saves the
// most. A 1200x1300 canvas saved with factor 2 by the CLI was a 1.6MB PNG before and 324KB after.
// The snapshot is drawn as a background at 100% 100% on the canvas, which keeps its width and height
// attributes, so a smaller snapshot never changes the canvas's displayed size.
//
// Processor.loadPage resizes the snapshots before any stage runs, because the sequential tasks,
// replaceCanvasElements among them, are not awaited.
globalThis.window = globalThis;
globalThis.document = {};
globalThis.Document = class Document { };
globalThis.MutationObserver = class MutationObserver { observe() { } };

const widths = [];

globalThis.Image = class Image {
	set src(value) {
		this.naturalWidth = 1200;
		this.naturalHeight = 1300;
		Promise.resolve().then(() => this.onload());
	}
};

globalThis.OffscreenCanvas = class OffscreenCanvas {
	constructor(width) {
		this.width = width;
	}
	getContext() {
		return { drawImage() { } };
	}
	convertToBlob(options) {
		widths.push(this.width);
		return Promise.resolve(new Blob(["resized"], { type: options.type }));
	}
};

const cssTree = await import("../../vendor/css-tree.js");
const { getProcessorHelperClass } = await import("../../core/lib/processor-helper.js");
const ProcessorHelper = getProcessorHelperClass({}, cssTree);
const helper = new ProcessorHelper();

const PNG_DATA_URI = "data:image/png;base64,iVBORw0KGgo=";

let failed = false;

function canvases() {
	return [{ dataURI: PNG_DATA_URI, backgroundColor: "red" }, { blank: true }, {}];
}

{
	const list = canvases();
	widths.length = 0;
	await helper.resizeCanvasImages({}, list, { imageReductionFactor: 2 });
	check("a snapshot is resized with the factor", widths.join(), "600");
	check("the resized snapshot replaces the original", list[0].dataURI != PNG_DATA_URI && list[0].dataURI.startsWith("data:image/png;base64,"), true);
	check("the other canvas data is kept", list[0].backgroundColor, "red");
	check("a blank canvas is left alone", JSON.stringify(list[1]), JSON.stringify({ blank: true }));
	check("a tainted canvas, with no snapshot, is left alone", JSON.stringify(list[2]), "{}");
}

// the control: without a factor, nothing is re-encoded
{
	const list = canvases();
	widths.length = 0;
	await helper.resizeCanvasImages({}, list, { imageReductionFactor: 1 });
	check("factor 1 re-encodes nothing", widths.length, 0);
	check("factor 1 keeps the snapshot", list[0].dataURI, PNG_DATA_URI);
}

{
	let threw = false;
	try {
		await helper.resizeCanvasImages({}, undefined, { imageReductionFactor: 2 });
	} catch {
		threw = true;
	}
	check("a document without canvases is fine", threw, false);
}

if (failed) {
	console.log("\nchecks failed");
	Deno.exit(1);
} else {
	console.log("\nall checks passed");
}

function check(label, actual, expected) {
	const pass = actual === expected;
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
