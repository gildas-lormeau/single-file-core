import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const REAL_POSTER = "data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=";
const PAGE_POSTER = "https://example.com/poster.png";
const EMPTY_RESOURCE = "data:,";

let failed = false;

// A 0x0 canvas is what a video with no decoded frame yields, and toDataURL on it returns "data:,".
// That string used to reach the saved page as poster=data:, — a broken image the browser cannot
// render, on an element whose src the capture has just removed, so the box stays empty for good.
{
	const page = html("<video src=\"video.mp4\" data-single-file-poster=\"0\"></video>");
	const content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, posters: [EMPTY_RESOURCE], blockVideos: true });
	check("an empty poster is not written to the page", /poster=("?)data:,\1/.test(content), false);
	check("and no poster attribute is left behind", content.includes("poster="), false);
}

{
	const page = html("<video src=\"video.mp4\" data-single-file-poster=\"0\"></video>");
	const content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, posters: [REAL_POSTER], blockVideos: true });
	check("a captured poster is written", content.includes(REAL_POSTER), true);
}

// The poster the page itself declares always wins, whatever the capture snapshotted.
{
	const page = html(`<video src="video.mp4" poster="${PAGE_POSTER}" data-single-file-poster="0"></video>`);
	const content = await capture({
		[PAGE_URL]: { body: page },
		[PAGE_POSTER]: { body: "PNG", contentType: "image/png" }
	}, { url: PAGE_URL, content: page, posters: [REAL_POSTER], blockVideos: true });
	check("a poster the page declares is not replaced", content.includes(REAL_POSTER), false);
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
