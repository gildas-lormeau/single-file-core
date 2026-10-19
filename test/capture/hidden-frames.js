// A hidden frame used to go through the whole frame tree before being dropped: the content script
// messaged it, waited up to the ack timeout for a frame that often never answers (a tracker, an
// OAuth relay, a messaging bridge), captured it, and `processFrames` then discarded the result
// because `preProcessDoc` had marked the element hidden with the generic element test. Gmail carries
// dozens of such frames and paid ~700 ms per view for them. The frame tree now tests frames itself,
// before messaging them, with a test of its own: a frame is a replaced element, so no box, display
// none or visibility hidden means nothing shows, whatever the frame holds. It marks the frame and
// leaves it out, so the frame reaches core with the mark and no window id.
//
// This covers the core side of that contract: a frame marked hidden and without a window id is
// counted as discarded, its content is never requested, and it ends up as an empty frame, exactly as
// the discarded frame did before. The content-script side runs in a browser and is checked there.
// The stats are only kept with `displayStats`, which is what the extension sets to show them.
import { capturePageData, frameData, html, helper, WIN_ID_ATTRIBUTE_NAME } from "./common.js";

const HOST_URL = "https://example.com/host.html";
const SHOWN_FRAME_URL = "https://example.com/shown.html";
const HIDDEN_FRAME_URL = "https://example.com/hidden.html";
const SHOWN_MARKER = "SHOWN FRAME MARKER";
const HIDDEN_MARKER = "HIDDEN FRAME MARKER";
const SHOWN_FRAME_PAGE = html("<h1>" + SHOWN_MARKER + "</h1>");
const HIDDEN_FRAME_PAGE = html("<h1>" + HIDDEN_MARKER + "</h1>");

let failed = false;

// The case this exists for: one frame the tree processed, one it marked hidden and left out.
{
	let hiddenFrameRequested = false;
	const page = html(
		"<iframe src=\"" + SHOWN_FRAME_URL + "\" " + WIN_ID_ATTRIBUTE_NAME + "=\"0.0\"></iframe>" +
		"<iframe src=\"" + HIDDEN_FRAME_URL + "\" " + helper.HIDDEN_FRAME_ATTRIBUTE_NAME + "=\"\"></iframe>");
	const pageData = await capturePageData({
		[HOST_URL]: { body: page },
		[SHOWN_FRAME_URL]: { body: SHOWN_FRAME_PAGE },
		[HIDDEN_FRAME_URL]: { body: HIDDEN_FRAME_PAGE, onRequest: () => hiddenFrameRequested = true }
	}, { url: HOST_URL, content: page, frames: [frameData("0.0", SHOWN_FRAME_URL, SHOWN_FRAME_PAGE)], displayStats: true });
	check("the shown frame keeps its content", pageData.content.includes(SHOWN_MARKER), true);
	check("the hidden frame has none", pageData.content.includes(HIDDEN_MARKER), false);
	check("and its URL was never requested", hiddenFrameRequested, false);
	check("it is left as an empty frame", pageData.content.includes("<iframe src=\"\"") || pageData.content.includes("<iframe src>"), true);
	check("with its mark gone from the saved page", pageData.content.includes(helper.HIDDEN_FRAME_ATTRIBUTE_NAME), false);
	check("it is counted as discarded", pageData.stats.discarded.frames, 1);
	check("and the shown one as processed", pageData.stats.processed.frames, 1);
}

// The control: a frame that reached core unmarked and without a window id, which is what a frame the
// tree never saw looks like, is not counted as discarded, since nothing decided it was hidden.
{
	const page = html("<iframe src=\"" + HIDDEN_FRAME_URL + "\"></iframe>");
	const pageData = await capturePageData({ [HOST_URL]: { body: page }, [HIDDEN_FRAME_URL]: { body: HIDDEN_FRAME_PAGE } },
		{ url: HOST_URL, content: page, frames: [], displayStats: true });
	check("an unmarked frame without a window id is not counted as discarded", pageData.stats.discarded.frames, 0);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log((ok ? "  ok   " : "  FAIL ") + label + (ok ? "" : " (got " + JSON.stringify(actual) + ", expected " + JSON.stringify(expected) + ")"));
	if (!ok) {
		failed = true;
	}
}
