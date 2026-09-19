// The `max` reported in RESOURCES_INITIALIZED used to leave out every resource inside a frame.
// resolveFrameURLs handed the PARENT's batch request to initializeProcessor, whose last line read
// `batchRequest.getMaxResources()` from it: the parent's count at a moment in stage 0 when nothing
// has been registered yet, so a frame contributed zero however many resources it held. Measured
// before the fix with a page holding one image and a frame holding three: the embedder was told
// max: 1 and then received four RESOURCE_LOADED events. Nested frames compounded it, each one
// reading its own parent's empty queue.
//
// What a user saw: the extensions drive the toolbar badge from (index, maxIndex), so on any page
// with an iframe the bar filled early and then kept receiving resources past its own maximum.
//
// The count now comes from each frame's own Runner, read when the root Processor initializes, once
// the whole RESOLVE_URLS stage has run and every frame runner has started its REPLACE_DATA stage.
// Reading it in initializeProcessor instead, right after the frame's initialize() returns, passes
// every case below as well, measured; the later read was kept because it is the same moment the
// root reads its own count. The stylesheet case covers resources a frame registers through a
// sheet rather than through its elements, which is the batch the frame's stage 1 fills.
import { capture, frameData, html, WIN_ID_ATTRIBUTE_NAME } from "./common.js";

const HOST_URL = "https://example.com/host.html";
const FRAME_URL = "https://example.com/frame.html";
const INNER_FRAME_URL = "https://example.com/inner.html";
const STYLE_URL = "https://example.com/frame.css";
const FONT_URL = "https://example.com/font.woff2";
const BACKGROUND_URL = "https://example.com/bg.png";
const IMAGE = new Uint8Array(64).fill(0x21);

let failed = false;

// the control: no frame, one image, which always agreed
{
	const hostImages = images("host");
	const { max, loaded } = await captureWith(html(hostImages.tags), hostImages.resources, []);
	check("a page with no frame reports its own image", max, 1);
	check("and loads it", loaded, 1);
}

// one image on the page, three in the frame: max used to be 1 here
{
	const hostImages = images("host");
	const frameImages = images("a", "b", "c");
	const framePage = html(frameImages.tags);
	const { max, loaded } = await captureWith(
		html(hostImages.tags + iframe(FRAME_URL, "0.1")),
		{ ...hostImages.resources, ...frameImages.resources, [FRAME_URL]: { body: framePage } },
		[frameData("0.1", FRAME_URL, framePage)]);
	check("the maximum counts the resources of a frame", max, 4);
	check("and every one of them is loaded", loaded, 4);
}

// a frame inside the frame: the inner one used to read the outer frame's empty queue
{
	const hostImages = images("host");
	const frameImages = images("a");
	const innerImages = images("d", "e");
	const innerPage = html(innerImages.tags);
	const framePage = html(frameImages.tags + iframe(INNER_FRAME_URL, "0.1.1"));
	const { max, loaded } = await captureWith(
		html(hostImages.tags + iframe(FRAME_URL, "0.1")),
		{ ...hostImages.resources, ...frameImages.resources, ...innerImages.resources, [FRAME_URL]: { body: framePage }, [INNER_FRAME_URL]: { body: innerPage } },
		[frameData("0.1", FRAME_URL, framePage), frameData("0.1.1", INNER_FRAME_URL, innerPage)]);
	check("the maximum counts the resources of a nested frame", max, 4);
	check("and every one of them is loaded", loaded, 4);
}

// the frame's resources come through its stylesheet: the sheet itself is fetched in stage 0, and
// the font and the background it names are registered by processStylesheets in stage 1
{
	const framePage = html("<p>text</p>", "<link rel=\"stylesheet\" href=\"" + STYLE_URL + "\">");
	const { max, loaded } = await captureWith(
		html(iframe(FRAME_URL, "0.1")),
		{
			[FRAME_URL]: { body: framePage },
			[STYLE_URL]: { body: "@font-face{font-family:F;src:url(" + FONT_URL + ")}body{font-family:F;background:url(" + BACKGROUND_URL + ")}", contentType: "text/css" },
			[FONT_URL]: { body: "FONTDATA", contentType: "font/woff2" },
			[BACKGROUND_URL]: { body: "BGDATA", contentType: "image/png" }
		},
		[frameData("0.1", FRAME_URL, framePage)]);
	check("the maximum counts resources a frame's stylesheet registers", max, 2);
	check("and every one of them is loaded", loaded, 2);
}

if (failed) {
	Deno.exit(1);
}

async function captureWith(hostPage, extraResources, frames) {
	const resources = { [HOST_URL]: { body: hostPage }, ...extraResources };
	let max = -1;
	let loaded = 0;
	await capture(resources, {
		url: HOST_URL,
		content: hostPage,
		frames,
		onprogress(event) {
			if (event.type == event.RESOURCES_INITIALIZED) {
				max = event.detail.max;
			}
			if (event.type == event.RESOURCE_LOADED) {
				loaded++;
			}
		}
	});
	return { max, loaded };
}

function images(...names) {
	const urls = names.map(name => "https://example.com/" + name + ".png");
	return {
		tags: urls.map(url => "<img src=\"" + url + "\">").join(""),
		resources: Object.fromEntries(urls.map(url => [url, { body: IMAGE, contentType: "image/png" }]))
	};
}

function iframe(url, windowId) {
	return "<iframe src=\"" + url + "\" " + WIN_ID_ATTRIBUTE_NAME + "=\"" + windowId + "\"></iframe>";
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
