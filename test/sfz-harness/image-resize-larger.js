// With imageReductionFactor set, resizeImage kept the re-encoded image even when it was larger than
// the original, so asking for a smaller file could make some images bigger. It happens on small images,
// where the encoder's fixed overhead outweighs the pixels removed. Measured on 2026-09-27 in Chrome for
// Testing, factor 2 and quality 0.8: 9 of 23 images on en.wikipedia.org/wiki/Cat (20x20 WebP icons,
// e.g. 134 -> 628 bytes) and 6 of 15 on a GitHub repository page (420x420 PNG identicons, about
// 1.5KB -> 1.9KB) came out larger. Keeping the smaller one saved a further 3.6% and 7.6% of the
// images' total size. The original is now kept unless the resized image is smaller.
globalThis.window = globalThis;
globalThis.document = {};
globalThis.Document = class Document { };
globalThis.MutationObserver = class MutationObserver { observe() { } };

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

let encodedLength;

globalThis.Image = class Image {
	set src(value) {
		this.naturalWidth = 400;
		this.naturalHeight = 600;
		Promise.resolve().then(() => this.onload());
	}
};

globalThis.OffscreenCanvas = class OffscreenCanvas {
	getContext() {
		return { drawImage() { } };
	}
	convertToBlob(options) {
		return Promise.resolve(new Blob([new Uint8Array(encodedLength)], { type: options.type }));
	}
};

const { resizeImage } = await import("../../core/lib/processor-helper-common.js");

const ORIGINAL_LENGTH = 30;
const ORIGINAL = "data:image/webp;base64," + globalThis.btoa("x".repeat(ORIGINAL_LENGTH));

let failed = false;

function unsizedSVGImage() {
	const values = new Map();
	return {
		namespaceURI: SVG_NAMESPACE,
		localName: "image",
		getAttribute: name => values.has(name) ? values.get(name) : null,
		setAttribute: (name, value) => values.set(name, String(value)),
		size: () => (values.get("width") ?? "-") + "x" + (values.get("height") ?? "-")
	};
}

async function resize(length, element) {
	encodedLength = length;
	return resizeImage({}, ORIGINAL, { imageReductionFactor: 2 }, element);
}

{
	const result = await resize(ORIGINAL_LENGTH - 3);
	check("control: a smaller resized image replaces the original", result != ORIGINAL && result.startsWith("data:image/webp;base64,"), true);
}
check("a larger resized image is dropped, the original is kept", await resize(ORIGINAL_LENGTH * 2), ORIGINAL);
check("a resized image of the same size is dropped too", await resize(ORIGINAL_LENGTH), ORIGINAL);
{
	const element = unsizedSVGImage();
	await resize(ORIGINAL_LENGTH * 2, element);
	check("an unsized SVG image keeps its own size when the original is kept", element.size(), "-x-");
}
{
	const element = unsizedSVGImage();
	await resize(ORIGINAL_LENGTH - 3, element);
	check("control: it gets the original size when the resized image is used", element.size(), "400x600");
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
