import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const HOST = "https://example.com/icons/";
const IMAGE = new Uint8Array(16).fill(0x21);
// each icon is declared as a custom property under :root, the way linkedin.com declares some 680 of them
const ICONS = {
	used: "read by a rule that matches",
	unused: "read by nothing",
	gone: "read only by a rule that matches nothing",
	base: "read through another custom property",
	inline: "read by a style attribute",
	fallback: "read as the fallback of a var()",
	queried: "read by a rule under a style() container query",
	framed: "read inside a @keyframes rule",
	svg: "read by an SVG presentation attribute"
};
const STYLE = "<style>" +
	":root { " + Object.keys(ICONS).map(name => "--icon-" + name + ": url(" + HOST + name + ".png);").join(" ") + " --alias: var(--icon-base); --flag: true; }" +
	".used { background: var(--icon-used) }" +
	".gone { background: var(--icon-gone) }" +
	".aliased { background: var(--alias) }" +
	".fallback { background: var(--missing, var(--icon-fallback)) }" +
	"@container style(--flag: true) { .queried { background: var(--icon-queried) } }" +
	"@keyframes spin { from { background: var(--icon-framed) } }" +
	".spinning { animation: spin 1s }" +
	"</style>";
const PAGE = html(STYLE + "<div class=\"used\"></div><div class=\"aliased\"></div><div class=\"fallback\"></div><div class=\"queried\"></div><div class=\"spinning\"></div><div style=\"background: var(--icon-inline)\"></div><svg viewBox=\"0 0 1 1\"><rect fill=\"var(--icon-svg)\" width=\"1\" height=\"1\"></rect></svg>");

let failed = false;

// With the unused-styles pass on, the two icons nothing reads are neither fetched nor kept, every other
// one is, and the rule that read the "gone" icon is itself gone, which is what made the icon unread.
{
	const { requests, content } = await captureIcons({ removeUnusedStyles: true });
	for (const name of ["used", "base", "inline", "fallback", "queried", "framed", "svg"]) {
		check(`the ${name} icon (${ICONS[name]}) is fetched`, requests[name], 1);
		check(`the ${name} icon is kept`, content.includes("--icon-" + name), true);
	}
	for (const name of ["unused", "gone"]) {
		check(`the ${name} icon (${ICONS[name]}) is not fetched`, requests[name], 0);
		check(`the ${name} icon is removed`, content.includes("--icon-" + name), false);
	}
	check("the rule reading the gone icon was removed as unused", content.includes(".gone"), false);
	check("the alias and the flag are kept", content.includes("--alias") && content.includes("--flag"), true);
}

// The control: with the pass off nothing is pruned, so every icon is fetched.
{
	const { requests, content } = await captureIcons({ removeUnusedStyles: false });
	check("every icon is fetched with the pass off", Object.values(requests).every(count => count == 1), true);
	check("the unused icon is kept with the pass off", content.includes("--icon-unused"), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function captureIcons(options) {
	const requests = {};
	const resources = {};
	for (const name of Object.keys(ICONS)) {
		requests[name] = 0;
		resources[HOST + name + ".png"] = { body: IMAGE, contentType: "image/png", onRequest: () => requests[name]++ };
	}
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, ...options });
	return { requests, content };
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
