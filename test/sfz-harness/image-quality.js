// resizeImage() re-encodes a resized image with OffscreenCanvas.convertToBlob, or with a <canvas>
// and toBlob when OffscreenCanvas is missing or throws (Firefox, #1831). Neither call passed a
// quality, and the two APIs do not share a default: in Chromium 151, convertToBlob without a quality
// encodes like quality 1.0, which is LOSSLESS WebP (VP8L), while toBlob without one encodes like 0.8.
// So with imageReductionFactor set, a Chromium save shrank images by pixel count only and kept them
// lossless: on the page of issue #2001 (100 book covers served as lossless WebP), re-encoding the
// same resized images at 0.8 took the archive from 73.1MB to 9.6MB.
//
// There is no canvas in Deno, so this checks the value handed to the encoder on both paths rather
// than the bytes it would produce.
globalThis.window = globalThis;
globalThis.document = {};
globalThis.Document = class Document { };
globalThis.MutationObserver = class MutationObserver { observe() { } };

const calls = [];
let offscreenCanvasAvailable = true;

globalThis.Image = class Image {
	set src(value) {
		this.naturalWidth = 400;
		this.naturalHeight = 600;
		Promise.resolve().then(() => this.onload());
	}
};

globalThis.OffscreenCanvas = class OffscreenCanvas {
	constructor(width, height) {
		if (!offscreenCanvasAvailable) {
			throw new Error("OffscreenCanvas is not available");
		}
		this.width = width;
		this.height = height;
	}
	getContext() {
		return { drawImage() { } };
	}
	convertToBlob(options) {
		calls.push({ path: "convertToBlob", type: options.type, quality: options.quality, hasQuality: "quality" in options, width: this.width });
		return Promise.resolve(new Blob(["resized"], { type: options.type }));
	}
};

const doc = {
	createElement() {
		return {
			getContext() {
				return { drawImage() { } };
			},
			toBlob(callback, type, ...rest) {
				calls.push({ path: "toBlob", type, quality: rest[0], hasQuality: rest.length > 0, width: this.width });
				callback(new Blob(["resized"], { type }));
			}
		};
	}
};

const { resizeImage } = await import("../../core/lib/processor-helper-common.js");

const JPEG_DATA_URI = "data:image/jpeg;base64,/9j/";
const WEBP_DATA_URI = "data:image/webp;base64,UklGRg==";

let failed = false;

async function lastCall(dataURI, options) {
	calls.length = 0;
	const result = await resizeImage(doc, dataURI, options);
	return { call: calls[calls.length - 1], result };
}

for (const available of [true, false]) {
	offscreenCanvasAvailable = available;
	const path = available ? "convertToBlob" : "toBlob";
	{
		const { call, result } = await lastCall(WEBP_DATA_URI, { imageReductionFactor: 2 });
		check(`${path}: the encoder is the one this path uses`, call.path, path);
		check(`${path}: a quality is always passed`, call.hasQuality, true);
		check(`${path}: without imageQuality, quality is 0.8`, call.quality, 0.8);
		check(`${path}: the dimensions are still divided`, call.width, 200);
		check(`${path}: the re-encoded image replaces the original`, result.startsWith("data:image/webp;base64,") && result != WEBP_DATA_URI, true);
	}
	{
		const { call } = await lastCall(JPEG_DATA_URI, { imageReductionFactor: 2, imageQuality: 0.5 });
		check(`${path}: imageQuality is passed through`, call.quality, 0.5);
		check(`${path}: the source type is kept`, call.type, "image/jpeg");
	}
	{
		const { call } = await lastCall(WEBP_DATA_URI, { imageReductionFactor: 2, imageQuality: 1 });
		check(`${path}: imageQuality 1 still asks for lossless`, call.quality, 1);
	}
	{
		const { call } = await lastCall(WEBP_DATA_URI, { imageReductionFactor: 2, imageQuality: "0.6" });
		check(`${path}: a string from an options form is read as a number`, call.quality, 0.6);
	}
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
