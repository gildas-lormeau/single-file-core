// The serializer escapes the text of `<style>` and `<script>` so that it cannot close its own
// element. Only `</` can do that, but `/>` was escaped as well, into `\/>`, and that escape is not
// idempotent: the escaped text is what the next capture of the saved page reads, and it came out one
// backslash pair longer every time. On a Gemini chat, whose list marker is an SVG written with
// backslash escapes inside a CSS `url()`, the first re-save turned `\/>` into `\\\/>`, which CSS reads
// as a literal backslash before the `/>`: the SVG no longer parsed and the "○" markers disappeared.
// Measured with the CLI: two more backslashes per generation, and a re-save never byte-identical.
//
// It only shows where the text reaches the serializer as it was written. Gemini's marker sat in a rule
// nested with `&`, which css-tree 3.2.1 could not parse, so the stylesheet pass kept it as text. The
// css-tree fork vendored since parses that rule and writes its `url()` out again, which drops the
// backslashes, so a style no longer reaches the defect and a script carries the escape instead: the
// pass never rewrites script text.
import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/raw-text.html";
const SVG_RULE = ".list{.theme &>li{mask-image:url(data:image/svg+xml;utf8,<svg\\ xmlns=\\\"http://www.w3.org/2000/svg\\\"><circle\\ r=\\\"1\\\"\\/><\\/svg>)}}";
const SVG_SCRIPT = "document.body.dataset.marker = \"<circle\\ r=\\\"1\\\"\\/>\";";

let failed = false;

// The case this exists for: a script holding `\/>` is written back as it was, and so is every later
// generation.
{
	const first = await captureBody("<div>x</div>", `<script>${SVG_SCRIPT}</script>`);
	check("a script holding an escaped `/>` is saved unchanged", scriptContent(first), SVG_SCRIPT);
	const second = await captureBody(bodyOf(first), headOf(first));
	check("and a capture of the saved page keeps it", scriptContent(second), SVG_SCRIPT);
	const third = await captureBody(bodyOf(second), headOf(second));
	check("generation after generation", scriptContent(third), SVG_SCRIPT);
}

// Gemini's marker itself: whatever the pass writes for it, a re-save writes the same.
{
	const first = await captureBody("<div class=\"theme\"><ul class=\"list\"><li>x</li></ul></div>", `<style>${SVG_RULE}</style>`);
	check("a style holding an escaped `/>` keeps its marker", styleContent(first).includes("<circle\\ r=\\\"1\\\""), true);
	const second = await captureBody(bodyOf(first), headOf(first));
	check("and a capture of the saved page writes the same style", styleContent(second), styleContent(first));
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

function scriptContent(content) {
	return Array.from(content.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)).map(match => match[1]).join("");
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
