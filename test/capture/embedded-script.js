import "./dom.js";

// embeddedScript is JavaScript the user wants in the saved page: a scorecard shows one innings per
// tab, the saved page has no script to switch them, and the user's own ten lines can. The code is
// appended as the last element of the body after the scripts of the page have been removed, so it
// survives blockScripts, and it stays out of the frames, which are serialized by their own runner.
import { capture, frameData, html, WIN_ID_ATTRIBUTE_NAME } from "./common.js";

const CODE = "document.title = \"embedded\";";
const PAGE_URL = "https://example.com/page.html";
const FRAME_URL = "https://example.com/frame.html";
const PAGE = html("<p>page</p><script>document.title = \"page\";</script><iframe src=\"" + FRAME_URL + "\" " + WIN_ID_ATTRIBUTE_NAME + "=\"0.1\"></iframe>");
const FRAME_PAGE = html("<p>frame</p>");
const RESOURCES = { [PAGE_URL]: { body: PAGE }, [FRAME_URL]: { body: FRAME_PAGE } };

let failed = false;

{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, blockScripts: true, embeddedScript: CODE });
	check("the code is in the saved page", content.includes("<script>" + CODE + "</script>"), true);
	check("as the last element of the body", content.replace(/\s+$/, "").endsWith("<script>" + CODE + "</script></body></html>"), true);
	check("control: the scripts of the page are removed", content.includes("document.title = \"page\""), false);
}
{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, blockScripts: false, embeddedScript: CODE });
	check("the code is in the saved page when the scripts of the page are kept", content.includes("<script>" + CODE + "</script>"), true);
	check("after them", content.indexOf("document.title = \"page\"") < content.indexOf(CODE), true);
}
{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, blockScripts: true, embeddedScript: CODE, frames: [frameData("0.1", FRAME_URL, FRAME_PAGE)] });
	check("the frame is in the saved page", content.includes("frame</p>"), true);
	check("the code is inserted once, in the top document only", content.split(CODE).length - 1, 1);
}
{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, blockScripts: true });
	check("control: nothing is inserted without the option", /<script>[^<]/.test(content), false);
}
{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, blockScripts: true, embeddedScript: "" });
	check("control: nothing is inserted with an empty value", /<script>[^<]/.test(content), false);
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
