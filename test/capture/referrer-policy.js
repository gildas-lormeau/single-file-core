import { capture, captureArchive, html } from "./common.js";

// The browser computes the Referer of a request from the referrerpolicy attribute of the element that
// made it, and core fetched every resource with the page's policy instead. Measured with the CLI on a
// local page: for <img referrerpolicy=no-referrer> the browser sent no Referer and both core fetches
// (in the page, then from Node) sent the page origin; for referrerpolicy=unsafe-url the browser sent
// the page URL and core the origin. So a no-referrer image on a host that only accepts an empty Referer
// was refused, and core sent more than the browser had. Core now passes the element's policy as the
// standard `referrerPolicy` fetch option, for the elements that carry the attribute and that core
// fetches for: <img> (and a <source> of its <picture>), <link> and <script>. The batch key includes it,
// because one URL fetched under two policies is two different requests.

const PAGE_URL = "https://example.com/page.html";

let failed = false;

{
	const policies = {};
	const record = name => ({ onRequest: fetchOptions => (policies[name] ||= []).push(fetchOptions.referrerPolicy === undefined ? "none" : String(fetchOptions.referrerPolicy)) });
	const page = html(
		"<img src=\"no-referrer.png\" referrerpolicy=\"no-referrer\">" +
		"<img src=\"unsafe.png\" referrerpolicy=\"Unsafe-URL\">" +
		"<img src=\"padded.png\" referrerpolicy=\" no-referrer \">" +
		"<img src=\"default.png\">" +
		"<img src=\"invalid.png\" referrerpolicy=\"everything\">" +
		"<img src=\"shared.png\"><img src=\"shared.png\" referrerpolicy=\"no-referrer\">" +
		"<picture><source srcset=\"source.png\"><img src=\"fallback.png\" referrerpolicy=\"origin\"></picture>" +
		"<video poster=\"poster.png\" referrerpolicy=\"no-referrer\"></video>" +
		"<script src=\"script.js\" referrerpolicy=\"same-origin\"></script>",
		"<link rel=stylesheet href=\"style.css\" referrerpolicy=\"no-referrer\">");
	await capture({
		[PAGE_URL]: { body: page },
		"https://example.com/no-referrer.png": { body: "PNG", contentType: "image/png", ...record("noReferrer") },
		"https://example.com/unsafe.png": { body: "PNG", contentType: "image/png", ...record("unsafe") },
		"https://example.com/padded.png": { body: "PNG", contentType: "image/png", ...record("padded") },
		"https://example.com/default.png": { body: "PNG", contentType: "image/png", ...record("default") },
		"https://example.com/invalid.png": { body: "PNG", contentType: "image/png", ...record("invalid") },
		"https://example.com/shared.png": { body: "PNG", contentType: "image/png", ...record("shared") },
		"https://example.com/source.png": { body: "PNG", contentType: "image/png", ...record("source") },
		"https://example.com/fallback.png": { body: "PNG", contentType: "image/png", ...record("fallback") },
		"https://example.com/poster.png": { body: "PNG", contentType: "image/png", ...record("poster") },
		"https://example.com/script.js": { body: "1", contentType: "text/javascript", ...record("script") },
		"https://example.com/style.css": { body: "p{color:red}", contentType: "text/css", ...record("stylesheet") }
	}, { url: PAGE_URL, content: page, blockScripts: false });
	check("an image passes its policy", String(policies.noReferrer), "no-referrer");
	check("the attribute is matched case-insensitively", String(policies.unsafe), "unsafe-url");
	check("but not trimmed, as in a browser", String(policies.padded), "none");
	check("an image without the attribute passes none", String(policies.default), "none");
	check("an invalid value passes none", String(policies.invalid), "none");
	check("one URL under two policies is fetched twice", String(policies.shared && policies.shared.sort()), "no-referrer,none");
	check("a source of a picture takes the policy of its img", String(policies.source), "origin");
	check("the img of the picture passes it too", String(policies.fallback), "origin");
	check("a video, which has no such attribute, passes none", String(policies.poster), "none");
	check("a script passes its policy", String(policies.script), "same-origin");
	check("a stylesheet link passes its policy", String(policies.stylesheet), "no-referrer");
}

// a resource without a policy must still be fetched: the batch key is JSON, so a missing policy came
// back from it as null, which fetch rejects. Measured with the CLI: <input type=image>, the background
// attribute and every url() of a stylesheet were saved as data:, while an <img> survived through its
// second, direct fetch
{
	const page = html("<input type=image src=\"input.png\"><table background=\"table.png\"><tr><td>x</td></tr></table><p class=x>x</p>", "<style>.x{background-image:url(css.png)}</style>");
	const content = await capture({
		[PAGE_URL]: { body: page },
		"https://example.com/input.png": { body: "INPUT", contentType: "image/png" },
		"https://example.com/table.png": { body: "TABLE", contentType: "image/png" },
		"https://example.com/css.png": { body: "CSS", contentType: "image/png" }
	}, { url: PAGE_URL, content: page });
	check("an input image without a policy is saved", content.includes("data:image/png;base64," + btoa("INPUT")), true);
	check("a background attribute without a policy is saved", content.includes("data:image/png;base64," + btoa("TABLE")), true);
	check("a url() of a stylesheet is saved", content.includes("data:image/png;base64," + btoa("CSS")), true);
}

// the archive side goes through its own helper
{
	const policies = {};
	const record = name => ({ onRequest: fetchOptions => (policies[name] ||= []).push(fetchOptions.referrerPolicy === undefined ? "none" : String(fetchOptions.referrerPolicy)) });
	const page = html("<img src=\"no-referrer.png\" referrerpolicy=\"no-referrer\"><img srcset=\"srcset.png\" referrerpolicy=\"origin\">", "<link rel=stylesheet href=\"style.css\" referrerpolicy=\"no-referrer\">");
	await captureArchive({
		[PAGE_URL]: { body: page },
		"https://example.com/no-referrer.png": { body: "PNG", contentType: "image/png", ...record("noReferrer") },
		"https://example.com/srcset.png": { body: "PNG", contentType: "image/png", ...record("srcset") },
		"https://example.com/style.css": { body: "p{color:red}", contentType: "text/css", ...record("stylesheet") }
	}, { url: PAGE_URL, content: page });
	check("archive: an image passes its policy", String(policies.noReferrer), "no-referrer");
	check("archive: a srcset candidate passes the policy of its img", String(policies.srcset), "origin");
	check("archive: a stylesheet link passes its policy", String(policies.stylesheet), "no-referrer");
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
