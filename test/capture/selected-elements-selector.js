import "./dom.js";

// selectedElementsSelector is "save selection" for a caller with no user: the elements matching
// the selector are marked the way the content script marks a selection, with their descendants and
// their ancestors, and removeUnselectedElements then keeps them, hides what comes before and removes
// what comes after. It runs before removedElementsSelector, so a selector that removes part of what
// was kept still applies. A selector matching nothing, or one the parser rejects, saves the whole page.
import { capture, html, helper } from "./common.js";

const SELECTED = helper.SELECTED_CONTENT_ATTRIBUTE_NAME;
const PAGE_URL = "https://example.com/page.html";
const PAGE = html(
	"<header>top</header>" +
	"<main><nav>menu</nav><article><h1>title</h1><p class=\"ad\">advert</p><p>body text</p></article><aside>related</aside></main>" +
	"<section><article>second article</article></section>" +
	"<footer>bottom</footer>");
const RESOURCES = { [PAGE_URL]: { body: PAGE } };

let failed = false;

{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, selectedElementsSelector: "main article" });
	check("the matching element is kept with its descendants", content.includes("<h1>title</h1>") && content.includes("body text"), true);
	check("its ancestors are kept", content.includes("<main") && content.includes("<article"), true);
	check("the sibling before it is hidden", /<nav[^>]*visibility:\s*hidden/.test(content), true);
	check("and emptied", content.includes("menu"), false);
	check("the sibling after it is removed", content.includes("related"), false);
	check("the elements after the kept branch are removed", content.includes("second article") || content.includes("bottom"), false);
	check("the elements before the kept branch are hidden", /<header[^>]*visibility:\s*hidden/.test(content), true);
	check("the marks are removed", content.includes(SELECTED), false);
}
{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, selectedElementsSelector: "article" });
	check("two matches in two branches are both kept", content.includes("body text") && content.includes("second article"), true);
	check("what lies between them is removed", content.includes("related"), false);
}
{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, selectedElementsSelector: "main article", removedElementsSelector: ".ad" });
	check("removedElementsSelector applies inside the kept elements", content.includes("advert"), false);
	check("and leaves the rest of them", content.includes("body text"), true);
}
{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, selectedElementsSelector: "video" });
	check("control: a selector matching nothing saves the whole page", content.includes("top</header>") && content.includes("related") && content.includes("bottom</footer>"), true);
}
{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, selectedElementsSelector: "article[" });
	check("control: a selector the parser rejects saves the whole page", content.includes("top</header>") && content.includes("related") && content.includes("bottom</footer>"), true);
}
{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE });
	check("control: nothing changes without the option", content.includes("top</header>") && content.includes("related") && content.includes("bottom</footer>") && !content.includes("visibility"), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
