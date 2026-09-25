import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

let failed = false;

// An at-rule the pass does not know used to be read as an unconditional wrapper, so the rules inside
// it competed with every other rule as if they always applied. `@when` and `@else` (css-conditional-5)
// are the first such wrappers the drafts define: their two blocks are mutually exclusive, yet the
// `@else` rule, written later with the same specificity, was taken as the winner, the `@when` rule
// was pruned as its loser, and the emptied `@when` went with it. Measured in the Chrome 153 and the
// Firefox save. An unknown at-rule is now a conditional context of its own, which is what an
// at-rule holding style rules is unless the pass knows better, so its rules neither prune nor get
// pruned by rules outside it.
{
	const css = [
		"@when media(min-width: 1px) { #a { color: red } } @else { #a { color: blue } }",
		"#b { color: red } @future-wrapper { #b { color: blue } }",
		"@future-wrapper { #c { color: red } } #c { color: blue }",
		"#d { color: red } #d { color: blue }",
		"@future-wrapper { #nothing { color: red } }"
	].join("\n");
	const page = html("<p id=\"a\">a</p><p id=\"b\">b</p><p id=\"c\">c</p><p id=\"d\">d</p>", "<style>" + css + "</style>");
	const content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, removeUnusedStyles: true });
	check("the @when block is kept", content.includes("#a{color:red}"), true);
	check("and so is the @else block", content.includes("#a{color:blue}"), true);
	check("an unconditional rule is not pruned by one inside an unknown at-rule", content.includes("#b{color:red}"), true);
	check("a rule inside an unknown at-rule is not pruned by an unconditional one", content.includes("#c{color:red}"), true);
	check("control: two unconditional rules still prune", content.includes("#d{color:red}"), false);
	check("control: a rule inside an unknown at-rule that matches nothing is still removed", content.includes("#nothing"), false);
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
