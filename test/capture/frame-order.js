// A frame used to be named from `resources.frames.size` at the moment its own capture FINISHED, and
// processFrames runs the frames under Promise.all, so the frame that finished first took frames/0/.
// That name goes into the iframe's src in index.html, so it is a difference in what the capture
// WRITES, not just in what order the archive stores it: two captures of one unchanged page could
// disagree about which frame is which.
//
// Measured before the fix, with a local server whose only variable was which of two frames was made
// slow, document order held fixed: with the first iframe slow, index.html read
// `src=frames/1/index.html` then `src=frames/0/index.html`, and frames/0/ held the SECOND frame. With
// the second one slow, the same page came out the other way round. Nothing about the page changed
// between those two runs but the latency.
//
// The fix collects the captures and calls processFrame in document order afterwards, so the frames
// are still captured in parallel and the numbering no longer depends on who wins. The spec allows
// this: doc/singlefile-archive.md calls the layout under frames/<n>/ implementation-defined and makes
// no claim about how <n> is assigned.
import { captureArchive, frameData, html, WIN_ID_ATTRIBUTE_NAME } from "./common.js";

const HOST_URL = "https://example.com/host.html";
const FIRST_FRAME_URL = "https://example.com/first.html";
const SECOND_FRAME_URL = "https://example.com/second.html";
const SLOW_IMAGE_URL = "https://example.com/slow.png";
const FAST_IMAGE_URL = "https://example.com/fast.png";

const FIRST_MARKER = "FIRST FRAME MARKER";
const SECOND_MARKER = "SECOND FRAME MARKER";
const IMAGE = new Uint8Array(64).fill(0x21);
const DELAY = 300;

// the iframes are in this order in every case below; only which one is slow changes
const HOST_PAGE = html(
	"<iframe src=\"" + FIRST_FRAME_URL + "\" " + WIN_ID_ATTRIBUTE_NAME + "=\"0.1\"></iframe>" +
	"<iframe src=\"" + SECOND_FRAME_URL + "\" " + WIN_ID_ATTRIBUTE_NAME + "=\"0.2\"></iframe>");

let failed = false;

// The first frame holds the slow image, so before the fix the SECOND one reached processFrame first
// and took frames/0/.
{
	const { content, resources } = await capture(SLOW_IMAGE_URL, FAST_IMAGE_URL);
	check("the first frame in the document is frames/0/", nameHolding(resources, FIRST_MARKER), "frames/0/");
	check("the second is frames/1/", nameHolding(resources, SECOND_MARKER), "frames/1/");
	check("and the page points at them in that order", frameReferences(content), ["frames/0/index.html", "frames/1/index.html"]);
}

// The same page with the latency the other way round. This is the check that fails without the fix:
// the pair above can be passed by numbering frames in finishing order whenever the first one happens
// to finish first, and only running it both ways tells the two rules apart.
{
	const { content, resources } = await capture(FAST_IMAGE_URL, SLOW_IMAGE_URL);
	check("a slow second frame does not renumber the first", nameHolding(resources, FIRST_MARKER), "frames/0/");
	check("and is itself still frames/1/", nameHolding(resources, SECOND_MARKER), "frames/1/");
	check("with the page unchanged", frameReferences(content), ["frames/0/index.html", "frames/1/index.html"]);
}

if (failed) {
	Deno.exit(1);
}

function capture(firstImageURL, secondImageURL) {
	const firstPage = html("<h1>" + FIRST_MARKER + "</h1><img src=\"" + firstImageURL + "\">");
	const secondPage = html("<h1>" + SECOND_MARKER + "</h1><img src=\"" + secondImageURL + "\">");
	const resources = {
		[HOST_URL]: { body: HOST_PAGE },
		[FIRST_FRAME_URL]: { body: firstPage },
		[SECOND_FRAME_URL]: { body: secondPage },
		[SLOW_IMAGE_URL]: { body: IMAGE, contentType: "image/png", delay: DELAY },
		[FAST_IMAGE_URL]: { body: IMAGE, contentType: "image/png" }
	};
	const frames = [frameData("0.1", FIRST_FRAME_URL, firstPage), frameData("0.2", SECOND_FRAME_URL, secondPage)];
	return captureArchive(resources, { url: HOST_URL, content: HOST_PAGE, frames });
}

function nameHolding(resources, marker) {
	const frame = resources.frames.find(resource => resource.content.includes(marker));
	return frame ? frame.name : null;
}

function frameReferences(content) {
	return (content.match(/frames\/\d+\/index\.html/g) || []);
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
