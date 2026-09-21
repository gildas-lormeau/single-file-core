import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// Every rule here sits directly inside an @scope block, where a selector may start with a
// combinator and is then relative to the scoping root. The unused-styles pass used to hand that
// text to querySelectorAll as is; a relative selector is a syntax error outside a nesting
// context, the traversal fallback got the same error from matches(), and a rule nothing matched
// was removed as unused. gemini.google.com share pages lost every gap between a response's
// blocks that way (SingleFile#1999). The pass now matches ":scope" + selector within each root.
const CSS = [
	"@scope (.md-content) to (.no-md > *) {",
	"  > :where(*) + :where(*):not(#_) { margin-top: 16px }",
	"  > response-element { display: block }",
	"  > .absent { color: red }",
	"  > .no-md > span { color: blue }",
	"  @media (min-width: 1px) { > p { color: green } }",
	"  p { margin: 0 }",
	"}",
	".md-content { > p { padding: 0 } }"
].join("\n");
const PAGE = html("<style>" + CSS + "</style><div class=\"md-content\"><p>one</p><p>two</p><response-element>r</response-element><div class=\"no-md\"><span>s</span></div></div>");

const resources = {
	[PAGE_URL]: { body: PAGE }
};

let failed = false;

{
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, removeUnusedStyles: true });
	check("the scope block survives", content.includes("@scope (.md-content) to (.no-md>*){"), true);
	check("a relative sibling rule that matches is kept", content.includes(">:where(*)+:where(*):not(#_){margin-top:16px}"), true);
	check("a relative child rule that matches is kept", content.includes(">response-element{display:block}"), true);
	check("a relative rule nested in a conditional at-rule is kept", content.includes("@media (min-width:1px){>p{color:green}}"), true);
	check("a relative rule that matches nothing is still removed", content.includes(".absent"), false);
	check("a relative rule reaching past the scope limit is still removed", content.includes(".no-md>span"), false);
	check("a descendant rule is untouched", content.includes("p{margin:0}"), true);
	check("a relative rule nested in a style rule is untouched", content.includes(".md-content{>p{padding:0}}"), true);
}

{
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, removeUnusedStyles: false });
	check("the pass off keeps the unmatched relative rule", content.includes(".absent"), true);
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
