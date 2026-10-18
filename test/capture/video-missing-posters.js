import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const VIDEO_URL = "https://example.com/video.mp4";
const VIDEO_DATA = { src: VIDEO_URL, size: { pxWidth: 640, pxHeight: 360, videoWidth: 1280, videoHeight: 720 }, currentTime: 0 };
const BLANK_POSTER = /poster="data:image\/svg\+xml,[^"]*width='1280'[^"]*height='720'/;

let failed = false;

// insertMissingVideoPosters draws a frame by appending a temporary <video> to the live document, the
// one the content script hands over as options.doc. A consumer running core away from the page, in
// a background page or a worker, passes none, and the capture threw on `this.options.doc.body` for
// the first video without a poster, so the page was not saved at all. Without a document there is no
// frame to draw, so the blank poster sized like the video is written, as it is when the video fails
// to load.
{
	const page = html("<video src=\"video.mp4\" data-single-file-video=\"0\"></video>");
	let content, error;
	try {
		content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, videos: [VIDEO_DATA], blockVideos: true });
	} catch (thrown) {
		error = thrown;
	}
	check("a video without a poster saves when no document is available", error === undefined, true);
	check("and gets the blank poster sized like the video", Boolean(content) && BLANK_POSTER.test(content), true);
}

// The index attribute names an entry the capture did not send, a frame whose data was lost on the
// way: the video is left without a poster rather than losing the page.
{
	const page = html("<video src=\"video.mp4\" data-single-file-video=\"3\"></video>");
	let content, error;
	try {
		content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, videos: [VIDEO_DATA], blockVideos: true });
	} catch (thrown) {
		error = thrown;
	}
	check("a video whose data is missing saves", error === undefined, true);
	check("and gets no poster", Boolean(content) && !content.includes("poster="), true);
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
