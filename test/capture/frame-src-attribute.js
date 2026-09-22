// A frame's content moves into a `srcdoc` attribute when the page is saved as one file, and the
// `src` it was loaded from was removed with it. That is a visible difference, because a page can
// style its frames by that attribute: web.dev ships `iframe:not([src]) { display: none }`, which
// leaves its 1232x646 embedded frame on screen live and collapses it to `display: none` in the saved
// page. The frame is there, with its content, and nothing renders.
//
// An empty `src` fixes it with nothing else attached. Measured in Chromium 151, Firefox 153 and
// WebKit 26.5: `srcdoc` still wins, the frame still loads `about:srcdoc` and shows its content, the
// empty value never navigates anywhere (one document request, no self-embed, `about:blank` if the
// srcdoc is stripped), and the element stops matching `:not([src])`. It is also invisible to core
// itself, since `getAttribute("src")` returns an empty string, which every truthiness test here
// already treats as no source.
//
// The presence is what is copied, not a value: a frame the page loaded with a src gets an empty one,
// and a frame that never had one keeps none, so a page styling `iframe:not([src])` sees in the saved
// page exactly what it saw live.
import { capture, captureArchive, frameData, html, WIN_ID_ATTRIBUTE_NAME } from "./common.js";

const HOST_URL = "https://example.com/host.html";
const FRAME_URL = "https://example.com/frame.html";
const MARKER = "FRAME MARKER";
const FRAME_PAGE = html("<h1>" + MARKER + "</h1>");

let failed = false;

// The case this exists for: a frame loaded from a URL, saved into one file.
{
	const content = await captureWithFrame("<iframe src=\"" + FRAME_URL + "\" " + WIN_ID_ATTRIBUTE_NAME + "=\"0.1\"></iframe>");
	check("the frame content moves into srcdoc", content.includes("srcdoc=\""), true);
	check("and the src attribute stays, empty", hasSrcAttribute(content), true);
	check("with nothing left of the original URL", content.includes(FRAME_URL), false);
}

// The control, and the reason this copies presence rather than writing a src everywhere: a frame the
// page did not give a src to must not gain one, or the same rule hides it live and shows it saved.
{
	const content = await captureWithFrame("<iframe " + WIN_ID_ATTRIBUTE_NAME + "=\"0.1\"></iframe>");
	check("a frame with no src keeps the content it was given", content.includes("srcdoc=\""), true);
	check("and gains no src attribute", hasSrcAttribute(content), false);
}

// A frame whose source was already a srcdoc in the live page is the same control seen from the other
// side: resolveFrameURLs drops that srcdoc and the capture writes its own, with still no src.
{
	const content = await captureWithFrame("<iframe srcdoc=\"<p>original</p>\" " + WIN_ID_ATTRIBUTE_NAME + "=\"0.1\"></iframe>");
	check("a srcdoc frame gains no src either", hasSrcAttribute(content), false);
	check("and its original srcdoc is replaced by the captured one", content.includes("original"), false);
}

// The archive side is unaffected and must stay that way: there the frame is a real file in the zip,
// so it keeps a real src that the empty one must never overwrite.
{
	const page = html("<iframe src=\"" + FRAME_URL + "\" " + WIN_ID_ATTRIBUTE_NAME + "=\"0.1\"></iframe>");
	const { content } = await captureArchive({ [HOST_URL]: { body: page }, [FRAME_URL]: { body: FRAME_PAGE } },
		{ url: HOST_URL, content: page, frames: [frameData("0.1", FRAME_URL, FRAME_PAGE)] });
	check("an archived frame keeps a real src", content.includes("src=\"frames/0/index.html\""), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function captureWithFrame(frameMarkup) {
	const page = html(frameMarkup);
	return capture({ [HOST_URL]: { body: page }, [FRAME_URL]: { body: FRAME_PAGE } },
		{ url: HOST_URL, content: page, frames: [frameData("0.1", FRAME_URL, FRAME_PAGE)] });
}

// The srcdoc value holds a whole document, `>` included, so an attribute regex over the tag has to
// stop before it. happy-dom serializes an empty attribute bare, `<iframe src …>`, where a browser
// writes `src=""`; the two parse identically, and both were measured in the three engines.
function hasSrcAttribute(content) {
	const start = content.indexOf("<iframe");
	if (start == -1) {
		return false;
	}
	const srcdocIndex = content.indexOf("srcdoc=", start);
	const end = srcdocIndex == -1 ? content.indexOf(">", start) : srcdocIndex;
	return /\ssrc(=|\s|$)/.test(content.slice(start, end));
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
