import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const PAGE = html("<h1>page</h1>");

let failed = false;

// The infobar host lives in the light DOM of the saved page, so the page's own stylesheet can
// still generate ::before and ::after boxes on it, a universal `*::before { content: … }` rule
// being enough. The shadow tree is out of reach, the host's pseudo-elements are not. A style
// element kept as a light-DOM child of the host, so it travels and is removed with it, turns
// them off; a style element applies to the document wherever it sits, rendered or not.
{
	const content = await capture({ [PAGE_URL]: { body: PAGE } }, { url: PAGE_URL, content: PAGE, includeInfobar: true });
	const hostContent = (content.match(/<single-file-infobar[^>]*>(.*?)<template/s) || [])[1] || "";
	check("the infobar host carries a style element", hostContent.includes("<style>"), true);
	check("the style turns off the host's ::before and ::after", hostContent.includes("single-file-infobar::before,single-file-infobar::after{content:none !important}"), true);
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
