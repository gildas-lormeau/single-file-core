import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"></svg>";
const CSS = ".stale-retry { color: red; }";

let failed = false;

// A fetch in force-cache mode replays a stored response without asking the server, whatever its status,
// so a 502 served during a short outage comes back for as long as the cache entry lives. Core asks once
// more in reload mode, which is the only mode that discards the stored response and goes to the network.
{
	const icon = resource(SVG, "image/svg+xml", 502, () => icon.status = 200);
	const stylesheet = resource(CSS, "text/css", 503, () => stylesheet.status = 200);
	const content = await capture({ "https://example.com/icon.svg": icon, "https://example.com/style.css": stylesheet }, {
		url: PAGE_URL,
		content: html("<img src=\"https://example.com/icon.svg\">", "<link rel=\"stylesheet\" href=\"https://example.com/style.css\">")
	});
	check("the image is requested twice", icon.requests.length, 2);
	check("the second request of the image is in reload mode", icon.requests[1], "reload");
	check("the first request of the image leaves the cache mode to the fetch", icon.requests[0], undefined);
	check("the image is embedded", content.includes("data:image/svg+xml"), true);
	check("the stylesheet is requested twice", stylesheet.requests.length, 2);
	check("the second request of the stylesheet is in reload mode", stylesheet.requests[1], "reload");
	check("the stylesheet is embedded", content.includes("stale-retry"), true);
}

// One retry only: a server that keeps failing is asked twice, never more.
{
	const icon = resource(SVG, "image/svg+xml", 502);
	await capture({ "https://example.com/icon.svg": icon }, { url: PAGE_URL, content: html("<img src=\"https://example.com/icon.svg\">") });
	check("a persistent error is requested twice", icon.requests.length, 2);
}

// A success and a client error are not retried: a 404 the page saw is part of what the page displayed.
{
	const icon = resource(SVG, "image/svg+xml", 200);
	const missing = resource(SVG, "image/svg+xml", 404);
	await capture({ "https://example.com/icon.svg": icon, "https://example.com/missing.svg": missing }, {
		url: PAGE_URL,
		content: html("<img src=\"https://example.com/icon.svg\"><img src=\"https://example.com/missing.svg\">")
	});
	check("a success is requested once", icon.requests.length, 1);
	check("a client error is requested once", missing.requests.length, 1);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

// The status is read after onRequest, so a change made on the second request shapes the second answer.
function resource(body, contentType, status, onRetry = () => { }) {
	const result = {
		body,
		contentType,
		status,
		requests: [],
		onRequest: fetchOptions => {
			result.requests.push(fetchOptions && fetchOptions.cache);
			if (result.requests.length == 2) {
				onRetry();
			}
		}
	};
	return result;
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
