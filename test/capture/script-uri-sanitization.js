import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// blockScripts is what removeEmbedScripts is wired to, and it is the option every save turns on to
// promise that the saved page holds no script. These fixtures are the ways a javascript: URL used to
// survive that promise.
const BLOCK = { blockScripts: true };

// The sanitizer used to read the resolved IDL property, element.href and element.src, and rewrite the
// attribute only when the property was a string starting with "javascript:". That missed every SVG
// link, because SVGAElement.href is an SVGAnimatedString and the guard skipped it, and it never
// looked at form submission targets at all. Each of these executed on one click in a saved page.
const VECTORS = [
	["svg link", "<svg xmlns=\"http://www.w3.org/2000/svg\"><a id=\"target\" href=\"javascript:alert(1)\"><rect/></a></svg>"],
	["form action", "<form action=\"javascript:alert(1)\"><input type=\"submit\"></form>"],
	["button formaction", "<form><button formaction=\"javascript:alert(1)\">go</button></form>"],
	["image input formaction", "<form><input type=\"image\" formaction=\"javascript:alert(1)\"></form>"],
	["object data", "<object data=\"javascript:alert(1)\"></object>"],
	["anchor href", "<a href=\"javascript:alert(1)\">go</a>"],
	["iframe src", "<iframe src=\"javascript:alert(1)\"></iframe>"]
];

let failed = false;

for (const [label, body] of VECTORS) {
	const content = await capture({}, { url: PAGE_URL, content: html(body), ...BLOCK });
	check(`${label} is neutralized`, content.includes("javascript:alert"), false);
}

// The URL parser decides what a javascript: URL is, so the obfuscations it folds away have to be
// folded away here too: leading whitespace is stripped, a tab inside the scheme is removed, and the
// scheme is compared case-insensitively.
const OBFUSCATIONS = [
	["leading whitespace and mixed case", "  \tJaVaScRiPt:alert(1)"],
	["tab inside the scheme", "ja&#9;vascript:alert(1)"],
	["newline before the scheme", "&#10;javascript:alert(1)"],
	["uppercase scheme", "JAVASCRIPT:alert(1)"]
];

for (const [label, value] of OBFUSCATIONS) {
	const content = await capture({}, { url: PAGE_URL, content: html(`<a href="${value}">go</a>`), ...BLOCK });
	check(`${label} is neutralized`, content.includes("alert(1)"), false);
}

// The control. A space inside the scheme is not a javascript: URL, and neither is a relative path, so
// a sanitizer that rewrote either would be matching on text rather than on what the URL parser says.
// Neither href survives as written, because resolveHrefs makes both absolute afterwards; what the
// control asserts is that the sanitizer did not claim them.
{
	const content = await capture({}, { url: PAGE_URL, content: html("<a href=\"java script:alert(1)\">go</a><a href=\"page.html\">go</a>"), ...BLOCK });
	check("a space inside the scheme is not treated as a script URI", content.includes("javascript:void(0)"), false);
	check("a relative href is not treated as a script URI", content.includes("page.html"), true);
}

// The other half of removeEmbedScripts, kept here so that a rewrite of the attribute walk cannot drop
// it silently. Only the script elements can be checked from here: the event handler attribute names
// come from enumerating the on* IDL properties of an element, and no DOM available under Deno
// exposes them: measured at zero enumerable on* keys in both deno-dom and happy-dom. The set is
// therefore empty in this harness and a handler fixture would pass whatever the code did. The
// browser suite in single-file-cli covers the handlers.
{
	const scripts = await capture({}, { url: PAGE_URL, content: html("<script>alert(1)</script><svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(2)</script></svg>"), ...BLOCK });
	check("html and svg script elements are removed", scripts.includes("alert("), false);
}

// The option still has to be an option: with blockScripts off none of this is rewritten.
{
	const content = await capture({}, { url: PAGE_URL, content: html("<a href=\"javascript:alert(1)\">go</a>") });
	check("nothing is rewritten with blockScripts off", content.includes("javascript:alert(1)"), true);
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
