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
	"@media screen { @layer over { .conditional { color: revert-layer } } }"
].join("\n");
const MARKUP = [
	"<p class=\"x\">x</p><p class=\"y\">y</p><p class=\"z\">z</p>",
	"<p class=\"shorthand\">shorthand</p><p class=\"all\">all</p>",
	"<p class=\"fallback\">fallback</p><p class=\"conditional\">conditional</p>"
].join("");
const PAGE = html(MARKUP, "<style>" + CSS + "</style>");

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
