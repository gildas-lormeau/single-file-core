// §8.2 of doc/singlefile-archive.md is a table of byte offsets. Nothing could check it: the
// specimen it describes is saved from a live URL through the CLI, so it needs a network and a
// browser and has never existed in this repository. Three of its rows were wrong for an unknown
// length of time — the doctype is 15 bytes and nothing separates it from the root element start
// tag, so the first three offsets were each one too high — and §4.2's derived figure is stale by
// about 20 KB. This builds an equivalent specimen from the harness, deterministically and with no
// network, and asserts both the offsets the document prints and the structural relations they
// stand for. A writer change that moves the layout fails here instead of rotting in the prose.
import "./dom-stub.js";
import { makeOptions, runProcess, freezeDate } from "./common.js";

const zipScript = await Deno.readTextFile(new URL("../../vendor/zip/zip.min.js", import.meta.url));

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

// a two-entry archive, matching the shape §8.2 documents: index.html and manifest.json only
function makeSpecimenPageData() {
	return {
		title: "Example Domain",
		doctype: "<!DOCTYPE html>",
		content: "<html><body><h1>Example Domain</h1><p>" + "specimen ".repeat(64) + "</p></body></html>",
		comment: "\n url: https://example.com/ \n saved date: Wed Aug 13 2025 \n",
		resources: { stylesheets: [], images: [] }
	};
}

const restoreDate = freezeDate();
const { bytes } = await runProcess(makeSpecimenPageData(), makeOptions({
	zipScript,
	url: "https://example.com/",
	insertCanonicalLink: false
}));
restoreDate();

const text = new TextDecoder("windows-1252").decode(bytes);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const at = needle => text.indexOf(needle);

const doctype = at("<!DOCTYPE html>");
const root = at("<html data-sfz>");
const charset = at("<meta charset=");
const charsetEnd = charset + text.substring(charset).indexOf(">") + 1;
const comment = at("<!--\n url:");
const title = at("<title>");
const style = at("<style>");
const body = at("<body hidden>");
const script = at("<script>");
const wrapperStart = at("<!--sfz-data");
const region = at("PK\x03\x04");
const central = text.indexOf("PK\x01\x02", region);
const eocd = text.indexOf("PK\x05\x06", central);
const payload = at("<sfz-extra-data>");
const endTags = at("</body></html>");

console.log(`specimen: ${bytes.length} bytes`);
console.log([
	["html-prologue begins", doctype], ["root element start tag", root],
	["charset declaration", charset], ["implementation comment", comment],
	["title", title], ["stylesheet", style], ["body hidden", body],
	["bootstrap script", script], ["wrapper start tag", wrapperStart],
	["ZIP region begins", region], ["central directory", central],
	["EOCD", eocd], ["recovery payload", payload], ["end tags", endTags]
].map(([label, offset]) => `  ${String(offset).padStart(7)}  ${label}`).join("\n"));

// the prologue order, which §3.1 and §6.1 both got backwards until 2026-09-01: the charset
// declaration precedes the comment, because the comment carries an unbounded URL
check("doctype opens the file", doctype, 0);
check("root element start tag follows the doctype with nothing between", root, doctype + "<!DOCTYPE html>".length);
check("charset declaration follows the root element start tag", charset, root + "<html data-sfz>".length);
check("the comment begins where the charset declaration ends", comment, charsetEnd);
check("the charset declaration is inside the prescan window", charsetEnd <= 1024, true);

// the ordering the byte map asserts, region by region
check("prologue order holds end to end",
	[doctype, root, charset, comment, title, style, body, script, wrapperStart, region, central, eocd, payload, endTags]
		.every((offset, index, all) => offset >= 0 && (index === 0 || offset > all[index - 1])), true);

// the identifier sits inside the wrapper, so the region starts 12 bytes after the tag (§1.3)
check("the identifier precedes the region by the length of the start tag", region - wrapperStart, "<!--sfz-data".length);

// offsets are absolute file positions, not region-relative (§5.3)
check("the EOCD directory offset is an absolute file position", view.getUint32(eocd + 16, true), central);
check("the EOCD counts both entries", view.getUint16(eocd + 10, true), 2);
check("the EOCD declares no archive comment", view.getUint16(eocd + 20, true), 0);

// the region ends at the wrapper close tag, and the payload describes it minus the two
// comment-length bytes (§4.5)
const wrapperEnd = text.indexOf("-->", eocd);
check("the wrapper closes after the EOCD", wrapperEnd > eocd, true);
check("the appended run fits the budget", bytes.length - wrapperEnd <= 65535, true);

// the entries the document names, in the order it names them (§4.2)
let records = 0;
for (let index = text.indexOf("PK\x01\x02"); index != -1; index = text.indexOf("PK\x01\x02", index + 1)) {
	records++;
}
check("the central directory holds two records", records, 2);
check("index.html is listed first", text.indexOf("index.html", central) < text.indexOf("manifest.json", central), true);

Deno.exit(failed ? 1 : 0);
