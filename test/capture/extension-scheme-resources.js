import { capture, html } from "./common.js";

const RESOURCE_NAMES = ["font", "image", "poster", "style attribute url", "stylesheet", "stylesheet url"];
const ORIGINS = {
	"https (control)": "https://example.com",
	"chrome-extension": "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
	"moz-extension": "moz-extension://11111111-2222-3333-4444-555555555555",
	"safari-web-extension": "safari-web-extension://11111111-2222-3333-4444-555555555555"
};

let failed = false;

// A page served from an extension origin, with its resources at the same origin: the replay page of
// an archive viewer built as an extension, which hands core its own fetch. The check that decides
// whether a URL can be fetched at all knew http(s), file and blob only, so the stylesheet link was
// fetched (it goes through a looser check) and nothing else was: no image, no poster, no font, no
// url() in a stylesheet or in a style attribute. They were dropped before the fetch was asked, so
// the fetch the embedder supplies never had a say. Found in ArchiveBox's browser port, which
// patched core for it.
for (const [label, origin] of Object.entries(ORIGINS)) {
	const requested = [];
	const record = name => ({ onRequest: () => requested.push(name) });
	const pageURL = origin + "/page.html";
	const page = html("<link rel=stylesheet href=\"style.css\"><img src=\"image.png\"><div style=\"background:url(attr-bg.png)\">x</div><video poster=\"poster.png\"></video>");
	const content = await capture({
		[pageURL]: { body: page },
		[origin + "/style.css"]: { body: "@font-face{font-family:f;src:url(font.woff2)}body{background:url(css-bg.png);font-family:f}", contentType: "text/css", ...record("stylesheet") },
		[origin + "/image.png"]: { body: "PNG", contentType: "image/png", ...record("image") },
		[origin + "/attr-bg.png"]: { body: "PNG", contentType: "image/png", ...record("style attribute url") },
		[origin + "/css-bg.png"]: { body: "PNG", contentType: "image/png", ...record("stylesheet url") },
		[origin + "/font.woff2"]: { body: "FONT", contentType: "font/woff2", ...record("font") },
		[origin + "/poster.png"]: { body: "PNG", contentType: "image/png", ...record("poster") }
	}, { url: pageURL, content: page, removeUnusedFonts: false, removeUnusedStyles: false });
	check(label + ": every resource reaches the fetch", requested.sort().join(", "), RESOURCE_NAMES.join(", "));
	check(label + ": the five resources of the page and of its stylesheet are embedded", (content.match(/data:(image|font)\//g) || []).length, 5);
}

// The page URL is not a web address there, so it must not be written as the canonical link of the
// saved page, which is what the http(s) test in front of that link is for.
{
	const origin = ORIGINS["chrome-extension"];
	const pageURL = origin + "/page.html";
	const page = html("<p>text</p>");
	const content = await capture({ [pageURL]: { body: page } }, { url: pageURL, content: page, insertCanonicalLink: true });
	check("an extension page gets no canonical link", /rel="?canonical/.test(content), false);
	const webURL = "https://example.com/page.html";
	const webContent = await capture({ [webURL]: { body: page } }, { url: webURL, content: page, insertCanonicalLink: true });
	check("control: a web page gets its canonical link", /rel="?canonical/.test(webContent), true);
}

// A scheme nothing can fetch is still refused: the control for the list of accepted schemes.
{
	const requested = [];
	const pageURL = "https://example.com/page.html";
	const page = html("<img src=\"javascript:void(0)\"><img src=\"about:invalid\"><img src=\"ftp://example.com/image.png\">");
	await capture({
		[pageURL]: { body: page },
		"ftp://example.com/image.png": { body: "PNG", contentType: "image/png", onRequest: () => requested.push("ftp") }
	}, { url: pageURL, content: page });
	check("control: other schemes are not fetched", requested.length, 0);
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
