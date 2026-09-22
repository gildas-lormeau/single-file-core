import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// A winning `revert-layer` rolls the cascade back to the layer below, so the declaration it rolls
// back to is consulted by the browser even though it lost the cascade. The pass used to prune it as
// losing, and the saved page kept `color: revert-layer` with nothing beneath it, so the value fell
// back past the author origin. Every declaration of that property on that element is now kept when
// the winner is `revert-layer`. Plain `revert` discards the author origin entirely, so pruning what
// it beats stays correct; a `revert-layer` that loses the important-inverted layer order is pruned
// like any other loser.
const CSS = [
	"@layer base, over;",
	"@layer base { .x { color: red; margin: 0 } }",
	"@layer over { .x { color: revert-layer; margin: 1px } }",
	"@layer base { .y { color: red } }",
	"@layer over { .y { color: revert } }",
	"@layer base { .z { color: red !important } }",
	"@layer over { .z { color: revert-layer !important } }"
].join("\n");
const PAGE = html("<p class=\"x\">x</p><p class=\"y\">y</p><p class=\"z\">z</p>", "<style>" + CSS + "</style>");

const resources = {
	[PAGE_URL]: { body: PAGE }
};

let failed = false;

{
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, removeUnusedStyles: true });
	check("the declaration revert-layer rolls back to is kept", content.includes(".x{color:red}"), true);
	check("the revert-layer declaration is kept", content.includes("color:revert-layer;"), true);
	check("control: a losing declaration of another property in the same rule is still removed", content.includes("margin:0"), false);
	check("control: its winner is kept", content.includes("margin:1px"), true);
	check("what a plain revert beats is still removed", content.includes(".y{color:red}"), false);
	check("the plain revert is kept", content.includes(".y{color:revert}"), true);
	check("an important declaration in the lower layer beats the revert-layer above it", content.includes(".z{color:red!important}"), true);
	check("and the losing revert-layer is removed", content.includes(".z{color:revert-layer!important}"), false);
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
