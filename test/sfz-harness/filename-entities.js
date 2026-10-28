// #2036: a site that escapes its title twice ships "&amp;" as text, and the browser decodes it only
// once, so the filename got "&amp;" and "&#8217;" verbatim. The page-text variables now decode the
// HTML character references a second time; the URL, bookmark and option variables are left alone,
// an ampersand there is structural. Decoding a clean title changes nothing.

// template-formatter.js reaches core/helper.js, which pulls in the frame hooks, and those install
// themselves against window and document as they are evaluated: the stubs go in before the import
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

async function format(filenameTemplate, info = {}) {
	return (await formatFilename("", null, {
		url: "https://example.com/a&amp;b?q=x&amp;y",
		title: "Tom &amp; Jerry &#8217;s &lt;best&gt; &quot;hits&quot; &#x1F600; &nbsp;end &unknown; & plain",
		info: Object.assign({ heading: "Fish &amp; Chips", description: "Rock &amp; Roll", author: "A &amp; B", creator: "C &amp; D", publisher: "E &amp; F", lang: "en" }, info),
		filenameTemplate,
		filenameReplacementCharacter: "_",
		filenameReplacedCharacters: [],
		filenameReplacementCharacters: [],
		backgroundSave: true,
		filenameMaxLengthUnit: "chars",
		filenameMaxLength: 1024
	})).replace(/\.html$/, "");
}

check("page-title decodes named, numeric and hex references", await format("{page-title}.{filename-extension}"), "Tom & Jerry ’s <best> \"hits\" \u{1F600} end &unknown; & plain");
check("page-heading", await format("{page-heading}.{filename-extension}"), "Fish & Chips");
check("page-description", await format("{page-description}.{filename-extension}"), "Rock & Roll");
check("page-author", await format("{page-author}.{filename-extension}"), "A & B");
check("page-creator", await format("{page-creator}.{filename-extension}"), "C & D");
check("page-publisher", await format("{page-publisher}.{filename-extension}"), "E & F");
check("a clean title is unchanged", await format("{page-title}.{filename-extension}", {}) == await format("{page-title}.{filename-extension}"), true);
check("url-pathname keeps its ampersands", await format("{url-pathname}.{filename-extension}"), "a&amp;b");
check("url-search keeps its ampersands", await format("{url-search}.{filename-extension}"), "q=x&amp;y");
check("an empty value stays empty", await format("%if-empty<{page-heading}|fallback>.{filename-extension}", { heading: "" }), "fallback");

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
} else {
	console.log("PASSED");
}
