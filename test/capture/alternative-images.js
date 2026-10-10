import { capture, helper, html } from "./common.js";
import { Window } from "npm:happy-dom@20.14.5";

const PAGE_URL = "https://example.com/page.html";
const IMAGE_ATTRIBUTE_NAME = helper.IMAGE_ATTRIBUTE_NAME;
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

// A browser sizes the image of a <picture> from the width and height of the <source> it picked, not
// from the ones of the <img>, which only describe the fallback. Removing the sources therefore
// shrank the saved image to the fallback size: measured on broadinstitute.org, 559x393 live against
// 499x351 saved, the same JPEG in both. The browser exposes no API for the chosen source, so
// preProcessDoc finds it back from currentSrc: the first source whose media query matches and
// whose srcset holds that URL. preProcessPage then writes its width and height onto the img, only
// when the sources are about to be removed, since kept sources size the image by themselves.
{
	const window = new Window({ url: PAGE_URL });
	const document = window.document;
	globalThis.HTMLElement = window.HTMLElement;
	globalThis.SVGElement = window.SVGElement;
	document.body.innerHTML = `
		<picture id="matched"><source srcset="phone.png 1x, phone@2x.png 2x" media="(max-width: 600px)" width="300" height="150"><source srcset="large.png 1x, large@2x.png 2x" media="(min-width: 800px)" width="200" height="100"><img src="small.png" width="100" height="50"></picture>
		<picture id="unsized"><source srcset="large.png" media="(min-width: 800px)"><img src="small.png" width="100" height="50"></picture>
		<picture id="fallback"><source srcset="large.png" media="(min-width: 800px)" width="200" height="100"><img src="small.png" width="100" height="50"></picture>
		<picture id="relative"><source srcset="../images/large.png 2x" width="200" height="100"><img src="small.png"></picture>
	`;
	// happy-dom mirrors src into currentSrc and never selects a source, so the browser's choice is set here
	setCurrentSrc("matched", "https://example.com/large@2x.png");
	setCurrentSrc("unsized", "https://example.com/large.png");
	setCurrentSrc("fallback", "https://example.com/small.png");
	setCurrentSrc("relative", "https://example.com/images/large.png");
	const data = helper.preProcessDoc(document, window, {});
	check("the matched source is found from currentSrc, skipping the one whose media does not match", JSON.stringify(sourceSize(data, "matched")), JSON.stringify({ width: "200", height: "100" }));
	check("a matched source without width or height gives nothing", sourceSize(data, "unsized"), undefined);
	check("the fallback src of the img matches no source", sourceSize(data, "fallback"), undefined);
	check("a relative srcset URL is resolved against the document before matching", JSON.stringify(sourceSize(data, "relative")), JSON.stringify({ width: "200", height: "100" }));

	function setCurrentSrc(id, currentSrc) {
		Object.defineProperty(document.getElementById(id).querySelector("img"), "currentSrc", { value: currentSrc });
	}

	function sourceSize(data, id) {
		return data.images[Number(document.getElementById(id).querySelector("img").getAttribute(IMAGE_ATTRIBUTE_NAME))].sourceSize;
	}
}

{
	const images = [{ currentSrc: "https://example.com/large.png", sourceSize: { width: "200", height: "100" } }];
	const content = html("<picture><source srcset=\"large.png 2x\" media=\"(min-width: 800px)\" width=\"200\" height=\"100\"><img src=\"small.png\" width=\"100\" height=\"50\" " + IMAGE_ATTRIBUTE_NAME + "=\"0\"></picture>");
	const removed = await capture(pageResources([]), { url: PAGE_URL, content, images, removeAlternativeImages: true });
	check("the img takes the size of the source removed with it", /<img[^>]*width="200" height="100"/.test(removed), true);
	const kept = await capture(pageResources([]), { url: PAGE_URL, content, images, removeAlternativeImages: false });
	check("the img keeps its own size when the sources are kept", /<img[^>]*width="100" height="50"/.test(kept), true);
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
