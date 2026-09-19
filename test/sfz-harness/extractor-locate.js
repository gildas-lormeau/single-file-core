// §4.5's locate step, run against pages the writer produced, with the bootstrap those pages carry.
// The bootstrap is lifted out of the page text and evaluated here with the globals it binds from
// globalThis: a happy-dom document parsed from the page, happy-dom's NodeFilter, the vendor
// inflater, and an XMLHttpRequest whose every request fails, which is how a file: load reaches
// page-text extraction (§4.1). What comes back is the recovered ZIP region as a Blob, compared
// byte for byte with the region in the file, or the error the extractor threw.
//
// Six layouts: the comment rung alone, an element rung alone, and each with a second candidate
// appended -- a duplicate of the same kind, which §7.4 says MUST be refused, a candidate of the
// other kind, which the tie-break settles in favour of the element, and an element bearing the
// identifier that is not a wrapper rung, which is never a candidate.
//
// One shim: a browser's input stream preprocessing turns CR LF and lone CR into LF before the
// tokenizer sees them, which is what the payload's newline codes describe (§5.5), and happy-dom's
// parser does not, so the text is normalized here before it is parsed.
/* global clearTimeout */
import "./dom-stub.js";
import { Window } from "npm:happy-dom@20.14.5";
import { inflateRaw } from "../../vendor/zip/zip.js";
import { makePageData, makeOptions, runProcess, sameBytes } from "./common.js";

const window = new Window();
const DECODER = new TextDecoder("windows-1252");
const LOCAL_HEADER = "PK\x03\x04";

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

class FailingXMLHttpRequest {
	open() { }
	send() {
		setTimeout(() => this.onerror());
	}
	abort() { }
}

function bootstrapOf(text) {
	const start = text.indexOf("async function getContent()");
	const end = text.indexOf(")().then(globalThis.bootstrap)", start);
	return new Function("return " + text.slice(start, end))();
}

async function locate(text) {
	const document = new window.DOMParser().parseFromString(text.replace(/\r\n?/g, "\n"), "text/html");
	Object.assign(globalThis, { document, NodeFilter: window.NodeFilter, zip: { inflateRaw }, XMLHttpRequest: FailingXMLHttpRequest });
	const { error: consoleError } = console;
	console.error = () => { };
	let timer;
	try {
		const blob = await Promise.race([
			bootstrapOf(text)(),
			new Promise((_, reject) => timer = setTimeout(() => reject(new Error("the bootstrap never settled")), 5000))
		]);
		return { bytes: new Uint8Array(await blob.arrayBuffer()) };
	} catch (error) {
		return { error: error.message };
	} finally {
		clearTimeout(timer);
		console.error = consoleError;
	}
}

function regionOf(bytes, text, length) {
	const start = text.indexOf(LOCAL_HEADER);
	return bytes.subarray(start, start + length);
}

// a stored resource carrying --> pushes the ZIP region off the comment rung and onto the script
// element rung, the first element rung of the ladder
function triggerResource(literal) {
	const content = new Uint8Array(2048).fill(0x21);
	content.set(new TextEncoder().encode(literal), 128);
	return { name: "images/trigger.png", extension: ".png", content, url: "https://example.com/trigger.png" };
}

async function page(seed, resources = []) {
	const pageData = makePageData(seed, 4 * 1024);
	pageData.resources.images = resources;
	const { bytes } = await runProcess(pageData, makeOptions());
	const text = DECODER.decode(bytes);
	return { bytes, text };
}

const comment = await page(40);
const element = await page(41, [triggerResource("-->")]);
check("the comment page wraps the region in a comment", comment.text.includes("<!--sfz-data"), true);
check("the element page wraps the region in the script rung", element.text.includes("<script type=sfz-data id=sfz-data>"), true);

for (const [label, { bytes, text }, appended, expected] of [
	["comment rung", comment, "", "region"],
	["comment rung, a second comment appended", comment, "<!--sfz-data-->", "refused"],
	["comment rung, a non-rung element with the identifier appended", comment, "<div id=sfz-data></div>", "region"],
	["element rung", element, "", "region"],
	["element rung, a comment appended: the element wins", element, "<!--sfz-data-->", "region"],
	["element rung, a second rung element appended", element, "<script type=sfz-data id=sfz-data></script>", "refused"]
]) {
	const result = await locate(text + appended);
	if (expected == "region") {
		check(`${label}: extracts`, result.error, undefined);
		check(`${label}: the recovered region is the file's`, Boolean(result.bytes) && sameBytes(result.bytes, regionOf(bytes, text, result.bytes.length)), true);
	} else {
		check(`${label}: is refused`, result.error, "Multiple zip data candidates found");
	}
}

Deno.exit(failed ? 1 : 0);
