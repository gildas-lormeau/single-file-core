import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// `:is()` and `:where()` take a forgiving selector list, so an empty one is valid and matches
// nothing. The pass that normalises a selector before querying it read the first item of that list
// without checking there was one, and the whole save failed with "Cannot read properties of null
// (reading 'data')". The stylesheet of github.com carries four rules written `:is(){…}`, two of
// them under `@media (pointer:coarse)`, which is how it was found (SingleFile #2058).
//
// A browser answering false to CSS.supports("selector(:is())") never reaches that code: Chrome 157
// does, and saved the page, where the failure was reported from Chrome 109. The DOM of these tests
// has no such answer to give, so the rule reaches the pass here.
const cases = [
	{
		label: "an empty :is() does not fail the save",
		css: ":is() { color: red } a { color: blue }",
		kept: ["a{color:blue}"]
	},
	{
		label: "an empty :where() does not fail the save",
		css: ":where() { color: red } a { color: blue }",
		kept: ["a{color:blue}"]
	},
	{
		label: "an empty :is() after a compound does not fail the save",
		css: "a:is() { color: red } a { color: blue }",
		kept: ["a{color:blue}"]
	},
	{
		label: "an empty :is() in a conditional rule does not fail the save",
		css: "@media (pointer: coarse) { :is() { color: red } } a { color: blue }",
		kept: ["a{color:blue}"]
	},
	{
		label: "an empty :is() in a selector list leaves the other selector matching",
		css: ":is(), a { color: blue }",
		kept: ["a{color:blue}"]
	},
	{
		label: "control: a :is() with an argument is still normalised and kept",
		css: ":is(a) { color: blue }",
		kept: [":is(a){color:blue}"]
	}
];

let failed = false;

for (const testCase of cases) {
	const page = html("<a>x</a>", "<style>" + testCase.css + "</style>");
	let content, errorMessage;
	try {
		content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, removeUnusedStyles: true });
	} catch (error) {
		errorMessage = error.message;
	}
	check(testCase.label, errorMessage, undefined);
	if (content) {
		const styleText = content.substring(content.indexOf("<style>"), content.indexOf("</style>"));
		testCase.kept.forEach(fragment => check(testCase.label + ", kept " + fragment, styleText.includes(fragment), true));
	}
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
