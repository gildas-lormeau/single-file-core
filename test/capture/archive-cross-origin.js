// core/lib/processor-helper.js rewrites every resource URL to a file stored beside the page, and a
// crossorigin attribute describing the ORIGINAL fetch used to survive that rewrite. It no longer
// means anything once the URL is local, and it is actively harmful: from a file:// page Chromium
// refuses a CORS-mode request for a sibling file, so an archive unzipped and opened from disk lost
// every stylesheet whose <link> carried it. Measured on a saved github.com page, 29 of 29 links,
// 58 "has been blocked by CORS policy" errors and a page rendering in Times with no style at all.
// integrity was already removed on the same reasoning, and the inline helper already drops both
// when it turns a link into a <style> (LINK_FETCH_ATTRIBUTE_NAMES), so this was the archive-only
// half of a rule the rest of the pipeline already followed.
//
// The attribute goes only where the URL is rewritten into the archive, which is what the last case
// holds: a resource left pointing at where it came from keeps the attribute that describes it.
import { captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/cross-origin.html";
const SHEET_URL = "https://example.com/sheet.css";
const IMAGE_URL = "https://example.com/image.png";
const IMAGE_2X_URL = "https://example.com/image-2x.png";
const SCRIPT_URL = "https://example.com/script.js";
const VIDEO_URL = "https://example.com/video.mp4";
const SHEET = "p { color: rgb(1, 2, 3) }";
const IMAGE_BYTES = new Uint8Array(256).fill(0x21);
const OTHER_IMAGE_BYTES = new Uint8Array(256).fill(0x22);
const VIDEO_BYTES = new Uint8Array(256).fill(0x23);
const SCRIPT = "console.log(1)";
const DATA_URI = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

let failed = false;

// The case this exists for: the stylesheet link, which is where it was measured.
{
	const head = "<link rel=\"stylesheet\" crossorigin=\"anonymous\" integrity=\"sha384-x\" href=\"" + SHEET_URL + "\">";
	const page = html("<p>body</p>", head);
	const { content, resources } = await captureArchive({
		[PAGE_URL]: { body: page },
		[SHEET_URL]: { body: SHEET, contentType: "text/css" }
	}, { url: PAGE_URL, content: page });
	check("the stylesheet is stored in the archive", resources.stylesheets.length, 1);
	check("and the link points at the stored file", content.includes("href=\"stylesheet_0.css\""), true);
	check("with no crossorigin left to make it a CORS request", content.includes("crossorigin"), false);
	check("and no integrity either", content.includes("integrity"), false);
}

// An image, which fails the same way: the request is refused and nothing renders in its place.
{
	const page = html("<img crossorigin=\"anonymous\" src=\"" + IMAGE_URL + "\">");
	const { content, resources } = await captureArchive({
		[PAGE_URL]: { body: page },
		[IMAGE_URL]: { body: IMAGE_BYTES, contentType: "image/png" }
	}, { url: PAGE_URL, content: page });
	check("the image is stored in the archive", resources.images.length, 1);
	check("and the element points at the stored file", content.includes("src=\"images/0.png\""), true);
	check("with no crossorigin left on it", content.includes("crossorigin"), false);
}

// srcset is rewritten by another path, processSrcset, and an <img> can carry it with no src at all,
// so the removal cannot ride on the src rewrite alone.
{
	const page = html("<img crossorigin=\"anonymous\" srcset=\"" + IMAGE_URL + " 1x, " + IMAGE_2X_URL + " 2x\">");
	const { content, resources } = await captureArchive({
		[PAGE_URL]: { body: page },
		[IMAGE_URL]: { body: IMAGE_BYTES, contentType: "image/png" },
		[IMAGE_2X_URL]: { body: OTHER_IMAGE_BYTES, contentType: "image/png" }
	}, { url: PAGE_URL, content: page });
	check("both candidates are stored", resources.images.length, 2);
	check("and the srcset points at the stored files", /srcset="images\/[01]\.png 1x, ?images\/[01]\.png 2x"/.test(content), true);
	check("with no crossorigin left on the image", content.includes("crossorigin"), false);
}

// A script, which the CLI blocks by default but an extension save can keep.
{
	const page = html("<p>body</p>", "<script crossorigin=\"anonymous\" src=\"" + SCRIPT_URL + "\"></script>");
	const { content, resources } = await captureArchive({
		[PAGE_URL]: { body: page },
		[SCRIPT_URL]: { body: SCRIPT, contentType: "text/javascript" }
	}, { url: PAGE_URL, content: page });
	check("the script is stored in the archive", resources.scripts.length, 1);
	check("and the element points at the stored file", content.includes("src=\"scripts/0.js\""), true);
	check("with no crossorigin left on it", content.includes("crossorigin"), false);
}

// The awkward one: for media the URL is on a child <source> while crossorigin sits on the parent,
// so removing it from the element whose URL was rewritten is not enough.
{
	const page = html("<video crossorigin=\"anonymous\"><source src=\"" + VIDEO_URL + "\" type=\"video/mp4\"></video>");
	const { content, resources } = await captureArchive({
		[PAGE_URL]: { body: page },
		[VIDEO_URL]: { body: VIDEO_BYTES, contentType: "video/mp4" }
	}, { url: PAGE_URL, content: page });
	check("the video source is stored in the archive", resources.images.length, 1);
	check("and the source points at the stored file", /src="images\/0\.[a-z0-9]+"/.test(content), true);
	check("with no crossorigin left on the parent video", content.includes("crossorigin"), false);
}

// The control, and the reason the removal is tied to the rewrite: a data URI is left exactly as the
// page wrote it, so the attribute that describes it has to stay. A change that swept crossorigin off
// every element would pass every check above and fail this one.
{
	const page = html("<img crossorigin=\"anonymous\" src=\"" + DATA_URI + "\">");
	const { content, resources } = await captureArchive({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page });
	check("a data URI is not stored as a file", resources.images.length, 0);
	check("and its src is untouched", content.includes(DATA_URI), true);
	check("so the element keeps its crossorigin", content.includes("crossorigin=\"anonymous\""), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
