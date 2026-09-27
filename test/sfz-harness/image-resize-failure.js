// resizeImage() falls back to a <canvas> and toBlob when OffscreenCanvas is missing or throws. When
// the encoder fails, toBlob calls back with null, and the callback threw an Error. That throw runs in
// the callback, which the browser calls later, not in the Promise executor, so it never rejected the
// promise: the await never returned, the surrounding try/catch never saw it, and the capture waited
// forever on that image instead of keeping the original data URI.
//
// The stub calls back asynchronously, as browsers do. A synchronous call would run inside the
// executor, where the throw rejects the promise, and the bug would not show.
globalThis.window = globalThis;
globalThis.document = {};
globalThis.Document = class Document { };
globalThis.MutationObserver = class MutationObserver { observe() { } };

globalThis.Image = class Image {
	set src(value) {
		this.naturalWidth = 400;
		this.naturalHeight = 600;
		Promise.resolve().then(() => this.onload());
	}
};

globalThis.OffscreenCanvas = class OffscreenCanvas {
	constructor() {
		throw new Error("OffscreenCanvas is not available");
	}
};

let encoderFails;

const doc = {
	createElement() {
		return {
			getContext() {
				return { drawImage() { } };
			},
			toBlob(callback, type) {
				setTimeout(() => callback(encoderFails ? null : new Blob(["resized"], { type })), 0);
			}
		};
	}
};

const { resizeImage } = await import("../../core/lib/processor-helper-common.js");

const WEBP_DATA_URI = "data:image/webp;base64,UklGRg==";
const TIMEOUT = "timed out";

let failed = false;

async function resize() {
	let timeoutId;
	const timeout = new Promise(resolve => timeoutId = setTimeout(() => resolve(TIMEOUT), 2000));
	const result = await Promise.race([resizeImage(doc, WEBP_DATA_URI, { imageReductionFactor: 2 }), timeout]);
	globalThis.clearTimeout(timeoutId);
	return result;
}

// the control: the same stub, with an encoder that works, does replace the image
encoderFails = false;
{
	const result = await resize();
	check("a working encoder replaces the image", result != TIMEOUT && result != WEBP_DATA_URI && result.startsWith("data:image/webp;base64,"), true);
}

encoderFails = true;
{
	const result = await resize();
	check("a failing encoder does not hang", result != TIMEOUT, true);
	check("a failing encoder keeps the original image", result, WEBP_DATA_URI);
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
