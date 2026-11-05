// A CSS url() can name a fragment of an SVG sprite: url(sprite.svg#bookmark) with a <view> whose
// viewBox crops the sprite to one icon, or a <symbol>, or a nested <svg>. The fragment was dropped
// before the fetch, so every icon of franceinfo.fr (2026-11-05, 235 views in one 220 KB sprite)
// masked with the whole sprite squeezed into 16px, and the 40 icon rules collapsed onto one
// --sf-img variable because the fetched bytes were the same.
//
// The fragment is now kept through resolveStylesheetURLs and the referenced element is cut out of
// the sprite into a standalone SVG: the nested <svg> tile a <view> covers, without its x and y; a
// <symbol> wrapped into an <svg> carrying its viewBox and the sprite's <defs>; a nested <svg>
// named directly. A <view> with no matching tile keeps the whole sprite under the view's viewBox,
// and an id that names nothing usable falls back to the whole sprite with the hash appended, which
// browsers honour on a data: URL and on a file name alike. A hash on a non-SVG resource is dropped
// as before, and url(#id) inside the page is left alone.
/* global atob */
import { capture, captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/icons.html";
const SPRITE_URL = "https://example.com/sprite.svg";
const PICTURE_URL = "https://example.com/picture.png";
const SVG_CONTENT_TYPE = "image/svg+xml";
const SPRITE = "<?xml version=\"1.0\" encoding=\"utf-8\"?>"
	+ "<svg width=\"48\" height=\"48\" viewBox=\"0 0 48 48\" xmlns=\"http://www.w3.org/2000/svg\">"
	+ "<defs><linearGradient id=\"shade\"><stop offset=\"0\"/></linearGradient></defs>"
	+ "<view id=\"bookmark\" viewBox=\"0 0 24 24\"/>"
	+ "<svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" x=\"0\" y=\"0\" xmlns=\"http://www.w3.org/2000/svg\"><path id=\"bookmark-path\" d=\"M0 0h24v24H0z\"/></svg>"
	+ "<view id=\"share\" viewBox=\"24 0 24 24\"/>"
	+ "<svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" x=\"24\" y=\"0\" xmlns=\"http://www.w3.org/2000/svg\"><path id=\"share-path\" d=\"M24 0h24v24H24z\"/></svg>"
	+ "<view id=\"orphan\" viewBox=\"0 24 24 24\"/>"
	+ "<path id=\"orphan-path\" d=\"M0 24h24v24H0z\"/>"
	+ "<symbol id=\"star\" viewBox=\"0 0 10 10\" preserveAspectRatio=\"none\"><path id=\"star-path\" d=\"M5 0l5 10H0z\" fill=\"url(#shade)\"/></symbol>"
	+ "<g id=\"group\"><circle id=\"group-circle\" r=\"1\"/></g>"
	+ "</svg>";
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x21, 0x21]);

let failed = false;

// The case this exists for: two icons out of one sprite, each a <view> over its own tile.
{
	const content = await captureInline(".a { mask-image: url(" + SPRITE_URL + "#bookmark) } .b { mask-image: url(" + SPRITE_URL + "#share) }");
	const [bookmark, share] = svgDataURIs(content);
	check("each rule carries its own data URI", svgDataURIs(content).length, 2);
	check("the bookmark rule holds the bookmark tile only", [bookmark.includes("bookmark-path"), bookmark.includes("share-path")], [true, false]);
	check("the share rule holds the share tile only", [share.includes("share-path"), share.includes("bookmark-path")], [true, false]);
	check("the tile lost its x and y", /\sx="|\sy="/.test(share), false);
	check("and declares the SVG namespace", share.includes("xmlns=\"http://www.w3.org/2000/svg\""), true);
	check("the tile keeps its own viewBox", share.includes("viewBox=\"0 0 24 24\""), true);
	check("nothing was turned into a shared variable", content.includes("--sf-img-"), false);
	check("the data URI carries no fragment", /svg\+xml[^)]*#/.test(content), false);
}

// The same fragment used twice stays two copies of a small SVG rather than one variable holding
// the whole sprite.
{
	const content = await captureInline(".a { mask-image: url(" + SPRITE_URL + "#bookmark) } .b { background: url(" + SPRITE_URL + "#bookmark) }");
	const dataURIs = svgDataURIs(content);
	check("a fragment used twice is inlined twice", dataURIs.length, 2);
	check("with the same content", dataURIs[0] == dataURIs[1], true);
	check("and no variable", content.includes("--sf-img-"), false);
}

// A <view> with no tile under it keeps the whole sprite, cropped by the view's viewBox.
{
	const content = await captureInline(".a { mask-image: url(" + SPRITE_URL + "#orphan) }");
	const [orphan] = svgDataURIs(content);
	check("a view without a tile keeps the whole sprite", [orphan.includes("orphan-path"), orphan.includes("bookmark-path")], [true, true]);
	check("under the view's viewBox", orphan.includes("viewBox=\"0 24 24 24\""), true);
	check("with the sprite's viewBox gone", orphan.includes("viewBox=\"0 0 48 48\""), false);
}

// A <symbol> becomes an <svg> carrying its viewBox and preserveAspectRatio, with the sprite's
// <defs> ahead of its content so a fill="url(#id)" still resolves.
{
	const content = await captureInline(".a { mask-image: url(" + SPRITE_URL + "#star) }");
	const [star] = svgDataURIs(content);
	check("a symbol is wrapped into an svg", star.startsWith("<svg"), true);
	check("carrying its viewBox and preserveAspectRatio", [star.includes("viewBox=\"0 0 10 10\""), star.includes("preserveAspectRatio=\"none\"")], [true, true]);
	check("holding the symbol content", star.includes("star-path"), true);
	check("and the sprite's defs", star.includes("id=\"shade\""), true);
	check("but not the other icons", star.includes("bookmark-path"), false);
	check("and no symbol element", star.includes("<symbol"), false);
}

// An unknown id, and an element that is neither a view, a symbol nor an svg: the whole sprite with
// the hash appended, which is what the browser did with the original URL.
{
	const content = await captureInline(".a { mask-image: url(" + SPRITE_URL + "#missing) } .b { mask-image: url(" + SPRITE_URL + "#group) }");
	check("an unknown id keeps the whole sprite with its hash", /url\("?data:image\/svg\+xml;base64,[^"#)]+#missing"?\)/.test(content), true);
	check("and so does a <g>", /url\("?data:image\/svg\+xml;base64,[^"#)]+#group"?\)/.test(content), true);
	const [missing] = svgDataURIs(content);
	check("the whole sprite is the sprite", [missing.includes("bookmark-path"), missing.includes("group-circle")], [true, true]);
}

// The controls: a hash on a PNG is dropped as before, and a same-document url(#id) is untouched.
{
	const content = await captureInline(".a { background: url(" + PICTURE_URL + "#nothing) } .b { filter: url(#blur) }");
	check("a hash on a PNG is dropped", /url\("?data:image\/png;base64,[^"#)]+"?\)/.test(content), true);
	check("with no hash left on it", content.includes("#nothing"), false);
	check("a same-document url(#id) is left alone", content.includes("url(#blur)"), true);
}

// saveOriginalURLs keeps the original URL with its fragment ahead of the extracted icon.
{
	const content = await captureInline(".a { mask-image: url(" + SPRITE_URL + "#bookmark) }", { saveOriginalURLs: true });
	check("the original URL keeps its fragment", content.includes("/* original URL: " + SPRITE_URL + "#bookmark */url("), true);
	check("ahead of the extracted tile", svgDataURIs(content)[0].includes("bookmark-path"), true);
}

// The archive side: each fragment is its own file named after the id, a fallback keeps the sprite
// file with the hash on the url(), and two rules on one fragment share one file.
{
	const { resources, content } = await captureArchiveStyles(".a { mask-image: url(" + SPRITE_URL + "#bookmark) } .b { mask-image: url(" + SPRITE_URL + "#share) } .c { mask-image: url(" + SPRITE_URL + "#missing) } .d { background: url(" + SPRITE_URL + "#bookmark) }");
	const names = resources.images.map(resource => resource.name).sort();
	check("the archive holds one file per fragment and the sprite", names, ["images/0-bookmark.svg", "images/0-share.svg", "images/0.svg"]);
	check("the bookmark file holds the bookmark tile only", [text(resources, "images/0-bookmark.svg").includes("bookmark-path"), text(resources, "images/0-bookmark.svg").includes("share-path")], [true, false]);
	check("the sprite file is whole", text(resources, "images/0.svg").includes("share-path"), true);
	check("the fallback url() names the sprite file with its hash", content.includes("url(images/0.svg#missing)"), true);
	check("both bookmark rules name the bookmark file", countMatches(content, /url\(images\/0-bookmark\.svg\)/g), 2);
	check("the share rule names the share file", content.includes("url(images/0-share.svg)"), true);
}

// The archive with saveOriginalURLs: the comment carries the fragment, the name does not.
{
	const { content } = await captureArchiveStyles(".a { mask-image: url(" + SPRITE_URL + "#bookmark) } .b { mask-image: url(" + SPRITE_URL + "#missing) }", { saveOriginalURLs: true });
	check("the archive keeps the original URL with its fragment", content.includes("/* original URL: " + SPRITE_URL + "#bookmark */url(images/0-bookmark.svg)"), true);
	check("and the fallback name carries the hash after the comment", content.includes("/* original URL: " + SPRITE_URL + "#missing */url(images/0.svg#missing)"), true);
}

// The attribute side: <img src="sprite.svg#id"> and the other attributes processPageResources
// fills go through the same extraction, in both modes.
{
	const body = "<img id=\"img-bookmark\" src=\"" + SPRITE_URL + "#bookmark\"><img id=\"img-missing\" src=\"" + SPRITE_URL + "#missing\">";
	const head = "<link rel=\"icon\" href=\"" + SPRITE_URL + "#star\">";
	const page = html(body, head);
	const content = await capture(pageResources(page), { url: PAGE_URL, content: page, saveFavicon: true });
	const bookmarkSrc = attribute(content, "img-bookmark", "src");
	check("an img naming a view gets the tile", [decode(bookmarkSrc).includes("bookmark-path"), decode(bookmarkSrc).includes("share-path")], [true, false]);
	check("an img naming an unknown id keeps the sprite with its hash", /^data:image\/svg\+xml;base64,[^#]+#missing$/.test(attribute(content, "img-missing", "src")), true);
	check("a link icon naming a symbol gets the wrapped symbol", decode(content.match(/<link rel="?icon"? href="?([^" >]+)/)[1]).includes("star-path"), true);
	const pageData = await captureArchive(pageResources(page), { url: PAGE_URL, content: page, saveFavicon: true });
	check("the archive img names the tile file", attribute(pageData.content, "img-bookmark", "src"), "images/0-bookmark.svg");
	check("and the unknown id names the sprite file with its hash", attribute(pageData.content, "img-missing", "src"), "images/0.svg#missing");
	check("the archive holds the tile, the symbol and the sprite", pageData.resources.images.map(resource => resource.name).sort(), ["images/0-bookmark.svg", "images/0-star.svg", "images/0.svg"]);
}

if (failed) {
	Deno.exit(1);
}

function attribute(content, id, name) {
	const match = content.match(new RegExp("<[a-z]+ id=\"?" + id + "\"? " + name + "=\"?([^\" >]+)"));
	return match && match[1];
}

function decode(dataURI) {
	return svgDataURIs(dataURI)[0] || "";
}

async function captureInline(css, options = {}) {
	const page = html("<p class=\"a\">a</p><p class=\"b\">b</p>", "<style>" + css + "</style>");
	return capture(pageResources(page), { url: PAGE_URL, content: page, ...options });
}

async function captureArchiveStyles(css, options = {}) {
	const page = html("<p class=\"a\">a</p><p class=\"b\">b</p><p class=\"c\">c</p><p class=\"d\">d</p>", "<style>" + css + "</style>");
	const pageData = await captureArchive(pageResources(page), { url: PAGE_URL, content: page, ...options });
	const stylesheet = pageData.resources.stylesheets.map(resource => resource.content).join("\n");
	return { resources: pageData.resources, content: pageData.content + stylesheet };
}

function pageResources(page) {
	return {
		[PAGE_URL]: { body: page },
		[SPRITE_URL]: { body: SPRITE, contentType: SVG_CONTENT_TYPE },
		[PICTURE_URL]: { body: PNG_BYTES, contentType: "image/png" }
	};
}

function svgDataURIs(content) {
	return Array.from(content.matchAll(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g)).map(match => new TextDecoder().decode(Uint8Array.from(atob(match[1]), character => character.charCodeAt(0))));
}

function text(resources, name) {
	const resource = resources.images.find(resource => resource.name == name);
	return resource ? new TextDecoder().decode(resource.content) : "";
}

function countMatches(content, pattern) {
	return (content.match(pattern) || []).length;
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
