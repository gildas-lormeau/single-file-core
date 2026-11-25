import "./dom.js";

// imageReductionFactor must leave an animated image alone. resizeImage redraws the image on a canvas,
// which holds one frame, and the still it encodes is smaller than the animation, so the "keep the
// result only when it is smaller" guard accepted it: an animated PNG or an animated WebP came out of
// a save as its first frame. Measured with the CLI at factor 2 in Chromium on 3-frame 256x256 images:
// the animated PNG went from 28970 bytes to a 4815-byte still, the animated WebP from 20420 bytes to
// a 2452-byte still, both the size of the still controls. An animated GIF was never touched, GIF
// not being a type the function handles.
//
// An image is animated when its own bytes say so: a PNG with an `acTL` chunk before its first `IDAT`
// (APNG specification: an `acTL` after `IDAT` is ignored), a WebP whose `VP8X` chunk has the
// animation flag set. The images below hold those structures and nothing a decoder could draw, which
// is all the check reads.
//
// resizeImage needs Image and OffscreenCanvas, which Deno has not: the stubs below answer with a
// fixed natural size and encode every image as the bytes "resized", so a resized image is told
// apart from the fetched one by its content.
globalThis.Image = class Image {
	set src(value) {
		this.naturalWidth = 200;
		this.naturalHeight = 200;
		Promise.resolve().then(() => this.onload());
	}
};

globalThis.OffscreenCanvas = class OffscreenCanvas {
	getContext() {
		return { drawImage() { } };
	}
	convertToBlob(options) {
		return Promise.resolve(new globalThis.Blob(["resized"], { type: options.type }));
	}
};

const { capture, captureArchive, html } = await import("./common.js");

const PAGE_URL = "https://example.com/page.html";
const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const WEBP_ANIMATION_FLAG = 0x02;
const WEBP_ALPHA_FLAG = 0x10;
const PADDING = new Array(64).fill(0);

const IMAGES = {
	"animated.png": { bytes: png(["IHDR", 13], ["acTL", 8], ["fcTL", 26], ["IDAT", 64], ["IEND", 0]), contentType: "image/png", resized: false },
	// a large ancillary chunk in front of the animation chunk: the chunks are walked, not searched
	// in a prefix
	"animated-late.png": { bytes: png(["IHDR", 13], ["iCCP", 4096], ["acTL", 8], ["IDAT", 64], ["IEND", 0]), contentType: "image/png", resized: false },
	"still.png": { bytes: png(["IHDR", 13], ["IDAT", 64], ["IEND", 0]), contentType: "image/png", resized: true },
	// the four letters inside the data of a text chunk are not a chunk type
	"still-text.png": { bytes: png(["IHDR", 13], ["tEXt", 0, "note\0acTL in a comment"], ["IDAT", 64], ["IEND", 0]), contentType: "image/png", resized: true },
	// an animation chunk after the image data is ignored by decoders: the image is displayed still
	"still-trailing.png": { bytes: png(["IHDR", 13], ["IDAT", 64], ["acTL", 8], ["IEND", 0]), contentType: "image/png", resized: true },
	"animated.webp": { bytes: webp("VP8X", [WEBP_ANIMATION_FLAG, 0, 0, 0, 255, 0, 0, 255, 0, 0], "ANIM"), contentType: "image/webp", resized: false },
	"animated-alpha.webp": { bytes: webp("VP8X", [WEBP_ANIMATION_FLAG | WEBP_ALPHA_FLAG, 0, 0, 0, 255, 0, 0, 255, 0, 0], "ANIM"), contentType: "image/webp", resized: false },
	// the extended format without the animation flag: alpha, metadata
	"still-extended.webp": { bytes: webp("VP8X", [WEBP_ALPHA_FLAG, 0, 0, 0, 255, 0, 0, 255, 0, 0], "VP8L"), contentType: "image/webp", resized: true },
	"still-lossless.webp": { bytes: webp("VP8L", PADDING), contentType: "image/webp", resized: true },
	"still-lossy.webp": { bytes: webp("VP8 ", PADDING), contentType: "image/webp", resized: true },
	// a JPEG is never animated: the control for the types the check does not look at
	"still.jpg": { bytes: Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, ...PADDING]), contentType: "image/jpeg", resized: true }
};

let failed = false;

const names = Object.keys(IMAGES);
const page = html(names.map((name, index) => "<img id=i" + index + " src=\"" + name + "\">").join(""));
const resources = { [PAGE_URL]: { body: page } };
names.forEach(name => resources["https://example.com/" + name] = { body: IMAGES[name].bytes, contentType: IMAGES[name].contentType });

{
	const content = await capture(resources, { url: PAGE_URL, content: page, imageReductionFactor: 2 });
	names.forEach((name, index) => {
		const { bytes, contentType, resized } = IMAGES[name];
		const expected = "data:" + contentType + ";base64," + (resized ? btoa("resized") : btoa(String.fromCharCode(...bytes)));
		check(name + (resized ? " is resized" : " keeps its bytes"), attribute(content, "i" + index, "src") === expected, true);
	});
}

// without the option nothing is resized: the control for the stubs
{
	const content = await capture(resources, { url: PAGE_URL, content: page, imageReductionFactor: 1 });
	const resizedCount = names.filter((name, index) => attribute(content, "i" + index, "src").endsWith(btoa("resized"))).length;
	check("control: factor 1 resizes no image", resizedCount, 0);
}

// the archive helper has its own call to resizeImage
{
	const { resources: archiveResources } = await captureArchive(resources, { url: PAGE_URL, content: page, imageReductionFactor: 2 });
	const kept = archiveResources.images.filter(image => new TextDecoder().decode(image.content) != "resized").length;
	const animatedCount = names.filter(name => !IMAGES[name].resized).length;
	check("archive: the animated images keep their bytes", kept, animatedCount);
	check("archive: the still images are resized", archiveResources.images.length - kept > 0, true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

// a PNG made of the given chunks, each [type, data length] or [type, 0, data text]; the CRC is left
// at zero, nothing here verifies it
function png(...chunks) {
	const bytes = [...PNG_SIGNATURE];
	for (const [type, length, text] of chunks) {
		const data = text ? [...text].map(character => character.charCodeAt(0)) : new Array(length).fill(0);
		bytes.push(data.length >>> 24 & 0xFF, data.length >>> 16 & 0xFF, data.length >>> 8 & 0xFF, data.length & 0xFF);
		bytes.push(...[...type].map(character => character.charCodeAt(0)), ...data, 0, 0, 0, 0);
	}
	return Uint8Array.from(bytes);
}

// a WebP whose first chunk has the given type and data, followed by an empty chunk of the second type
function webp(firstType, firstData, secondType) {
	const chunks = [...chunk(firstType, firstData), ...(secondType ? chunk(secondType, PADDING) : [])];
	const size = chunks.length + 4;
	return Uint8Array.from([...ascii("RIFF"), size & 0xFF, size >>> 8 & 0xFF, size >>> 16 & 0xFF, size >>> 24 & 0xFF, ...ascii("WEBP"), ...chunks]);
}

function chunk(type, data) {
	return [...ascii(type), data.length & 0xFF, data.length >>> 8 & 0xFF, data.length >>> 16 & 0xFF, data.length >>> 24 & 0xFF, ...data];
}

function ascii(text) {
	return [...text].map(character => character.charCodeAt(0));
}

function attribute(content, id, name) {
	const match = content.match(new RegExp("<[a-z]+ [^>]*id=\"?" + id + "\"?[ >][^>]*>?"));
	const valueMatch = match && match[0].match(new RegExp(" " + name + "=\"?([^\" >]*)"));
	return valueMatch && valueMatch[1];
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
