import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// A browser drops a whole rule when one selector of its list is one it cannot parse, while the
// unused-styles pass used to judge the selectors one by one. On gemini.google.com the list rule
// `.enable-lr26-markdown-styling & > ul, :host-context(...) & > ul` is dead in Firefox and WebKit,
// which do not implement :host-context(), yet its first selector alone matched, so the pass let
// its declarations win the cascade and pruned the `ul:not(...)` rule those engines actually draw.
// The pass now asks the capturing browser's own parser, CSS.supports("selector(...)"), and leaves
// a rejected rule out of the matching and the cascade. The rule text is kept: it is harmless where
// it is invalid and it lets the same file render as the original does in a browser that accepts it.
// The harness has no CSS global, so each case installs a parser stand-in and records what it was
// asked; the queries themselves are part of what is pinned.
const CSS_TEXT = [
	"ul:not(.plain) { list-style-type: disc; padding-inline-start: 27px }",
	".lr26 ul, :host-context(.lr26) ul { list-style-type: none; padding-inline-start: 3px }",
	"@scope (.md-content) { > p { color: red } }",
	"svg|a { color: blue }"
].join("\n");
const PAGE = html("<style>" + CSS_TEXT + "</style><div class=\"lr26\"><div class=\"md-content\"><p>one</p><ul><li>a</li></ul><svg><a>b</a></svg></div></div>");
const UL_RULE = "ul:not(.plain){list-style-type:disc;padding-inline-start:27px}";
const LIST_RULE = ".lr26 ul,:host-context(.lr26) ul{list-style-type:none;padding-inline-start:3px}";

const resources = {
	[PAGE_URL]: { body: PAGE }
};

let failed = false;

{
	const queries = installParser(query => !query.includes(":host-context("));
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, removeUnusedStyles: true });
	uninstallParser();
	check("the rule the browser draws survives a rejected higher rule", content.includes(UL_RULE), true);
	check("the rejected rule is kept for browsers that accept it", content.includes(LIST_RULE), true);
	check("every selector of the list is asked on its own", queries.includes("selector(.lr26 ul)") && queries.includes("selector(:host-context(.lr26) ul)"), true);
	check("a relative selector is asked with its scope", queries.includes("selector(:scope>p)"), true);
	check("a namespaced type selector is asked without its prefix", queries.includes("selector(a)"), true);
	check("the same selector is asked once", queries.filter(query => query == "selector(.lr26 ul)").length, 1);
}

{
	installParser(() => true);
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, removeUnusedStyles: true });
	uninstallParser();
	check("a parser that accepts the list lets it win as before", content.includes(UL_RULE), false);
	check("the winning list rule is kept as before", content.includes(LIST_RULE), true);
}

{
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, removeUnusedStyles: true });
	check("no parser at hand keeps the previous behaviour", content.includes(UL_RULE), false);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function installParser(supports) {
	const queries = [];
	globalThis.CSS = {
		supports(query) {
			queries.push(query);
			return supports(query);
		}
	};
	return queries;
}

function uninstallParser() {
	delete globalThis.CSS;
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
