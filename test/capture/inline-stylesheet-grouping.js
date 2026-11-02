import "./dom.js";

// groupDuplicateStylesheets on the inline side of the helper split: a repeated <style> is written
// once, as a master in the head with media="not all", and every copy becomes a placeholder whose
// onload handler copies the text from the master. The origin element, the one the group was built
// from, must become a placeholder too: it used to keep its full text next to the master, so a page
// built from web components that all adopt the same stylesheet carried it twice (a 250 KB sheet on
// a Reddit listing, 228 KB on a page embedding replayweb.page).
import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/grouping.html";
const SHARED = "p { color: rgb(1, 2, 3) }";
const SHARED_MINIFIED = "p{color:rgb(1,2,3)}";
const UNIQUE = "h1 { color: rgb(9, 9, 9) }";
const PAGE = html("<style>" + SHARED + "</style><p>a</p><style>" + UNIQUE + "</style><div><style>" + SHARED + "</style><p>b</p></div><style>" + SHARED + "</style>");

let failed = false;

{
	const content = await capture({ [PAGE_URL]: { body: PAGE } }, { url: PAGE_URL, content: PAGE, removeUnusedStyles: false, groupDuplicateStylesheets: true });
	check("the shared css is written once", countMatches(content, SHARED_MINIFIED), 1);
	check("as a master in the head", /<head>(?:(?!<\/head>).)*<style media="not all" data-sf-duplicate-stylesheet-ref="?\d+"?>p\{color:rgb\(1,2,3\)\}<\/style>/s.test(content), true);
	check("every copy is a placeholder, the origin included", countMatches(content, "<style onload="), 3);
	check("the placeholders hold no css", countMatches(content, "/* */</style>"), 3);
	check("the unique stylesheet stays inline", content.includes("h1{color:rgb(9,9,9)}"), true);
	check("and is not a placeholder", /<style>h1\{color:rgb\(9,9,9\)\}<\/style>/.test(content), true);
	check("the cleanup script is there", content.includes("data-sf-duplicate-stylesheet-ref]\").forEach(e=>e.remove())"), true);
}
{
	const content = await capture({ [PAGE_URL]: { body: PAGE } }, { url: PAGE_URL, content: PAGE, removeUnusedStyles: false, groupDuplicateStylesheets: false });
	check("control: without the option every copy keeps its css", countMatches(content, SHARED_MINIFIED), 3);
	check("control: and there is no master", content.includes("data-sf-duplicate-stylesheet-ref"), false);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function countMatches(text, needle) {
	return text.split(needle).length - 1;
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
