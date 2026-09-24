// `resetReferrerMeta` writes `<meta name=referrer content=no-referrer>` so a saved page sends no
// referrer. It used to remove the page's own and append the new one at the end of the head, at the
// start of the capture, so its place depended on what core appends LATER. The `.sf-hidden` style is
// appended by removeHiddenElements only when the page has none: on a first save it came after the
// referrer meta, on a re-save it was already there and the meta was appended after it, so the first
// re-save of every page with hidden elements was not byte-identical. Measured with the CLI: meta then
// style in generation 1, style then meta in generations 2 and 3. The meta now takes the place of the
// one the page has. The re-capture case shows it with the canonical link, which core appends to the
// head later as well, because this harness marks no hidden element.
import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/referrer.html";

let failed = false;

// The case this exists for: a page that already holds the meta keeps it where it was.
{
	const content = await captureHead("<title>t</title><meta name=\"referrer\" content=\"origin\"><style>.a{color:red}</style>");
	check("the meta takes the place of the page's own", /<title>t<\/title><meta name="?referrer"? content="?no-referrer"?><style>/.test(content), true);
	check("and there is one", countReferrerMetas(content), 1);
}

// A re-capture of a saved page changes nothing in the head. Core appends its own elements to the head
// after the meta was written, which is where the order used to flip.
{
	const first = await captureHead("<title>t</title><style>.a{color:red}</style>");
	const second = await captureHead(headOf(first));
	check("a re-capture keeps the head as it was", headOf(second), headOf(first));
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function captureHead(head) {
	const page = html("<div>x</div>", head);
	return capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page });
}

function headOf(content) {
	const start = content.search(/<meta charset/);
	return content.slice(start, content.search(/<\/head>|<body|<div>/));
}

function countReferrerMetas(content) {
	return (content.match(/<meta name="?referrer/g) || []).length;
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(actual)}${ok ? "" : " (expected " + JSON.stringify(expected) + ")"}`);
	failed ||= !ok;
}
