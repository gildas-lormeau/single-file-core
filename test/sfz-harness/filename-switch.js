// #2052: a per-site spelling of the domain ("bbc" -> "BBC", "imdb" -> "IMDb") took one nested
// %if-equals per site. %switch compares a value with case/result pairs and returns the result of
// the first equal case, the trailing odd argument when none matches, or nothing.

globalThis.window = globalThis;
globalThis.document = {};
globalThis.Document = class Document { };
globalThis.MutationObserver = class MutationObserver { observe() { } };
const { formatFilename } = await import("../../modules/template-formatter.js");

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

async function format(filenameTemplate, url) {
	return (await formatFilename("", null, {
		url,
		title: "Title",
		info: {},
		filenameTemplate,
		filenameReplacementCharacter: "_",
		filenameReplacedCharacters: [],
		filenameReplacementCharacters: [],
		backgroundSave: true,
		filenameMaxLengthUnit: "chars",
		filenameMaxLength: 1024
	})).replace(/\.html$/, "");
}

const TEMPLATE = "%switch<{url-hostname-domain}|bbc|BBC|imdb|IMDb|%capitalize<{url-hostname-domain}>>.{filename-extension}";
check("the first case", await format(TEMPLATE, "https://www.bbc.co.uk/news"), "BBC");
check("a later case", await format(TEMPLATE, "https://www.imdb.com/title/tt1"), "IMDb");
check("the default when no case matches", await format(TEMPLATE, "https://example.com/"), "Example");
check("a nested function as a result", await format("%switch<{url-hostname-domain}|bbc|%uppercase<{url-hostname}>|other>.{filename-extension}", "https://www.bbc.co.uk/"), "WWW.BBC.CO.UK");
check("no default and no match gives an empty value", await format("page-%switch<{url-hostname-domain}|bbc|BBC>.{filename-extension}", "https://example.com/"), "page-");
check("the case is compared whole, not as a substring", await format("%switch<{url-hostname-domain}|bb|BBC|fallback>.{filename-extension}", "https://www.bbc.co.uk/"), "fallback");
check("a single case and no default", await format("%switch<{url-hostname-domain}|example|Example>.{filename-extension}", "https://example.com/"), "Example");

if (failed) {
	Deno.exit(1);
}
