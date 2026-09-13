import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const FILE_URL = "file:///tmp/page.html";
const PAGE = html("<h1>page</h1>");

const resources = {
	[PAGE_URL]: { body: PAGE },
	[FILE_URL]: { body: PAGE }
};

let failed = false;

// insertCanonicalLink was forced to true in single-file.js after the options were merged, so it read
// as an option in three places and could be set from none: the CLI flag was written, measured doing
// nothing, and removed again rather than shipped. It now defaults to true instead of being forced,
// which is what makes the flag and the extension config key mean anything.
{
	const content = await capture(resources, { url: PAGE_URL, content: PAGE });
	check("a canonical link is inserted by default", content.includes("rel=\"canonical\""), true);
}

{
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, insertCanonicalLink: false });
	check("insertCanonicalLink false suppresses it", content.includes("rel=\"canonical\""), false);
}

{
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, insertCanonicalLink: true });
	check("insertCanonicalLink true keeps it", content.includes("rel=\"canonical\""), true);
}

// The href guard is the reason the option is safe to default on: a page saved from disk has no
// canonical URL to point at, and the element is skipped rather than written with a file: href.
{
	const content = await capture(resources, { url: FILE_URL, content: PAGE });
	check("a page saved from file: gets no canonical link", content.includes("rel=\"canonical\""), false);
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
