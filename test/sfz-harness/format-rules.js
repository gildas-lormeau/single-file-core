import "./dom-stub.js";
import { makePageData, makeOptions, runProcess, mulberry32 } from "./common.js";
import { ZipReader, ZipWriter, BlobReader } from "../../vendor/zip/zip.js";

// the quote is there because the escaper the title shares with the table of contents encodes
// it for an attribute value, where it matters, and a title has to round-trip through that too
const TITLE = "日本語 — café & <b> \"quoted\"";
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

function decodeText(bytes) {
	return new TextDecoder("windows-1252").decode(bytes);
}

function decodeReferences(text) {
	return text.replace(/&#(\d+);/g, (match, codePoint) => String.fromCodePoint(Number(codePoint)));
}

function imageResource(url) {
	return { name: "images/0.png", extension: ".png", content: new Uint8Array(1024).fill(0x21), url };
}

{
	const options = makeOptions();
	const pageData = makePageData(1, 4 * 1024);
	pageData.title = TITLE;
	const { bytes } = await runProcess(pageData, options);
	const title = decodeText(bytes).match(/<title>(.*?)<\/title>/)[1];
	check("title survives universal mode", title.length > 0, true);
	check("title is pure ASCII", /^[\x20-\x7e]*$/.test(title), true);
	check("title decodes to the original", decodeReferences(title), TITLE);
}

{
	const options = makeOptions({ password: "secret", insertCanonicalLink: true, url: "https://example.com/secret-page" });
	const pageData = makePageData(2, 4 * 1024);
	pageData.title = TITLE;
	pageData.comment = "\n url: https://example.com/secret-page \n";
	pageData.resources.images.push(imageResource("https://example.com/secret-image.png"));
	const { bytes } = await runProcess(pageData, options);
	const text = decodeText(bytes);
	check("title withheld from a protected archive", text.includes("<title></title>"), true);
	check("resource url absent from a protected archive", text.includes("secret-image.png"), false);
	// the wrapper ladder hides the zip data in a comment of its own, so only the text
	// of the SingleFile comment tells whether it was written
	check("comment withheld from a protected archive", text.includes("<!--\n url:"), false);
	check("canonical link withheld from a protected archive", text.includes("<link rel=canonical"), false);
	check("page url absent from a protected archive", text.includes("secret-page"), false);
	const zipReader = new ZipReader(new BlobReader(new Blob([bytes])));
	const entries = await zipReader.getEntries();
	await zipReader.close();
	check("entry comments empty in a protected archive", entries.every(entry => !entry.comment), true);
}

{
	const options = makeOptions({ insertCanonicalLink: true, url: "https://example.com/page" });
	const pageData = makePageData(9, 4 * 1024);
	pageData.comment = "\n url: https://example.com/page \n";
	const { bytes } = await runProcess(pageData, options);
	const text = decodeText(bytes);
	check("comment written without a password", text.includes("<!--\n url: https://example.com/page \n-->"), true);
	check("canonical link written without a password", text.includes("<link rel=canonical href=\"https://example.com/page\">"), true);
}

{
	const options = makeOptions({ insertTextBody: true });
	const pageData = makePageData(7, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	check("text body written without a password", decodeText(bytes).includes("<main hidden>"), true);
}

{
	const options = makeOptions({ insertTextBody: true, password: "secret" });
	const pageData = makePageData(8, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	const text = decodeText(bytes);
	check("text body withheld from a protected archive", text.includes("<main hidden>"), false);
	check("page text absent from a protected archive", text.includes("seed 8"), false);
}

{
	const options = makeOptions();
	const pageData = makePageData(3, 4 * 1024);
	pageData.resources.images.push(imageResource("https://example.com/image.png"));
	const { bytes } = await runProcess(pageData, options);
	const zipReader = new ZipReader(new BlobReader(new Blob([bytes])));
	const entries = await zipReader.getEntries();
	await zipReader.close();
	const imageEntry = entries.find(entry => entry.filename.endsWith("images/0.png"));
	check("entry comment carries the url without a password", imageEntry.comment, "https://example.com/image.png");
}

{
	const options = makeOptions({ embeddedPdf: PDF });
	const pageData = makePageData(4, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	const text = decodeText(bytes);
	check("short doctype is preserved", text.startsWith("<!DOCTYPE html>"), true);
	check("pdf header inside the scan window", text.indexOf("%PDF-") <= 1024, true);
}

{
	const options = makeOptions({ embeddedPdf: PDF });
	const pageData = makePageData(5, 4 * 1024);
	pageData.doctype = "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.1//EN\" \"" + "x".repeat(2000) + ".dtd\">";
	const { bytes } = await runProcess(pageData, options);
	const text = decodeText(bytes);
	check("oversized doctype is replaced", text.startsWith("<!DOCTYPE html><html data-sfz>"), true);
	check("pdf header stays inside the scan window", text.indexOf("%PDF-") <= 1024, true);
}

{
	const options = makeOptions();
	const pageData = makePageData(6, 4 * 1024);
	pageData.doctype = "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.1//EN\" \"" + "x".repeat(2000) + ".dtd\">";
	const { bytes } = await runProcess(pageData, options);
	const text = decodeText(bytes);
	check("oversized doctype is replaced without the pdf face", text.startsWith("<!DOCTYPE html><html data-sfz>"), true);
	check("charset declaration stays inside the scan window", charsetDeclarationEnd(text) <= 1024, true);
}

{
	const options = makeOptions();
	const pageData = makePageData(6, 4 * 1024);
	pageData.doctype = "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Transitional//EN\" \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd\">";
	const { bytes } = await runProcess(pageData, options);
	check("ordinary doctype is kept verbatim", decodeText(bytes).startsWith(pageData.doctype), true);
}

function charsetDeclarationEnd(text) {
	const index = text.indexOf("<meta charset=");
	return index == -1 ? -1 : index + text.substring(index).indexOf(">") + 1;
}

function triggerResource(literals) {
	const bytes = new Uint8Array(2048).fill(0x21);
	const encoder = new TextEncoder();
	let offset = 128;
	for (const literal of literals) {
		bytes.set(encoder.encode(literal), offset);
		offset += 256;
	}
	return { name: "images/trigger.png", extension: ".png", content: bytes };
}

function countIdentifiers(text) {
	return (text.match(/id=sfz-data|<!--sfz-data/g) || []).length;
}

{
	const options = makeOptions();
	const pageData = makePageData(12, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	check("comment wrapper carries the identifier", decodeText(bytes).includes("<!--sfz-dataPK"), true);
}

{
	const options = makeOptions();
	const pageData = makePageData(13, 4 * 1024);
	pageData.resources.images.push(triggerResource(["-->"]));
	const { bytes } = await runProcess(pageData, options);
	check("element wrapper carries the identifier", decodeText(bytes).includes("<script type=sfz-data id=sfz-data>PK"), true);
}

{
	const options = makeOptions({ preventAppendedData: true });
	const pageData = makePageData(14, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	const text = decodeText(bytes);
	check("relocated placement carries the identifier", text.includes("<!--sfz-dataPK"), true);
	check("relocated payload needs no separator node", /<\/sfz-extra-data> +<!--sfz-dataPK/.test(text), true);
}

// relocating the payload shifts the central directory offsets, which moves the payload length by
// a few base64 quanta; a reservation margin below that shift costs a third layout in about one
// build out of four, so a dozen relocations must all settle in two. The image bytes never contain
// a hyphen, so a wrapper collision cannot add a layout of its own
{
	const { appendZip } = ZipWriter.prototype;
	let layouts = 0;
	ZipWriter.prototype.appendZip = function (reader) {
		layouts++;
		return appendZip.call(this, reader);
	};
	let retried = 0;
	for (let seed = 30; seed < 42; seed++) {
		const options = makeOptions({ preventAppendedData: true });
		const pageData = makePageData(seed, 64 * 1024);
		const rand = mulberry32(seed);
		for (let index = 0; index < 40; index++) {
			const content = new Uint8Array(8 * 1024).map(() => {
				const byte = (rand() * 255) | 0;
				return byte < 0x2D ? byte : byte + 1;
			});
			pageData.resources.images.push({ name: "images/" + index + ".jpg", extension: ".jpg", content, url: "https://example.com/" + index + ".jpg" });
		}
		layouts = 0;
		await runProcess(pageData, options);
		if (layouts > 2) {
			retried++;
		}
	}
	ZipWriter.prototype.appendZip = appendZip;
	check("the reservation margin absorbs the offset shift", retried, 0);
}

{
	const options = makeOptions({ embeddedPdf: PDF });
	const pageData = makePageData(15, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	check("the pdf face is not identified as the zip data", countIdentifiers(decodeText(bytes)), 1);
}

{
	const embeddedImage = new Uint8Array(8 + 25 + 512 + 12);
	embeddedImage.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	embeddedImage.fill(0x41, 33, 33 + 512);
	const options = makeOptions({ embeddedImage });
	const pageData = makePageData(16, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	check("the png face is not identified as the zip data", countIdentifiers(decodeText(bytes)), 1);
}

{
	// the last rung is exempt from both tests: it has no terminator and no tokenizer
	// states, so a payload naming every rung still fits inside it
	const content = new Uint8Array(4096).fill(0x21);
	content.set(new TextEncoder().encode("<!--<script<style<noframes<noembed<iframe<xmp<![CDATA[<plaintext"), 128);
	const options = makeOptions();
	const pageData = makePageData(19, 4 * 1024);
	pageData.resources.images.push({ name: "images/all-starts.png", extension: ".png", content });
	const { bytes } = await runProcess(pageData, options);
	check("every rung's start pattern exhausts to", options.extractDataFromPageTags[0], "<plaintext>");
	check("every rung's start pattern keeps extraction", options.extractDataFromPage !== false, true);
	check("the last rung still carries the identifier", decodeText(bytes).includes("<plaintext id=sfz-data>PK"), true);
}

// the CDATA rung is the last one that can be closed, so it is what stands between a payload
// naming every element rung and <plaintext>, whose selection costs the appended-data placement.
// Its identifier goes on the svg, not on the markup declaration, which takes no attributes
{
	const content = new Uint8Array(4096).fill(0x21);
	content.set(new TextEncoder().encode("<!--<script<style<noframes<noembed<iframe<xmp"), 128);
	const options = makeOptions();
	const pageData = makePageData(24, 4 * 1024);
	pageData.resources.images.push({ name: "images/no-cdata.png", extension: ".png", content });
	const { bytes } = await runProcess(pageData, options);
	check("a payload naming every element rung stops at the cdata rung", options.extractDataFromPageTags[0], "<svg><![CDATA[");
	check("the cdata rung identifies the svg, not the declaration", decodeText(bytes).includes("<svg id=sfz-data><![CDATA[PK"), true);
	check("the cdata rung leaves the appended data placement alone", options.preventAppendedData !== true, true);
}

// the rung a caller names is resolved by its start tag, not by the identity of the array holding
// it. The option is internal and is normally set from the module's own EXTRA_DATA_TAGS, so an
// identity match worked by accident; a caller passing an equal pair of its own indexed the regexp
// table with -1 and threw a bare TypeError out of library internals
{
	const options = makeOptions({ extractDataFromPageTags: ["<noframes>", "</noframes>"] });
	const pageData = makePageData(31, 4 * 1024);
	let error;
	try {
		await runProcess(pageData, options);
	} catch (caught) {
		error = caught;
	}
	check("a rung named by an equal pair is resolved", error, undefined);
}

{
	const options = makeOptions({ extractDataFromPageTags: ["<marquee>", "</marquee>"] });
	const pageData = makePageData(32, 4 * 1024);
	let message;
	try {
		await runProcess(pageData, options);
	} catch (error) {
		message = error.message;
	}
	check("a rung that is not in the ladder names itself", message, "Unknown data tags: <marquee>");
}

// the terminator is the whole test for this rung, so a payload holding it must step past
{
	const content = new Uint8Array(4096).fill(0x21);
	content.set(new TextEncoder().encode("<!--<script<style<noframes<noembed<iframe<xmp]]>"), 128);
	const options = makeOptions();
	const pageData = makePageData(25, 4 * 1024);
	pageData.resources.images.push({ name: "images/cdata-end.png", extension: ".png", content });
	const { bytes } = await runProcess(pageData, options);
	check("a payload holding \"]]>\" defeats the cdata rung", options.extractDataFromPageTags[0], "<plaintext>");
	check("the rung below takes it", decodeText(bytes).includes("<plaintext id=sfz-data>PK"), true);
}

// script data has escape states the raw text rungs do not: "<!--" then "<script" in a
// payload leaves "</script>" unable to close the element, so a face carrying both must
// step past the script rung even though it holds no closer at all
const DOUBLE_ESCAPE = "--> <!-- <script ";

{
	const embeddedPdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /X (" + DOUBLE_ESCAPE + ") >>\nendobj\ntrailer\n<<>>\n%%EOF\n");
	const options = makeOptions({ embeddedPdf });
	const pageData = makePageData(17, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	const text = decodeText(bytes);
	check("the pdf face steps past the script rung", text.includes("<style type=sfz-data>%PDF-") || text.includes("<style type=sfz-data>PK"), true);
	check("the pdf face takes no script rung", text.includes("<script type=sfz-data>"), false);
}

{
	const embeddedImage = new Uint8Array(8 + 25 + 512 + 12);
	embeddedImage.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	embeddedImage.fill(0x41, 33, 33 + 512);
	embeddedImage.set(new TextEncoder().encode(DOUBLE_ESCAPE), 100);
	const options = makeOptions({ embeddedImage });
	const pageData = makePageData(18, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	check("the png face takes no script rung", decodeText(bytes).includes("<script type=sfz-data>"), false);
}

// a face is hidden by the same ladder as the zip data, minus the rung that cannot be closed:
// a payload naming all seven of the rest leaves nowhere to put it. Writing it unwrapped was the
// older behaviour, and it is the dangerous one, because the payload's own markup then joins the
// document. These payloads carry the identifier the way a nested archive does: a reader looking
// for one node finds two, takes the first, and extracts an archive that checksums
const ALL_FACE_RUNGS = "<!--sfz-data<script<style<noframes<noembed<iframe<xmp<![CDATA[";

{
	const embeddedPdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /X (" + ALL_FACE_RUNGS + ") >>\nendobj\ntrailer\n<<>>\n%%EOF\n");
	const options = makeOptions({ embeddedPdf });
	const pageData = makePageData(22, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	const text = decodeText(bytes);
	check("an unhidable pdf face is dropped", text.includes("%PDF-"), false);
	check("the dropped pdf face leaves one identifier", countIdentifiers(text), 1);
	const zipReader = new ZipReader(new BlobReader(new Blob([bytes])));
	const entries = await zipReader.getEntries();
	await zipReader.close();
	check("the archive survives the dropped pdf face", entries.length > 0, true);
	check("no page.pdf entry is left behind", entries.some(entry => entry.filename.endsWith("page.pdf")), false);
}

// page.pdf is the only record the writer builds by hand, so it is the only place the
// language encoding flag can go missing: without it a reader decodes that one name
// through CP437 while reading every other name in the same archive as UTF-8
{
	const options = makeOptions({ embeddedPdf: PDF });
	const pageData = makePageData(23, 4 * 1024);
	pageData.resources.images.push(imageResource("https://example.com/image.png"));
	const { bytes } = await runProcess(pageData, options);
	const zipReader = new ZipReader(new BlobReader(new Blob([bytes])));
	const entries = await zipReader.getEntries();
	await zipReader.close();
	check("the pdf entry is listed", entries.some(entry => entry.filename == "page.pdf"), true);
	check("every central record declares utf-8 names", entries.every(entry => entry.filenameUTF8), true);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const localFlags = entries.map(entry => view.getUint16(entry.offset + 6, true));
	check("every local header declares utf-8 names", localFlags.every(flags => Boolean(flags & 0x0800)), true);
}

{
	const embeddedImage = new Uint8Array(8 + 25 + 512 + 12);
	embeddedImage.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	embeddedImage.fill(0x41, 33, 33 + 512);
	embeddedImage.set(new TextEncoder().encode(ALL_FACE_RUNGS), 100);
	const options = makeOptions({ embeddedImage });
	const pageData = makePageData(23, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	const text = decodeText(bytes);
	check("an unhidable png face is dropped", bytes[0], 0x3c);
	check("the dropped png face leaves one identifier", countIdentifiers(text), 1);
	check("the page keeps its doctype without the png face", text.startsWith("<!DOCTYPE html>"), true);
}

// every rung pattern is matched case-insensitively, because the HTML tokenizer closes an
// element on any case of its end tag. Dropping that would pick a rung the payload itself
// terminates, and no other test in this file would notice
{
	const options = makeOptions();
	const pageData = makePageData(20, 4 * 1024);
	pageData.resources.images.push(triggerResource(["-->", "</SCRIPT>"]));
	const { bytes } = await runProcess(pageData, options);
	const text = decodeText(bytes);
	check("an upper-case end tag defeats its rung", text.includes("<script type=sfz-data"), false);
	check("the rung below takes the payload", text.includes("<style type=sfz-data id=sfz-data>PK"), true);
}

{
	const options = makeOptions();
	const pageData = makePageData(21, 4 * 1024);
	pageData.resources.images.push(triggerResource(["-->", "<SCRIPT "]));
	const { bytes } = await runProcess(pageData, options);
	const text = decodeText(bytes);
	check("an upper-case start pattern defeats its rung", text.includes("<script type=sfz-data"), false);
	check("the rung below takes the start-pattern payload", text.includes("<style type=sfz-data id=sfz-data>PK"), true);
}

function randomPng(seed) {
	const rand = mulberry32(seed);
	const bytes = new Uint8Array(8 + 25 + 2048 + 12);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	for (let index = 33; index < bytes.length - 12; index++) {
		bytes[index] = (rand() * 256) | 0;
	}
	return bytes;
}

// the checksum of the chunk carrying the start tag begins the wrapper's content: for seeds 148
// and 616 it starts with ">", which closes a comment wrapper the moment the parser reaches it,
// and seed 147 is a control whose checksum does not
for (const seed of [147, 148, 616]) {
	const options = makeOptions({ embeddedImage: randomPng(seed) });
	const pageData = makePageData(seed, 2 * 1024);
	const { bytes } = await runProcess(pageData, options);
	check("no wrapper comment is closed abruptly, seed " + seed, /<!--(>|->)/.test(decodeText(bytes)), false);
}

// leaving the comment rung is a search, not an increment. The checksum decides only that the
// comment is unusable; which rung is usable is still the payload's to say, and these payloads
// terminate the rung immediately below. Taking it on trust put the image data, the chunk framing
// and the whole ZIP region outside the wrapper, 19KB of it, read by the parser as markup
for (const seed of [148, 616]) {
	const embeddedImage = randomPng(seed);
	embeddedImage.set(new TextEncoder().encode("</script>"), 100);
	const options = makeOptions({ embeddedImage });
	const pageData = makePageData(seed, 2 * 1024);
	const { bytes } = await runProcess(pageData, options);
	const text = decodeText(bytes);
	check("the step off the comment rung skips what the payload terminates, seed " + seed, text.includes("<script type=sfz-data>"), false);
	check("the step off the comment rung lands on a rung that qualifies, seed " + seed, text.includes("<style type=sfz-data>"), true);
}

// the control for the pair above: the same seeds, the same step, a payload that leaves the rung
// below usable — the writer must still take it rather than skip past it
{
	const options = makeOptions({ embeddedImage: randomPng(148) });
	const { bytes } = await runProcess(makePageData(148, 2 * 1024), options);
	check("the step off the comment rung takes a usable rung", decodeText(bytes).includes("<script type=sfz-data>"), true);
}

function readAppendedData(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset);
	for (let index = bytes.length - 22; index >= 0; index--) {
		if (view.getUint32(index, true) == 0x06054b50) {
			return { declared: view.getUint16(index + 20, true), trailing: bytes.length - index - 22 };
		}
	}
	return {};
}

{
	const options = makeOptions();
	const pageData = makePageData(9, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	const { declared, trailing } = readAppendedData(bytes);
	check("appended data left undeclared by default", declared, 0);
	check("appended data is there to declare", trailing > 0, true);
}

{
	const options = makeOptions({ declareAppendedData: true });
	const pageData = makePageData(10, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	const { declared, trailing } = readAppendedData(bytes);
	check("appended data declared as the archive comment", declared, trailing);
	check("the comment covers the rest of the file", trailing > 0, true);
}

{
	const options = makeOptions({ declareAppendedData: true, preventAppendedData: true });
	const pageData = makePageData(11, 4 * 1024);
	const { bytes } = await runProcess(pageData, options);
	const { declared, trailing } = readAppendedData(bytes);
	check("nothing to declare when appended data is prevented", declared, 0);
	check("no trailing bytes when appended data is prevented", trailing, 0);
}

// a comment cannot escape its own delimiters, so text reaching it from the captured page —
// the infobar template resolves {page-title} and its kind against the document — would close
// it early and turn the rest into markup. The page the archive restores carries no scripts by
// default, and this was the one way to put one back
{
	for (const [label, comment] of [
		["-->", "\n info: --><script>INJECTED</script><!-- \n"],
		["--!>", "\n info: --!><script>INJECTED</script><!-- \n"],
		["--->", "\n info: ---><script>INJECTED</script><!-- \n"]
	]) {
		const pageData = makePageData(12, 1024);
		pageData.comment = comment;
		const { bytes } = await runProcess(pageData, makeOptions());
		const text = decodeText(bytes);
		const start = text.indexOf("<!--\n info:");
		check(`the comment survives ${label} in its content`, start != -1, true);
		// "--!>" closes a comment too, so the end is the first of either form, not the first "-->"
		const end = start + text.substring(start).search(/--!?>/);
		check(`${label} in the comment does not close it early`,
			text.indexOf("INJECTED") < end, true);
	}
	const pageData = makePageData(12, 1024);
	pageData.comment = "\n info: a-->b \n";
	const { bytes } = await runProcess(pageData, makeOptions());
	check("the characters either side of the run are kept",
		decodeText(bytes).includes("info: a-- >b"), true);
}

// neither directive falls back to default-src, so each has to be named to have any effect
{
	const { bytes } = await runProcess(makePageData(13, 1024), makeOptions({ insertMetaCSP: true }));
	const policy = decodeText(bytes).match(/content-security-policy content="([^"]*)"/)[1];
	check("the policy forbids form submission", policy.includes("form-action 'none'"), true);
	check("the policy forbids a base element", policy.includes("base-uri 'none'"), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");
