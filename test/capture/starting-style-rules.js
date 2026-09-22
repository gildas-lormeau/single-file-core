import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// A standalone @starting-style block used to be minified as an unconditional group: its declarations
// joined the same cascade context as the normal rules, won the order tie-break against the earlier
// rule on the same element, and the normal declaration was pruned as losing. The saved page then
// kept only the starting style, so the element stayed in its before-transition state. The block is
// now a conditional context like @media, whose declarations never compete with the normal ones.
const CSS = [
	".toast { background: red }",
	"@starting-style { .toast { background: transparent } }",
	".late { color: red; @starting-style { color: blue } }",
	"@starting-style { .absent { color: red } }",
	".k { color: red }",
	".k { color: blue }"
].join("\n");
const PAGE = html("<div class=\"toast\">t</div><p class=\"late\">l</p><p class=\"k\">k</p>", "<style>" + CSS + "</style>");

const resources = {
	[PAGE_URL]: { body: PAGE }
};

let failed = false;

{
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, removeUnusedStyles: true });
	check("the normal rule survives next to its starting style", content.includes(".toast{background:red}"), true);
	check("the starting style is kept", content.includes("@starting-style{.toast{background:transparent}}"), true);
	check("a starting style nested in the rule is untouched", content.includes(".late{color:red;@starting-style{color:blue}}"), true);
	check("a starting style whose subject is absent is still removed", content.includes(".absent"), false);
	check("control: a losing declaration outside the block is still removed", content.includes(".k{color:red}"), false);
	check("control: the winning declaration is kept", content.includes(".k{color:blue}"), true);
}

{
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, removeUnusedStyles: false });
	check("the pass off keeps the unused starting style", content.includes(".absent"), true);
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
