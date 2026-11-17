// The inline helper replaces an `@import` with the imported sheet as text, and the rules written
// after the import follow it in the same `<style>`. A browser reading the original page closes
// whatever the imported file leaves open at its last character: a block, a parenthesis, a bracket,
// a string, a comment, a selector that never got its block. Pasted in as it is, the open construct
// went on into the page's own rules. A file cut in the middle of `url("x"` or ending in
// `span[title="x` took every rule after the import with it, and a selector with no block merged with
// the next selector of the page and made that rule invalid.
//
// Measured in Chrome 157 through the CLI: for `@import url(a.css); span { color: green }` with
// a.css being `p{color:url("x"!important;}`, `p{color:red} span[title="x` or
// `p{color:red} span:is(.a{color:blue}`, the live page renders the span green and the saved page
// rendered it black. `css-generated-stylesheets.js` asks the same question of 400 generated
// stylesheets cut at a random place (159 failed), and of Chrome and Firefox with its dump.
//
// What is checked here is the text: the imported sheet ends closed, and the rule after the import
// comes last, as written.
import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const IMPORT_URL = "https://example.com/imported.css";
const NESTED_IMPORT_URL = "https://example.com/nested.css";
const NESTED_IMPORTED = "p{width:1px}";
const FOLLOWING_RULE = "span{color:green}";

let failed = false;

// The control: a sheet that leaves nothing open is pasted in as it is.
check("a closed stylesheet is unchanged", await inline("p{color:red}"), "p{color:red}");

// css-tree closed these ones by itself, they are pinned so that the closing added here does not
// close them twice.
check("an open block is closed once", await inline("p{color:red"), "p{color:red}");
check("an open comment takes nothing with it", await inline("p{color:red} /* note"), "p{color:red}");
check("an open string in a value is closed", await inline("p{content:\"a"), "p{content:\"a\"}");

// The cases this exists for. css-tree keeps what it cannot parse as raw text, and raw text is
// written back as it was read, open.
check("an open parenthesis in a value it cannot parse is closed", await inline("p{color:url(\"x\"!important;}"), "p{color:url(\"x\"!important;})}");
check("an open string in a selector is closed, and the selector gets a block", await inline("p{color:red} span[title=\"x"), "p{color:red}span[title=\"x\"]{}");
check("an open parenthesis in a selector is closed, and the selector gets a block", await inline("p{color:red} span:is(.a{color:blue}"), "p{color:red}span:is(.a{color:blue}){}");

// Nothing is open here, and the page's next rule would still read `span span{...}`, or
// `span,span{...}` with a trailing comma: a rule that has no block yet takes the next one.
check("a selector with no block gets one", await inline("p{color:red} span"), "p{color:red}span{}");

// An at-rule with no block is a statement, and the end of the file ends it as a semicolon does. An
// empty block would turn `@layer a`, which declares a layer, into a different rule, and an `@import`
// into an invalid one.
check("an at-rule with no block is ended as a statement", await inline("p{color:red} @layer a"), "p{color:red}@layer a;");
check("an import with no semicolon is still imported", await inline("@import url(nested.css)"), NESTED_IMPORTED);
check("an import cut in its URL is still imported", await inline("@import url(\"nested.css"), NESTED_IMPORTED);

// A backslash at the very end escapes nothing in the original, and would escape the character
// written after it here: the quote closing the string.
check("a backslash ending the file does not escape what closes it", await inline("p{content:\"a\\"), "p{content:\"a\"}");
check("an escaped backslash ending the file is kept", await inline("p{content:\"a\\\\"), "p{content:\"a\\\\\"}");

// A `}` that closes nothing. At the top level of the imported file it is part of the selector of the
// next rule and makes that rule invalid. Inside the `@media`, `@layer` or `@supports` block written
// around a conditional import, it closed that block: the rest of the imported sheet left its
// condition, and a print stylesheet applied on screen. There it is written as a `]`, which closes
// nothing either and makes the next rule invalid the same way.
check("a block end closing nothing is left alone in an import with no condition", await inline("p{color:red}} p{color:blue}"), "p{color:red}} p{color:blue}");
check("a block end closing nothing does not close the block of a conditional import", await inline("p{color:red}} p{color:blue} span{color:blue}", " print"),
	"@media print{p{color:red}] p{color:blue}span{color:blue}}");
check("what a conditional import leaves open is closed inside its block", await inline("p{color:red} span:is(.a", " layer(a)"), "@layer a{p{color:red}span:is(.a){}}");

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

// Returns what the import became: the saved stylesheet without the rule that follows the import,
// or the whole stylesheet when that rule is not at its end, which fails the check.
async function inline(imported, prelude = "") {
	const head = "<style>@import url(\"" + IMPORT_URL + "\")" + prelude + ";\n" + FOLLOWING_RULE + "</style>";
	const page = html("<p>body</p><span>text</span>", head);
	const content = await capture({
		[PAGE_URL]: { body: page },
		[IMPORT_URL]: { body: imported, contentType: "text/css" },
		[NESTED_IMPORT_URL]: { body: NESTED_IMPORTED, contentType: "text/css" }
	}, { url: PAGE_URL, content: page });
	const css = (content.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
	return css && css.endsWith(FOLLOWING_RULE) ? css.substring(0, css.length - FOLLOWING_RULE.length) : css;
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
