import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

let failed = false;

// `compressCSS` ran UglifyCSS over the stylesheet css-tree had just generated. Measured on the
// 24-page CSS corpus, that saved 0.015% of 38.4MB in 3.4s, made 6 pages larger by putting back a
// space before every `!important`, and changed rendering: `background:none` became
// `background:0`, a POSITION in that shorthand, so background-position went from `0% 0%` to
// `0 50%` on 119 elements and a sprite set later was misplaced. The option is kept so the settings
// that carry it stay valid, and does nothing: css-tree's output is already compact.
{
	const css = "p { background: none; outline: none; color: #FFFFFF; margin: 0px } p { display: none !important }";
	const page = html("<p>t</p>", "<style>" + css + "</style>");
	const resources = { [PAGE_URL]: { body: page } };
	const plain = await capture(resources, { url: PAGE_URL, content: page });
	const compressed = await capture(resources, { url: PAGE_URL, content: page, compressCSS: true });
	check("compressCSS changes nothing", compressed === plain, true);
	check("background:none is kept", compressed.includes("background:none"), true);
	check("control: the stylesheet is still generated compact", compressed.includes("p{background:none;outline:none"), true);
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
