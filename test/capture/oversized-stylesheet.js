import { capture, captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
// css-tree packs the offset of a token in 27 bits and, since 4.1.4, refuses a longer source with a
// RangeError instead of corrupting its token stream
const PARSER_LIMIT = 134217727;
const RULE = ".huge{color:red}";
const OVERSIZED = RULE.repeat(Math.ceil((PARSER_LIMIT + 1) / RULE.length));
const CASES = {
	"a linked stylesheet": {
		page: "<link rel=stylesheet href=\"huge.css\"><link rel=stylesheet href=\"small.css\"><p class=small>text</p>",
		resources: { "https://example.com/huge.css": OVERSIZED }
	},
	"a style element": {
		page: "<style>" + OVERSIZED + "</style><link rel=stylesheet href=\"small.css\"><p class=small>text</p>",
		resources: {}
	},
	"an imported stylesheet": {
		page: "<link rel=stylesheet href=\"importer.css\"><link rel=stylesheet href=\"small.css\"><p class=small>text</p>",
		resources: { "https://example.com/importer.css": "@import url(huge.css); .importer{color:green}", "https://example.com/huge.css": OVERSIZED }
	}
};

let failed = false;

// A stylesheet the parser refuses must cost the page that stylesheet and nothing more. None of the
// places where a stylesheet is parsed caught an error, so the RangeError above went up and the page
// was not saved at all: `capture` rejected in a tenth of a second. Such a sheet is now handled like
// one that failed to load, as an empty one. No real page of that size is known, the largest
// stylesheet met so far being 23.5 MB, which is why the cases build theirs.
for (const [label, run] of [["inline", runInline], ["archive", runArchive]]) {
	for (const [caseName, { page, resources }] of Object.entries(CASES)) {
		let content, error;
		try {
			content = await run(html(page), resources);
		} catch (captureError) {
			error = captureError;
		}
		check(label + ": the page is saved with " + caseName + " over the limit", error ? error.name + ": " + error.message : "saved", "saved");
		if (content !== undefined) {
			check(label + ": " + caseName + " over the limit is left out", content.includes(".huge{"), false);
			check(label + ": the stylesheet next to " + caseName + " is kept", /\.small\s*\{\s*color:\s*blue/.test(content), true);
		}
	}
	// the rules of the stylesheet that imports it are kept: only the import is lost
	{
		const { page, resources } = CASES["an imported stylesheet"];
		const content = await run(html(page), resources).catch(() => "");
		check(label + ": the stylesheet importing it keeps its own rules", /\.importer\s*\{\s*color:\s*green/.test(content), true);
	}
	// the control: the same pages with a stylesheet of ordinary size keep its rules
	{
		const page = html("<link rel=stylesheet href=\"huge.css\"><style>.inline{color:red}</style><p class=small>text</p>");
		const content = await run(page, { "https://example.com/huge.css": ".ordinary{color:red}" });
		check(label + " control: a stylesheet of ordinary size is kept", /\.ordinary\s*\{\s*color:\s*red/.test(content) && /\.inline\s*\{\s*color:\s*red/.test(content), true);
	}
}

// A style attribute is parsed on its own, by the same parser with the same limit. One over the limit
// is emptied and the page is saved, the attributes of the other elements untouched.
{
	const declaration = "color:red;";
	const page = html("<p id=huge style=\"" + declaration.repeat(Math.ceil((PARSER_LIMIT + 1) / declaration.length)) + "\">text</p><p id=small style=\"color:blue\">text</p>");
	let content, error;
	try {
		content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page });
	} catch (captureError) {
		error = captureError;
	}
	check("the page is saved with a style attribute over the limit", error ? error.name + ": " + error.message : "saved", "saved");
	if (content !== undefined) {
		check("a style attribute over the limit is emptied", content.includes("color:red"), false);
		check("the style attribute of another element is kept", /id="?small"?[^>]*color:\s*blue/.test(content), true);
	}
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function getResources(page, stylesheets) {
	const resources = { [PAGE_URL]: { body: page }, "https://example.com/small.css": { body: ".small{color:blue}", contentType: "text/css" } };
	for (const [url, body] of Object.entries(stylesheets)) {
		resources[url] = { body, contentType: "text/css" };
	}
	return resources;
}

function runInline(page, stylesheets) {
	return capture(getResources(page, stylesheets), { url: PAGE_URL, content: page, removeUnusedStyles: false });
}

async function runArchive(page, stylesheets) {
	const pageData = await captureArchive(getResources(page, stylesheets), { url: PAGE_URL, content: page, removeUnusedStyles: false });
	return pageData.content + [...pageData.resources.stylesheets.values()].map(stylesheet => stylesheet.content).join("\n");
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${String(actual).slice(0, 120)}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
