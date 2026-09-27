// An SVG <image> without width and height is sized from its image (SVG 2 `auto`), so imageReductionFactor
// shrank it on screen: a 1200x1300 image saved with factor 2 was displayed at 600x650 in Chromium,
// Firefox and WebKit. resizeImage now writes the original size as width and height on such an element.
// Unlike an HTML <img>, this cannot distort the image: SVG fits the image into that box through
// preserveAspectRatio, so a CSS rule that overrides one dimension scales it instead of stretching it.
globalThis.window = globalThis;
globalThis.document = {};
globalThis.Document = class Document { };
globalThis.MutationObserver = class MutationObserver { observe() { } };

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

let encodedType;

globalThis.Image = class Image {
	set src(value) {
		this.naturalWidth = 1200;
		this.naturalHeight = 1300;
		Promise.resolve().then(() => this.onload());
	}
};

globalThis.OffscreenCanvas = class OffscreenCanvas {
	getContext() {
		return { drawImage() { } };
	}
	convertToBlob(options) {
		return Promise.resolve(new Blob(["resized"], { type: encodedType || options.type }));
	}
};

const { resizeImage } = await import("../../core/lib/processor-helper-common.js");

const WEBP_DATA_URI = "data:image/webp;base64,UklGRgAAAABXRUJQVlA4IA==";

let failed = false;

function element(namespaceURI, localName, attributes = {}) {
	const values = new Map(Object.entries(attributes));
	return {
		namespaceURI,
		localName,
		getAttribute: name => values.has(name) ? values.get(name) : null,
		setAttribute: (name, value) => values.set(name, String(value)),
		size: () => (values.get("width") ?? "-") + "x" + (values.get("height") ?? "-")
	};
}

async function resize(target, options = { imageReductionFactor: 2 }) {
	await resizeImage({}, WEBP_DATA_URI, options, target);
	return target.size();
}

check("an unsized SVG image gets its original size", await resize(element(SVG_NAMESPACE, "image")), "1200x1300");
check("width and height set to auto count as unsized", await resize(element(SVG_NAMESPACE, "image", { width: "auto", height: " AUTO " })), "1200x1300");
check("an SVG image with a width is left alone", await resize(element(SVG_NAMESPACE, "image", { width: "300" })), "300x-");
check("an SVG image with a height is left alone", await resize(element(SVG_NAMESPACE, "image", { height: "300" })), "-x300");
check("an SVG image with both is left alone", await resize(element(SVG_NAMESPACE, "image", { width: "300", height: "200" })), "300x200");
check("feImage, fitted to its filter region, is left alone", await resize(element(SVG_NAMESPACE, "feImage")), "-x-");
check("an HTML img is left alone", await resize(element(HTML_NAMESPACE, "img")), "-x-");
check("a call without an element still works", (await resizeImage({}, WEBP_DATA_URI, { imageReductionFactor: 2 })).startsWith("data:image/webp;base64,"), true);

// the control for the first check: when the encoder cannot produce the type, the original image is
// kept, so the element must keep its own size too
encodedType = "image/png";
check("no size is written when the image is not replaced", await resize(element(SVG_NAMESPACE, "image")), "-x-");
encodedType = undefined;

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
