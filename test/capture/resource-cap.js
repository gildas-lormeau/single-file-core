import { capture, frameData, html, WIN_ID_ATTRIBUTE_NAME } from "./common.js";

const PAGE_URL = "https://example.com/big.html";
const HOST_URL = "https://example.com/host.html";
const IMAGE_URL = "https://example.com/big.png";
const PAGE_MARKER = "BIG PAGE MARKER";
const HOST_MARKER = "HOST PAGE MARKER";

// One paragraph of 2.1 MB rather than many small ones, for the reason common.js gives.
const BIG_PAGE = html("<h1>" + PAGE_MARKER + "</h1><p>" + "filler ".repeat(300000) + "</p>");
const HOST_PAGE = html("<h1>" + HOST_MARKER + "</h1><iframe src=\"" + PAGE_URL + "\" " + WIN_ID_ATTRIBUTE_NAME + "=\"0.1\"></iframe>");
const IMAGE_PAGE = html("<h1>" + HOST_MARKER + "</h1><img src=\"" + IMAGE_URL + "\">");
const BIG_IMAGE = new Uint8Array(2 * 1024 * 1024).fill(0x21);

const resources = {
	[PAGE_URL]: { body: BIG_PAGE },
	[HOST_URL]: { body: HOST_PAGE },
	[IMAGE_URL]: { body: BIG_IMAGE, contentType: "image/png" }
};

// One megabyte, so every fixture above is over it and the default of ten is not in the way.
const CAP = { maxResourceSizeEnabled: true, maxResourceSize: 1 };

let failed = false;

// The content a browser captured is handed to core as a string and never fetched, so the cap has no
// point at which it could fire. This is what every extension save and every non-raw CLI capture does.
{
	const content = await capture(resources, { url: PAGE_URL, content: BIG_PAGE, ...CAP });
	check("a page supplied as content is never capped", content.includes(PAGE_MARKER), true);
}

// The regression test. loadPage fetches the document itself in raw mode, and until rootDocument was
// excluded the cap emptied it: a 2.5 MB page came out as 525 bytes with no body at all, exit code 0
// and no warning. The cap is documented to apply to "images, fonts, stylesheets, scripts, frames,
// videos and audios", never to the page.
{
	const content = await capture(resources, { url: PAGE_URL, saveRawPage: true, ...CAP });
	check("a raw page over the cap keeps its content", content.includes(PAGE_MARKER), true);
}

// The control for the test above: the same cap, in the same capture, still has to drop a resource.
// A fix that exempted everything would pass the raw-page check and break the option.
{
	const capped = await capture(resources, { url: HOST_URL, content: IMAGE_PAGE, ...CAP });
	const uncapped = await capture(resources, { url: HOST_URL, content: IMAGE_PAGE });
	check("an image over the cap is left out", capped.includes("data:image/png;base64"), false);
	check("the page holding it is kept", capped.includes(HOST_MARKER), true);
	check("the same image is embedded with the cap off", uncapped.includes("data:image/png;base64"), true);
}

// Frame content captured by the content script arrives as data, like the top document above, so the
// cap cannot reach it either.
{
	const frames = [frameData("0.1", PAGE_URL, BIG_PAGE)];
	const content = await capture(resources, { url: HOST_URL, content: HOST_PAGE, frames, ...CAP });
	check("a frame supplied as data is never capped", content.includes(PAGE_MARKER), true);
	check("its host is kept", content.includes(HOST_MARKER), true);
}

// In raw mode there is no frame data: resolveFrameURLs pushes a frame with no content and its runner
// fetches the frame document, which is the one caller the cap is meant for. Dropping it is correct.
{
	const content = await capture(resources, { url: HOST_URL, saveRawPage: true, ...CAP });
	check("a raw frame over the cap is dropped", content.includes(PAGE_MARKER), false);
	check("its host is kept", content.includes(HOST_MARKER), true);
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
