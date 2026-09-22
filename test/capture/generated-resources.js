// Some of the images in a saved page are not the page's, they are SingleFile's own: a video poster
// drawn from a frame onto a canvas, the icon it puts beside a blocked video, the bitmap it takes of
// a `<canvas>`. All three are produced as data: URIs because that is the only carrier a plain HTML
// save has. An archive has files, and `testIgnoredPath` skipped every `data:` URL, so those bytes
// were the one kind of resource a zip capture never stored: measured over 24 corpus archives, 12
// synthesized posters inline for 599K, one of them a single 384K image/webp sitting in index.html,
// plus 13 copies of the link icon. The page's own data: URIs are its content and stay untouched.
//
// Storing them is what the rest of the pipeline already expects. `addFile` writes the zip comment
// "data:" for a resource whose source was a data URL and `addPageResources` leaves it out of the
// manifest, both of which only make sense for a resource that exists — the case was anticipated and
// never reached. Routing these through `processAttribute` and `processStyle` also means they are
// deduped by the batch request like everything else: two videos snapshotting the same frame, or ten
// videos sharing one link icon, store one file.
//
// Only the ARCHIVE helper extracts them. A plain HTML save has nowhere to put a file, so the inline
// helper keeps the data: URI, which the last check here pins.
import { capture, captureArchive, html } from "./common.js";

const atob = globalThis.atob;

const PAGE_URL = "https://example.com/videos.html";
const POSTER = "data:image/webp;base64,UklGRhYAAABXRUJQVlA4TAoAAAAvAAAAAEX/I/4H";
const OTHER_POSTER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const CANVAS_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";

let failed = false;

// The case this exists for: the poster SingleFile synthesized is a stored file, and its bytes are
// the ones the data: URI carried.
{
	const { content, resources } = await archive("<video data-single-file-poster=\"0\"></video>", { blockVideos: true, posters: [POSTER] });
	check("the poster is stored as a file", posters(content)[0], "images/0.webp");
	check("and nothing is left inline", countResourceDataURIs(content), 0);
	check("the file carries the decoded bytes", byteLength(resources.images, "images/0.webp"), decodedLength(POSTER));
}

// Two videos snapshotting the same frame share one file, because the batch request keys on the URL
// and a data: URI IS its payload. This is the shape the corpus showed: 12 posters, 9 distinct.
{
	const { content, resources } = await archive("<video data-single-file-poster=\"0\"></video><video data-single-file-poster=\"0\"></video>", { blockVideos: true, posters: [POSTER] });
	check("both videos point at one file", posters(content).join(" "), "images/0.webp images/0.webp");
	check("and the archive stores it once", resources.images.length, 1);
}

// Two different frames stay two files, so the sharing above is content and not a shortcut that
// collapses every poster into the first one.
{
	const { resources } = await archive("<video data-single-file-poster=\"0\"></video><video data-single-file-poster=\"1\"></video>", { blockVideos: true, posters: [POSTER, OTHER_POSTER] });
	check("two different posters stay two files", resources.images.length, 2);
}

// A `<canvas>` is carried as a background-image, so it travels through the style attribute rather
// than through an attribute of its own, and the url() has to be rewritten the same way.
{
	const { content, resources } = await archive("<canvas data-single-file-canvas=\"0\" width=\"10\" height=\"10\"></canvas>", { canvases: [{ dataURI: CANVAS_IMAGE }] });
	check("the canvas bitmap is stored as a file", content.includes("url(images/0.png)"), true);
	check("and nothing is left inline", countResourceDataURIs(content), 0);
	check("the file carries the decoded bytes", byteLength(resources.images, "images/0.png"), decodedLength(CANVAS_IMAGE));
}

// The control that keeps the rule honest: a data: URI the PAGE wrote is its content, not ours, and
// has to survive. A rule that extracted every data: URL would take this one too.
{
	const { content, resources } = await archive("<img src=\"" + CANVAS_IMAGE + "\"><video data-single-file-poster=\"0\"></video>", { blockVideos: true, posters: [POSTER] });
	check("the page's own data: URI is kept inline", content.includes(CANVAS_IMAGE), true);
	check("and only the poster became a file", resources.images.map(resource => resource.name).join(","), "images/0.webp");
}

// The other control: with no archive to put files in, the inline helper leaves the poster where it
// was. This is the unchanged behaviour of a plain HTML save.
{
	const body = "<video data-single-file-poster=\"0\"></video>";
	const page = html(body);
	const content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, blockVideos: true, posters: [POSTER] });
	check("a plain HTML save keeps the data: URI", content.includes(POSTER), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function archive(body, options) {
	const page = html(body);
	return captureArchive({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, ...options });
}

function posters(content) {
	return Array.from(content.matchAll(/poster="([^"]*)"/g)).map(match => match[1]);
}

// the data: URIs that carry a resource, not the "data:" tokens of the content security policy
function countResourceDataURIs(content) {
	return (content.match(/data:[a-z]+\/[a-z+-]+[;,]/g) || []).length;
}

function byteLength(images, name) {
	const resource = images.find(image => image.name == name);
	return resource ? resource.content.length : -1;
}

function decodedLength(dataURI) {
	return atob(dataURI.slice(dataURI.indexOf(",") + 1)).length;
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(actual)}${ok ? "" : " (expected " + JSON.stringify(expected) + ")"}`);
	failed ||= !ok;
}
