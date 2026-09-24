// The serializer escapes the text of `<style>` and `<script>` so that it cannot close its own
// element. Only `</` can do that, but `/>` was escaped as well, into `\/>`, and that escape is not
// idempotent: the escaped text is what the next capture of the saved page reads, and it came out one
// backslash pair longer every time. On a Gemini chat, whose list marker is an SVG written with
// backslash escapes inside a CSS `url()`, the first re-save turned `\/>` into `\\\/>`, which CSS reads
// as a literal backslash before the `/>`: the SVG no longer parsed and the "○" markers disappeared.
// Measured with the CLI: two more backslashes per generation, and a re-save never byte-identical.
//
// It only shows where the CSS reaches the serializer as it was written. Gemini's marker sits in a rule
// nested with `&`, which the stylesheet pass keeps as text, so the escapes in its `url()` are never
// decoded. A top-level rule is parsed and written out again, which drops the backslashes, and hides
// the defect.
import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/raw-text.html";
const SVG_RULE = ".list{.theme &>li{mask-image:url(data:image/svg+xml;utf8,<svg\\ xmlns=\\\"http://www.w3.org/2000/svg\\\"><circle\\ r=\\\"1\\\"\\/><\\/svg>)}}";

let failed = false;

// The case this exists for: a style holding `\/>` is written back as it was, and so is every later
// generation.
{
	const first = await captureBody("<div class=\"theme\"><ul class=\"list\"><li>x</li></ul></div>", `<style>${SVG_RULE}</style>`);
	check("a style holding an escaped `/>` is saved unchanged", styleContent(first).includes("<circle\\ r=\\\"1\\\"\\/>"), true);
	const second = await captureBody(bodyOf(first), headOf(first));
	check("and a capture of the saved page keeps it", styleContent(second), styleContent(first));
	const third = await captureBody(bodyOf(second), headOf(second));
	check("generation after generation", styleContent(third), styleContent(first));
}

// A bare `/>` cannot close anything and is written as it is.
{
	const content = await captureBody("<div class=\"a\">x</div>", "<style>.a::after{content:\"/>\"}</style>");
	check("a bare `/>` is not escaped", styleContent(content).includes("\"/>\""), true);
}

// The control: `</style` would close the element, so it is still escaped.
{
	const content = await captureBody("<div class=\"a\">x</div>", "<style>.a::after{content:\"<\\/style>\"}</style>");
	check("a `</style` is still escaped", /<\/style>/i.test(styleContent(content)), false);
	check("and the rule survives", styleContent(content).includes(".a:after") || styleContent(content).includes(".a::after"), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function captureBody(body, head) {
	const page = html(body, head);
	return capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page });
}

function styleContent(content) {
	return Array.from(content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)).map(match => match[1]).filter(text => !text.includes(".sf-hidden")).join("");
}

function headOf(content) {
	const start = content.search(/<meta charset/);
	const end = content.search(/<\/head>|<body/);
	return content.slice(start, end);
}

function bodyOf(content) {
	const start = content.indexOf(">", content.indexOf("<body")) + 1;
	const end = content.indexOf("</body>", start);
	return content.slice(start, end == -1 ? undefined : end);
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(actual)}${ok ? "" : " (expected " + JSON.stringify(expected) + ")"}`);
	failed ||= !ok;
}
