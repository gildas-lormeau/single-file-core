import "./dom.js";
import { Window } from "npm:happy-dom@20.14.5";

// A <link> stylesheet the page loaded can still fail when core fetches it again: a font host such as
// cloud.typography.com answers 403 to any request without the page's Referer, and in the Firefox
// extension no fetch core can make sends one. Measured on authorsguild.org: the saved page lost the
// whole stylesheet and its Sentinel fonts, and its titles fell back to Times. Firefox still exposes
// the rules of that cross-origin sheet to the content script, so when the fetch fails core now takes
// the rules of the live <link> instead. preProcessDoc numbers the live links before the page is
// serialized, and the number the copy carries leads back to the live element, never a URL match.
//
// The fallback is only for a fetch that failed (an exception or a status of 400 or more). A resource
// core leaves out on purpose, like blocked mixed content, must stay out, and a sheet whose rules
// cannot be read (Chromium throws a SecurityError) leaves the page as it was before.
import { capture, captureArchive, frameData, html, helper, WIN_ID_ATTRIBUTE_NAME } from "./common.js";

const LINK_ATTRIBUTE = helper.LINK_STYLESHEET_ATTRIBUTE_NAME;
const PAGE_URL = "https://example.com/page.html";
const SHEET_URL = "https://fonts.example.net/fonts.css";
const LIVE_CSS = ".x{--m:live-sheet}";
const FETCHED_CSS = ".x{--m:fetched-sheet}";

let failed = false;

// the case this exists for
{
	const content = await captureInline({ status: 403 }, [liveLink(SHEET_URL, [LIVE_CSS])]);
	check("a 403 stylesheet is replaced by the rules of the live sheet", content.includes("live-sheet"), true);
	check("the marker attribute does not reach the saved page", content.includes(LINK_ATTRIBUTE), false);
}
{
	const content = await captureInline({ status: 403 }, [liveLink(SHEET_URL, ["@font-face{font-family:\"Sentinel A\";src:url(\"data:font/woff2;base64,d09GMgABAAAAAA==\")}", LIVE_CSS])]);
	check("a data URI font of the live sheet is kept", content.includes("Sentinel A") && content.includes("data:font/woff2;base64,d09GMgABAAAAAA=="), true);
}
{
	const content = await captureInline({ onRequest() { throw new Error("network error"); } }, [liveLink(SHEET_URL, [LIVE_CSS])]);
	check("a stylesheet whose fetch throws is replaced too", content.includes("live-sheet"), true);
}
{
	const { content, resources } = await captureArchive(serve({ status: 403 }), { url: PAGE_URL, content: page(), linkStylesheets: [liveLink(SHEET_URL, [LIVE_CSS])] });
	check("the archive side falls back as well", (content + JSON.stringify(resources.stylesheets)).includes("live-sheet"), true);
}

// controls: the fetched content wins, and every case below leaves the page as it was
{
	const content = await captureInline({ body: FETCHED_CSS, contentType: "text/css" }, [liveLink(SHEET_URL, [LIVE_CSS])]);
	check("control: a fetched stylesheet is used as fetched", content.includes("fetched-sheet") && !content.includes("live-sheet"), true);
}
{
	const content = await captureInline({ status: 403 }, [liveLink(SHEET_URL, null)]);
	check("a live sheet whose rules throw adds nothing", content.includes("live-sheet"), false);
}
{
	const content = await captureInline({ status: 403 }, [liveLink(SHEET_URL, [])]);
	check("an empty live sheet adds nothing", content.includes("live-sheet"), false);
}
{
	const content = await captureInline({ status: 403 }, [liveLink("https://fonts.example.net/other.css", [LIVE_CSS])]);
	check("a live link with another URL is not used", content.includes("live-sheet"), false);
}
{
	const content = await captureInline({ status: 403 });
	check("without live links, as in a frame, nothing is added", content.includes("live-sheet"), false);
}
{
	const httpSheetURL = "http://fonts.example.net/fonts.css";
	const mixedPage = page(httpSheetURL);
	const content = await capture({ [PAGE_URL]: { body: mixedPage }, [httpSheetURL]: { status: 403 } }, { url: PAGE_URL, content: mixedPage, blockMixedContent: true, linkStylesheets: [liveLink(httpSheetURL, [LIVE_CSS])] });
	check("blocked mixed content stays blocked", content.includes("live-sheet"), false);
}

// a frame inherits the options of its parent, whose live links are not the frame's: its own link
// numbered 0 must not be read from the parent's link 0, even with the same URL
{
	const frameURL = "https://example.com/frame.html";
	const framePage = page();
	const hostPage = html("<iframe src=\"" + frameURL + "\" " + WIN_ID_ATTRIBUTE_NAME + "=\"0.1\"></iframe>", "<link rel=stylesheet href=\"" + SHEET_URL + "\" " + LINK_ATTRIBUTE + "=0>");
	const content = await capture({ [PAGE_URL]: { body: hostPage }, [frameURL]: { body: framePage }, [SHEET_URL]: { status: 403 } }, { url: PAGE_URL, content: hostPage, frames: [frameData("0.1", frameURL, framePage)], linkStylesheets: [liveLink(SHEET_URL, [LIVE_CSS])] });
	check("the host page falls back", content.split("<iframe")[0].includes("live-sheet"), true);
	check("the frame does not use the host's live link", content.split("<iframe")[1].includes("live-sheet"), false);
}

// preProcessDoc numbers the live links in document order and postProcessDoc removes the numbers
{
	const window = new Window({ url: PAGE_URL });
	const document = window.document;
	globalThis.HTMLElement = window.HTMLElement;
	globalThis.SVGElement = window.SVGElement;
	document.head.innerHTML = "<link rel=stylesheet href=\"a.css\"><link rel=icon href=\"i.png\"><link rel=\"alternate stylesheet\" title=t href=\"b.css\">";
	const docData = helper.preProcessDoc(document, window, {});
	const links = document.querySelectorAll("link");
	check("preProcessDoc returns the stylesheet links", docData.linkStylesheets.length == 2 && docData.linkStylesheets[0] == links[0] && docData.linkStylesheets[1] == links[2], true);
	check("each one is numbered", [links[0], links[1], links[2]].map(link => link.getAttribute(LINK_ATTRIBUTE)).join(","), "0,,1");
	helper.postProcessDoc(document, docData.markedElements, docData.invalidElements);
	check("postProcessDoc removes the numbers", document.querySelectorAll("[" + LINK_ATTRIBUTE + "]").length, 0);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function page(sheetURL = SHEET_URL) {
	return html("<p class=x>text</p>", "<link rel=stylesheet href=\"" + sheetURL + "\" " + LINK_ATTRIBUTE + "=0>");
}

function serve(sheetResource) {
	return { [PAGE_URL]: { body: page() }, [SHEET_URL]: sheetResource };
}

function captureInline(sheetResource, linkStylesheets) {
	return capture(serve(sheetResource), { url: PAGE_URL, content: page(), linkStylesheets });
}

function liveLink(href, cssTexts) {
	return {
		href,
		sheet: {
			get cssRules() {
				if (cssTexts) {
					return cssTexts.map(cssText => ({ cssText }));
				} else {
					throw new globalThis.DOMException("Cannot access rules", "SecurityError");
				}
			}
		}
	};
}

function check(label, actual, expected) {
	const pass = actual === expected;
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
