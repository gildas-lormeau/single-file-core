// In archive mode a font, a CSS image or a srcset candidate whose fetch failed was still registered
// as a resource with no content, and the writer turned that into an empty file in the archive, named
// in manifest.json and referenced by the stylesheet or the srcset. An <img> attribute in the same
// situation was already left as `data:,` with nothing registered, and that is also what the inline
// helper writes for every failed resource. The three paths now do the same: `data:,` in the page,
// no entry in the archive.
import { captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const FONT_URL = "https://cdn.example.net/font.woff2";
const IMAGE_URL = "https://cdn.example.net/background.png";
const SRCSET_URL = "https://cdn.example.net/wide.png";
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 0x49, 0x48, 0x44, 0x52]);
const WOFF2_BYTES = new Uint8Array([0x77, 0x4F, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const FAILED = { body: "", status: 404 };

let failed = false;

// fonts
{
	const { resources, content } = await captureFont(FAILED);
	check("a failed font is not registered", resources.fonts.length, 0);
	check("its url() is emptied", fontSource(content, resources), "data:,");
}
{
	const { resources, content } = await captureFont(FAILED, { saveOriginalURLs: true });
	check("with saveOriginalURLs the original URL is kept next to the empty value", fontFace(content, resources).includes("/* original URL: " + FONT_URL + " */url(data:,)"), true);
}
{
	const { resources, content } = await captureFont({ body: WOFF2_BYTES, contentType: "font/woff2" });
	check("control: a fetched font is registered", resources.fonts.length, 1);
	check("and referenced by name", fontSource(content, resources), "fonts/0.woff2");
}

// images in stylesheets
{
	const { resources, content } = await captureBackground(FAILED);
	check("a failed CSS image is not registered", resources.images.length, 0);
	check("its url() is emptied", content.includes("url(data:,)"), true);
}
{
	const { resources } = await captureBackground({ body: PNG_BYTES, contentType: "image/png" });
	check("control: a fetched CSS image is registered", resources.images.length, 1);
}

// srcset candidates
{
	const { resources, content } = await captureSrcset(FAILED);
	check("a failed srcset candidate is not registered", resources.images.length, 0);
	check("its candidate is emptied", content.includes("srcset=\"data:, 2x\""), true);
}
{
	const { resources, content } = await captureSrcset({ body: PNG_BYTES, contentType: "image/png" });
	check("control: a fetched srcset candidate is registered", resources.images.length, 1);
	check("and referenced by name", content.includes("srcset=\"images/0.png 2x\""), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}

function captureFont(font, options = {}) {
	const page = html("<p style=\"font-family:F\">x</p>", "<style>@font-face{font-family:F;src:url(" + FONT_URL + ")}</style>");
	return captureArchive({ [PAGE_URL]: { body: page }, [FONT_URL]: font }, { url: PAGE_URL, content: page, removeUnusedFonts: false, ...options });
}

function captureBackground(image) {
	const page = html("<p class=\"x\">x</p>", "<style>.x{background:url(" + IMAGE_URL + ")}</style>");
	return captureArchive({ [PAGE_URL]: { body: page }, [IMAGE_URL]: image }, { url: PAGE_URL, content: page });
}

function captureSrcset(image) {
	const page = html("<img src=\"data:,\" srcset=\"" + SRCSET_URL + " 2x\">");
	return captureArchive({ [PAGE_URL]: { body: page }, [SRCSET_URL]: image }, { url: PAGE_URL, content: page });
}

// the @font-face lands in the page or in a stylesheet file, depending on how the capture laid it out
function fontFace(content, resources) {
	const text = content + resources.stylesheets.map(resource => resource.content).join("");
	return (text.match(/@font-face[^}]*\}/) || [""])[0];
}

function fontSource(content, resources) {
	const match = fontFace(content, resources).match(/url\(("?)([^)"]*)\1\)/);
	return match ? match[2] : null;
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
