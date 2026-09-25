import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// A winning `revert-layer` rolls the cascade back to the layer below, so the declaration it rolls
// back to is consulted by the browser even though it lost the cascade. The pass used to prune it as
// losing, and the saved page kept `color: revert-layer` with nothing beneath it, so the value fell
// back past the author origin.
//
// The protection first covered the same property name in the same conditional context, and four
// shapes walked past it: a longhand reverting onto a shorthand in the layer below, `all`, the
// keyword reached through a var() fallback, and a revert-layer under @media rolling back onto a
// declaration that lives in the unconditional context. What a revert-layer rolls back to is a
// longhand of some property set somewhere else on the same element, in any context, so the
// protection is now the element: when any winner on it reverts a layer, every declaration that
// reaches that element is kept. Protecting the exact longhands instead would mean carrying the
// shorthand table, and the pass has no other use for one.
//
// Plain `revert` discards the author origin entirely, so pruning what it beats stays correct; a
// `revert-layer` that loses the important-inverted layer order is pruned like any other loser and
// protects nothing.
//
// A rule whose selector carries a state never becomes a cascade candidate at all, so the element
// protection above could not see a `revert-layer` written on one: `.state:hover { color:
// revert-layer }` left `.state { color: red }` in the layer below to be pruned as a loser, and the
// saved page went black on hover where the live page goes red. The match set of such a rule is
// already computed, from the selector with its state stripped, and it is a superset of what the
// rule really matches; every element in it now carries the protection. The same path covers a
// state in an `@scope` prelude, whose inner rules inherit the unqueryable flag.
//
// That match set is only a superset where the sanitizer widens the state away, which it does at the
// top level and inside `:is()` and `:where()`. It does not reach inside `:not()`, `:has()` or the
// `of` argument of `:nth-child()`, so `body:has(p:hover) p`, `p:not(:not(:hover))` and
// `p:nth-child(1 of :hover)` match nothing while the state is off and everything they really match
// is missed. Reproduced in Chromium 151, Firefox 153 and WebKit 26.5: red live, black saved. A rule
// like that declaring `revert-layer` has no determinable match set, so there is no element to
// protect, and the document-wide flag below keeps every losing declaration instead. It is blunt on
// purpose: the precise alternative is to widen those positions in the sanitizer, which changes the
// match set of rules that have nothing to do with `revert-layer`, and the flag costs nothing on a
// page without one, which is all 23 pages of the CSS corpus.
const CSS = [
	"@layer base, over;",
	"@layer base { .x { color: red; padding: 0 } }",
	"@layer over { .x { color: revert-layer; padding: 1px } }",
	"@layer base { .y { color: red } }",
	"@layer over { .y { color: revert } }",
	"@layer base { .z { color: red !important } }",
	"@layer over { .z { color: revert-layer !important } }",
	"@layer base { .shorthand { margin: 10px } }",
	"@layer over { .shorthand { margin: 16px; margin-top: revert-layer } }",
	"@layer base { .all { color: red } }",
	"@layer over { .all { color: blue; all: revert-layer } }",
	"@layer base { .fallback { color: red } }",
	"@layer over { .fallback { color: blue; color: var(--nope, revert-layer) } }",
	"@layer base { .conditional { color: red } }",
	"@layer over { .conditional { color: blue } }",
	"@media screen { @layer over { .conditional { color: revert-layer } } }",
	"@layer base { .state { color: red } }",
	"@layer over { .state { color: blue } .state:hover { color: revert-layer } }",
	"@layer base { .scoped { color: red } }",
	"@layer over { .scoped { color: blue } @scope (.scoped:hover) { :scope { color: revert-layer } } }",
	"@layer base { .plain { color: red } }",
	"@layer over { .plain { color: blue } .plain:hover { color: green } }"
].join("\n");
const MARKUP = [
	"<p class=\"x\">x</p><p class=\"y\">y</p><p class=\"z\">z</p>",
	"<p class=\"shorthand\">shorthand</p><p class=\"all\">all</p>",
	"<p class=\"fallback\">fallback</p><p class=\"conditional\">conditional</p>",
	"<p class=\"state\">state</p><p class=\"scoped\">scoped</p><p class=\"plain\">plain</p>"
].join("");
const PAGE = html(MARKUP, "<style>" + CSS + "</style>");

// The flag is document-wide, so the indeterminate rules need a page of their own: on the page above
// nothing may switch pruning off, and `.other` here proves the flag is what kept the rolled-back
// declaration, since only a document-wide stop keeps a loser on an element the state rule never
// names. The `of` spelling is absent on purpose: css-tree generates it without the space after
// `of`, and happy-dom then drops the clause and matches the first child, so this suite would pass
// it whatever the pass did (finding f0688). It is covered in the browser lane instead.
const INDETERMINATE_CSS = [
	"@layer base, over;",
	"@layer base { .has { color: red } }",
	"@layer over { .has { color: blue } body:has(.has:hover) .has { color: revert-layer } }",
	"@layer base { .other { color: red } }",
	"@layer over { .other { color: blue } }"
].join("\n");
const INDETERMINATE_MARKUP = "<p class=\"has\">has</p><p class=\"other\">other</p>";
const INDETERMINATE_PAGE = html(INDETERMINATE_MARKUP, "<style>" + INDETERMINATE_CSS + "</style>");

const NEGATED_CSS = INDETERMINATE_CSS.replace("body:has(.has:hover) .has", ".has:not(:not(:hover))");
const NEGATED_PAGE = html(INDETERMINATE_MARKUP, "<style>" + NEGATED_CSS + "</style>");

// An indeterminate match set is not always an empty one, which is what the flag first keyed on. Here
// `.active` matches with the state off and `.has` matches only under the mouse, so the pass found
// elements, protected the ones it found, and pruned the rolled-back declaration of every other. The
// flag now fires on the selector rather than on the size of its match set, so a rule the sanitizer
// cannot widen stops the pruning whether or not something matches today. Reproduced in Chromium 151,
// Firefox 153 and WebKit 26.5 with `:nth-child(n of .active, :hover)` and with the doubled `:not()`
// below: red live on hover, black saved.
const PARTIAL_CSS = INDETERMINATE_CSS.replace("body:has(.has:hover) .has", ".has:not(:not(.active, :hover))");
const PARTIAL_MARKUP = "<p class=\"has active\">active</p><p class=\"has\">has</p><p class=\"other\">other</p>";
const PARTIAL_PAGE = html(PARTIAL_MARKUP, "<style>" + PARTIAL_CSS + "</style>");

// `revert-rule` (Safari 27) rolls the cascade back to what it would be without the rule declaring
// it, so what it reaches is a loser too, in any layer or none. The pass knew only `revert-layer`,
// pruned `.rr { color: red }` as beaten by the rule below it, and the saved page went black where
// the live page is red: measured in Safari 27, and in Chrome 153, whose save made the same cut. The
// element protection above covers it unchanged, since keeping every declaration that reaches the
// element is a superset of what either keyword can roll back to.
const REVERT_RULE_CSS = [
	".rr { color: red; padding: 0 }",
	".rr { color: revert-rule; padding: 1px }",
	".rrvar { color: red }",
	".rrvar { color: blue; color: var(--nope, revert-rule) }",
	".rrno { color: red }",
	".rrno { color: blue }"
].join("\n");
const REVERT_RULE_MARKUP = "<p class=\"rr\">rr</p><p class=\"rrvar\">rrvar</p><p class=\"rrno\">rrno</p>";
const REVERT_RULE_PAGE = html(REVERT_RULE_MARKUP, "<style>" + REVERT_RULE_CSS + "</style>");

const resources = {
	[PAGE_URL]: { body: PAGE }
};

let failed = false;

{
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, removeUnusedStyles: true });
	check("the declaration revert-layer rolls back to is kept", content.includes(".x{color:red"), true);
	check("the revert-layer declaration is kept", content.includes("color:revert-layer;"), true);
	check("another property of the reverted element is kept too", content.includes("padding:0"), true);
	check("control: its winner is kept", content.includes("padding:1px"), true);
	check("what a plain revert beats is still removed", content.includes(".y{color:red}"), false);
	check("the plain revert is kept", content.includes(".y{color:revert}"), true);
	check("an important declaration in the lower layer beats the revert-layer above it", content.includes(".z{color:red!important}"), true);
	check("and the losing revert-layer is removed", content.includes(".z{color:revert-layer!important}"), false);
	check("a longhand revert-layer keeps the shorthand it rolls back onto", content.includes(".shorthand{margin:10px}"), true);
	check("control: the shorthand winner is kept", content.includes("margin:16px"), true);
	check("all:revert-layer keeps what it rolls back onto", content.includes(".all{color:red}"), true);
	check("a revert-layer reached through a var() fallback keeps it too", content.includes(".fallback{color:red}"), true);
	check("a revert-layer under @media keeps the unconditional declaration below it", content.includes(".conditional{color:red}"), true);
	check("control: an element with no revert-layer still loses its losers", content.includes(".y{color:red}"), false);
	check("a revert-layer on a state-dependent rule keeps what it rolls back to", content.includes(".state{color:red}"), true);
	check("a revert-layer under a state-dependent scope keeps it too", content.includes(".scoped{color:red}"), true);
	check("control: a state-dependent rule without revert-layer protects nothing", content.includes(".plain{color:red}"), false);
	check("control: the state-dependent rules themselves are kept", content.includes(".plain:hover{color:green}"), true);
}

{
	const content = await capture({ [PAGE_URL]: { body: INDETERMINATE_PAGE } }, { url: PAGE_URL, content: INDETERMINATE_PAGE, removeUnusedStyles: true });
	check("a revert-layer behind :has() keeps what it rolls back to", content.includes(".has{color:red}"), true);
	check("and the rule itself is kept", content.includes("color:revert-layer"), true);
	check("an indeterminate revert-layer keeps every loser on the page", content.includes(".other{color:red}"), true);
}

{
	const content = await capture({ [PAGE_URL]: { body: NEGATED_PAGE } }, { url: PAGE_URL, content: NEGATED_PAGE, removeUnusedStyles: true });
	check("a revert-layer behind a doubled :not() keeps what it rolls back to", content.includes(".has{color:red}"), true);
	check("it keeps every loser on that page too", content.includes(".other{color:red}"), true);
}

{
	const content = await capture({ [PAGE_URL]: { body: PARTIAL_PAGE } }, { url: PAGE_URL, content: PARTIAL_PAGE, removeUnusedStyles: true });
	check("a partly matching state selector keeps what its revert-layer rolls back to", content.includes(".has{color:red}"), true);
	check("and it keeps every loser on the page, not only on what it matched", content.includes(".other{color:red}"), true);
	check("control: the partly matching rule itself is kept", content.includes("color:revert-layer"), true);
}

{
	const content = await capture({ [PAGE_URL]: { body: REVERT_RULE_PAGE } }, { url: PAGE_URL, content: REVERT_RULE_PAGE, removeUnusedStyles: true });
	check("the declaration revert-rule rolls back to is kept", content.includes(".rr{color:red"), true);
	check("the revert-rule declaration is kept", content.includes("color:revert-rule;"), true);
	check("a revert-rule reached through a var() fallback keeps it too", content.includes(".rrvar{color:red}"), true);
	check("control: an element with no revert-rule still loses its losers", content.includes(".rrno{color:red}"), false);
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
