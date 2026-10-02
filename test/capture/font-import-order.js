// The rules of an @import-ed stylesheet come before the rules that follow the @import in its parent,
// so a face the parent declares again after the import is the one the browser draws: of two faces
// with the same descriptors covering the same characters, the later one wins. In an archive
// (compressContent) every imported stylesheet is a separate entry of the stylesheet map, added after
// its parent, and removeUnusedFonts and removeAlternativeFonts read the faces in map order. So the
// imported copy looked later: removeUnusedFonts dropped the parent's face as shadowed, and
// removeAlternativeFonts kept the imported copy of a repeated face, which then lost to a face
// declared between the two copies. Measured in Safari 27, the page draws the parent's face. Both now
// read the stylesheets in cascade order, imports first. Each case runs in the saved page and in the
// archive, which have to agree.

import { capture, captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/fonts.html";
const FONT_CONTENT_TYPE = "font/woff2";
const FONT_NAMES = ["parent", "imported", "imported2", "nested", "first", "second", "a", "b"];
const REGEXP_IMPORT = /@import\s+(?:url\()?["']?([^"')\s]+)["']?\)?[^;]*;/g;
const REGEXP_LOCAL_NAME = /local\(([^)]+)\)/g;

let failed = false;

for (const archive of [false, true]) {
	const mode = archive ? "archive" : "page";
	check(mode + ": a face declared again after an @import keeps the parent's copy",
		await run(archive, "@import url(imported.css);" + face("parent"), { "imported.css": face("imported") }),
		["parent"]);
	check(mode + ": two identical subsets of an imported stylesheet keep the later one",
		await run(archive, "@import url(imported.css);", { "imported.css": face("imported") + face("imported2") }),
		["imported2"]);
	check(mode + ": a face nested two imports deep is earlier than the parent's",
		await run(archive, "@import url(imported.css);" + face("parent"), { "imported.css": "@import url(nested.css);", "nested.css": face("nested") }),
		["parent"]);
	check(mode + ": of two imports, the second one's face is the later",
		await run(archive, "@import url(first.css);@import url(second.css);", { "first.css": face("first"), "second.css": face("second") }),
		["second"]);
	check(mode + ": an imported face the parent does not repeat is kept",
		await run(archive, "@import url(imported.css);" + face("parent", ";font-weight:700"), { "imported.css": face("imported") }),
		["imported"]);
	check(mode + ": a repeated face keeps its last copy, after the face declared between the copies",
		await run(archive, "@import url(a.css);" + face("b") + face("a"), { "a.css": face("a") }, { removeAlternativeFonts: true, removeUnusedFonts: false }),
		["b", "a"]);
}

if (failed) {
	Deno.exit(1);
}

function face(name, descriptors = "") {
	return "@font-face{font-family:\"S\";src:local(" + name + "),url(https://example.com/" + name + ".woff2) format(\"woff2\");unicode-range:U+0041" + descriptors + "}";
}

async function run(archive, style, importedStylesheets, options = { removeUnusedFonts: true }) {
	const page = html("<p>A</p>", "<style>" + style + "p{font-family:\"S\",sans-serif}</style>");
	const pageResources = new Map([[PAGE_URL, { body: page, contentType: "text/html" }]]);
	Object.entries(importedStylesheets).forEach(([name, content]) => pageResources.set("https://example.com/" + name, { body: content, contentType: "text/css" }));
	FONT_NAMES.forEach((name, index) => pageResources.set("https://example.com/" + name + ".woff2", { body: new Uint8Array(512).fill(65 + index), contentType: FONT_CONTENT_TYPE }));
	const captureOptions = { url: PAGE_URL, content: page, usedFonts: [["s", "400", "normal", "normal", "100%"]], ...options };
	let css;
	if (archive) {
		const pageData = await captureArchive(pageResources, captureOptions);
		const files = new Map((pageData.resources.stylesheets || []).map(resource => [resource.name, resource.content]));
		css = expandImports(getStyleContent(pageData.content), files);
	} else {
		css = getStyleContent(await capture(pageResources, captureOptions));
	}
	return Array.from(css.matchAll(REGEXP_LOCAL_NAME)).map(match => match[1]);
}

function getStyleContent(content) {
	return Array.from(content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)).map(match => match[1]).join("");
}

function expandImports(css, files) {
	return css.replace(REGEXP_IMPORT, (rule, name) => files.has(name) ? expandImports(files.get(name), files) : "");
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
