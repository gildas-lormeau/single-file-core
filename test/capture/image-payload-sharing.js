// The archive-side sibling of font-payload-sharing.js for the resources an attribute or a url()
// points at. BatchRequest dedups by URL, so two images that serve the same bytes from two URLs were
// stored twice: a wiki background served identical bytes for scale-to-width-down/1500 and /2048 and
// the archive carried 462,660 bytes twice, 16% of its size; a site logo under a header and a footer
// path, default avatars, gravatar placeholders did the same on smaller scales. Measured on 30 saves
// of the Hacker News front page at CLI 2.15.1.
//
// groupDuplicateImages drops every resource whose bytes repeat an earlier one and rewrites the name
// wherever the page holds it: the attributes processPageResources fills, srcset candidates, url()
// in stylesheets and url() in style attributes, including the -sf-url-original form. The earlier one
// is the lowest indexResource, for the reason the font suite gives: the map is in completion order.
import { captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/images.html";
const IMAGE_A_URL = "https://example.com/a.png";
const IMAGE_B_URL = "https://example.com/b.png";
const IMAGE_C_URL = "https://example.com/c.png";
const CONTENT_TYPE = "image/png";
const IMAGE_BYTES = new Uint8Array(256).fill(0x21);
const SAME_IMAGE_BYTES = new Uint8Array(256).fill(0x21);
const OTHER_IMAGE_BYTES = new Uint8Array(256).fill(0x22);

let failed = false;

// The case this exists for: two <img>, two URLs, one payload.
{
	const { resources, content } = await capture(img(IMAGE_A_URL) + img(IMAGE_B_URL), SAME_IMAGE_BYTES);
	check("byte-identical images are stored once", resources.images.length, 1);
	check("under the name of the lower resource index", (resources.images[0] || {}).name, "images/0.png");
	check("and both elements point at it", countMatches(content, /src="images\/0\.png"/g), 2);
	check("with nothing left pointing at the dropped name", content.includes("images/1.png"), false);
}

// The control: different bytes keep their two files, so the check above is not passed by a capture
// that stores one image whatever it is given.
{
	const { resources, content } = await capture(img(IMAGE_A_URL) + img(IMAGE_B_URL), OTHER_IMAGE_BYTES);
	check("different images are still stored twice", resources.images.length, 2);
	check("each under its own name", countMatches(content, /src="images\/[01]\.png"/g), 2);
}

// The other places a name is written: a url() in a stylesheet, a url() in a style attribute, and a
// srcset candidate, which is a token inside a larger value rather than the whole attribute.
{
	const head = "<style>p { background: url(\"" + IMAGE_B_URL + "\") }</style>";
	const body = img(IMAGE_A_URL) + "<p style=\"background: url(&quot;" + IMAGE_C_URL + "&quot;)\">body</p>";
	const { resources, content } = await capture(body, SAME_IMAGE_BYTES, head, { [IMAGE_C_URL]: { body: SAME_IMAGE_BYTES, contentType: CONTENT_TYPE } });
	check("a stylesheet url() and a style attribute url() share the file", resources.images.length, 1);
	check("the stylesheet points at the kept name", content.includes("url(images/0.png)"), true);
	check("and so does the style attribute", countMatches(content, /url\(images\/0\.png\)/g), 2);
	check("with no other name left", /images\/[12]\.png/.test(content), false);
}
{
	const body = "<img src=\"" + IMAGE_A_URL + "\" srcset=\"" + IMAGE_B_URL + " 2x, " + IMAGE_C_URL + " 3x\">";
	const { resources, content } = await capture(body, SAME_IMAGE_BYTES, "", { [IMAGE_C_URL]: { body: OTHER_IMAGE_BYTES, contentType: CONTENT_TYPE } });
	check("a srcset candidate serving the same bytes as src shares the file", resources.images.length, 2);
	check("the candidate is rewritten inside the srcset", content.includes("srcset=\"images/0.png 2x, images/2.png 3x\""), true);
}

// saveOriginalURLs writes the original URL ahead of the name inside the url(), and the name is the
// tail of that value rather than the whole of it.
{
	const head = "<style>p { background: url(\"" + IMAGE_B_URL + "\") }</style>";
	const { resources, content } = await capture(img(IMAGE_A_URL), SAME_IMAGE_BYTES, head, {}, { saveOriginalURLs: true });
	check("the -sf-url-original form shares the file too", resources.images.length, 1);
	check("and keeps its original URL ahead of the kept name", content.includes("/* original URL: " + IMAGE_B_URL + " */url(images/0.png)"), true);
}

if (failed) {
	Deno.exit(1);
}

function img(url) {
	return "<img src=\"" + url + "\">";
}

async function capture(body, secondImageBytes, head = "", extraResources = {}, options = {}) {
	const page = html(body, head);
	const resources = {
		[PAGE_URL]: { body: page },
		[IMAGE_A_URL]: { body: IMAGE_BYTES, contentType: CONTENT_TYPE },
		[IMAGE_B_URL]: { body: secondImageBytes, contentType: CONTENT_TYPE },
		...extraResources
	};
	return captureArchive(resources, { url: PAGE_URL, content: page, ...options });
}

function countMatches(content, pattern) {
	return (content.match(pattern) || []).length;
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
