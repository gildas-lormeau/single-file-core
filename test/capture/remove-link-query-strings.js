import "./dom.js";

// removeLinkQueryStrings drops the query string of the links of the saved page, where signed URLs,
// session identifiers and tracking parameters live. It runs after the hrefs are resolved, keeps
// the fragment, and leaves alone the links whose scheme is neither http nor https, nor relative:
// a mailto: subject or a javascript: expression is not a query. It touches only the links, so a
// resource URL, a form action or the saved URL of the page keep their query.
import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/dir/page.html?page=1";
const PAGE = html(
	"<a id=\"relative\" href=\"other.html?token=abc&amp;x=1\">relative</a>" +
	"<a id=\"absolute\" href=\"https://cdn.example.com/file.pdf?X-Amz-Signature=secret\">absolute</a>" +
	"<a id=\"fragment\" href=\"page.html?sid=42#section\">fragment</a>" +
	"<a id=\"plain\" href=\"https://example.com/plain.html\">plain</a>" +
	"<a id=\"mailto\" href=\"mailto:me@example.com?subject=hi\">mailto</a>" +
	"<a id=\"javascript\" href=\"javascript:go('a?b')\">javascript</a>" +
	"<map name=\"m\"><area href=\"map.html?k=v\" shape=\"rect\" coords=\"0,0,1,1\"></map>" +
	"<form action=\"submit.html?form=1\"><input type=\"submit\"></form>" +
	"<img src=\"https://example.com/img.png?v=2\">");
const RESOURCES = { [PAGE_URL]: { body: PAGE }, "https://example.com/img.png?v=2": { body: "", headers: { "content-type": "image/png" } } };

let failed = false;

{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, removeLinkQueryStrings: true });
	check("a relative link loses its query", href(content, "relative"), "https://example.com/dir/other.html");
	check("an absolute link loses its query", href(content, "absolute"), "https://cdn.example.com/file.pdf");
	check("the fragment is kept", href(content, "fragment"), "https://example.com/dir/page.html#section");
	check("a link without a query is untouched", href(content, "plain"), "https://example.com/plain.html");
	check("a mailto: link keeps its subject", href(content, "mailto"), "mailto:me@example.com?subject=hi");
	check("a javascript: link is untouched", href(content, "javascript"), "javascript:go('a?b')");
	check("an area loses its query", /<area[^>]*href="https:\/\/example\.com\/dir\/map\.html"/.test(content), true);
	check("a form action keeps its query", content.includes("submit.html?form=1"), true);
	check("the canonical link keeps the query of the saved URL", content.includes("<link rel=\"canonical\" href=\"https://example.com/dir/page.html?page=1\">"), true);
}
{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE, removeLinkQueryStrings: true, resolveLinks: false });
	check("an unresolved relative link loses its query", href(content, "relative"), "other.html");
	check("and keeps its fragment", href(content, "fragment"), "page.html#section");
}
{
	const content = await capture(RESOURCES, { url: PAGE_URL, content: PAGE });
	check("control: the queries stay without the option", href(content, "relative"), "https://example.com/dir/other.html?token=abc&amp;x=1");
	check("control: the signed URL stays without the option", href(content, "absolute"), "https://cdn.example.com/file.pdf?X-Amz-Signature=secret");
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function href(content, id) {
	const match = content.match(new RegExp("<a[^>]*id=\"?" + id + "\"?[^>]*href=\"([^\"]*)\"")) || content.match(new RegExp("<a[^>]*href=\"([^\"]*)\"[^>]*id=\"?" + id + "\"?"));
	return match ? match[1] : null;
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
