import { capture, helper, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const PAGE = html("<picture><source srcset=\"large.png 2x\" media=\"(min-width: 800px)\" width=\"200\" height=\"100\"><img src=\"small.png\" srcset=\"medium.png 1.5x\" width=\"100\" height=\"50\"></picture>");

let failed = false;

// `removeAlternativeImages` deletes the <source> elements and the srcset of every image once the
// resources are in, so with it on the alternative variants were downloaded and then thrown away.
// Skipping the download needed a second, hidden option, `blockAlternativeImages`, which shipped on by
// default in May 2024: since then every save carried the variants only when BOTH were off, and the
// checkbox that promises to keep them did nothing when unchecked, since the hidden one still emptied
// every srcset. One option now does both: on, nothing but the displayed image is requested; off, the
// variants are downloaded and kept, with their media queries and sizes, so the saved page stays
// responsive. The hidden name stays accepted as an alias, for the CLI flag and a stored profile.
{
	const requested = [];
	const resources = pageResources(requested);
	const page = await capture(resources, { url: PAGE_URL, content: PAGE, removeAlternativeImages: true });
	check("the displayed image is requested", requested.includes("small.png"), true);
	check("the srcset of the image is not requested", requested.includes("medium.png"), false);
	check("the srcset of a source is not requested", requested.includes("large.png"), false);
	check("the sources are removed", page.includes("<source"), false);
	check("the image keeps its displayed source", /<img[^>]*src="data:image\/png;base64,/.test(page), true);
	check("the image loses its srcset", /<img[^>]*srcset=/.test(page), false);
}

{
	const requested = [];
	const resources = pageResources(requested);
	const page = await capture(resources, { url: PAGE_URL, content: PAGE, removeAlternativeImages: false });
	check("the srcset of the image is requested", requested.includes("medium.png"), true);
	check("the srcset of a source is requested", requested.includes("large.png"), true);
	check("the source is kept with its variant", /<source[^>]*srcset="data:image\/png;base64,[^"]+ 2x"/.test(page), true);
	check("the source keeps its media query", /<source[^>]*media="\(min-width: 800px\)"/.test(page), true);
	check("the source keeps its size", /<source[^>]*width="200"/.test(page), true);
	check("the image keeps its srcset", /<img[^>]*srcset="data:image\/png;base64,[^"]+ 1\.5x"/.test(page), true);
}

{
	check("blockAlternativeImages fills removeAlternativeImages", helper.normalizeOptions({ blockAlternativeImages: false }).removeAlternativeImages, false);
	check("removeAlternativeImages wins when both are set", helper.normalizeOptions({ blockAlternativeImages: true, removeAlternativeImages: false }).removeAlternativeImages, false);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function pageResources(requested) {
	const image = name => ({ body: "PNG " + name, contentType: "image/png", onRequest: () => requested.push(name) });
	return {
		[PAGE_URL]: { body: PAGE },
		"https://example.com/small.png": image("small.png"),
		"https://example.com/medium.png": image("medium.png"),
		"https://example.com/large.png": image("large.png")
	};
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
