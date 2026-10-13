import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const VIDEO_URL = "https://example.com/video.mp4";
const SIZE = { pxWidth: 320, pxHeight: 180, videoWidth: 320, videoHeight: 180 };

let failed = false;

// The link to a blocked video used to be positioned at the top left of the video's parent, which
// is the whole page when the video sits directly in <main>. It is now inserted before the video
// and placed at the static position, shifted by the offset measured in the page, so it stays on
// the video whatever its parent is and without touching the parent's position.
{
	const page = html("<main><h1>Title</h1><video src=\"video.mp4\" poster=\"poster.png\" data-single-file-video=\"0\"></video></main>");
	const content = await capture({ [PAGE_URL]: { body: page } }, {
		url: PAGE_URL,
		content: page,
		videos: [{ src: VIDEO_URL, size: SIZE, blockLevel: true, linkOffset: { top: 30, left: 12 } }],
		blockVideos: true
	});
	const linkIndex = content.indexOf("<a href=\"" + VIDEO_URL + "\"");
	const videoIndex = content.indexOf("<video");
	check("a link to the video is written", linkIndex > -1, true);
	check("the link comes before the video", linkIndex > -1 && linkIndex < videoIndex, true);
	check("the link is absolutely positioned", /<a [^>]*position:\s*absolute\s*!important/.test(content), true);
	check("the link has no top or left offset", /<a [^>]*[; "](top|left):\s*8px/.test(content), false);
	check("the measured offset is applied as margins", /<a [^>]*margin:\s*38px 0px 0px 20px\s*!important/.test(content), true);
	check("the link of a block-level video is block-level", /<a [^>]*display:\s*block\s*!important/.test(content), true);
	check("the parent is left alone", content.includes("<main style"), false);
}

{
	const page = html("<p>text <video src=\"video.mp4\" poster=\"poster.png\" data-single-file-video=\"0\"></video> text</p>");
	const content = await capture({ [PAGE_URL]: { body: page } }, {
		url: PAGE_URL,
		content: page,
		videos: [{ src: VIDEO_URL, size: SIZE, blockLevel: false, linkOffset: { top: 0, left: 0 } }],
		blockVideos: true
	});
	check("the link of an inline video stays inline", /<a [^>]*display:\s*block/.test(content), false);
	check("a zero offset gives 8px margins", /<a [^>]*margin:\s*8px 0px 0px 8px\s*!important/.test(content), true);
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
