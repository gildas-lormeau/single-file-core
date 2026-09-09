import { makePageData, makeOptions, runProcess, mulberry32 } from "./common.js";

function storedResource(name, literals) {
	const rand = mulberry32(0xbeef);
	const bytes = new Uint8Array(Math.max(4096, 256 + literals.length * 512)).map(() => (rand() * 256) | 0);
	const encoder = new TextEncoder();
	let offset = 256;
	for (const literal of literals) {
		bytes.set(encoder.encode(literal), offset);
		offset += 512;
	}
	return { name, extension: ".jpg", content: bytes };
}

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

{
	const options = makeOptions();
	const pageData = makePageData(1, 64 * 1024);
	pageData.resources.images.push(storedResource("photo.jpg", ["-->"]));
	const result = await runProcess(pageData, options);
	check("stored '-->' falls back to", result.fallbackTag, "<script type=sfz-data>");
	check("stored '-->' keeps extraction", result.extractionDisabled, false);
}

{
	const options = makeOptions();
	const pageData = makePageData(2, 64 * 1024);
	pageData.resources.images.push(storedResource("photo.jpg",
		["-->", "</noscript>", "</noframes>", "</noembed>", "</script>", "</style>", "</iframe>", "</xmp>", "]]>"]));
	const result = await runProcess(pageData, options);
	check("all closers exhaust to", result.fallbackTag, "<plaintext>");
	check("all closers keep extraction", result.extractionDisabled, false);
}

{
	const options = makeOptions();
	const pageData = makePageData(3, 64 * 1024);
	pageData.resources.images.push(storedResource("photo.jpg", ["</xmp>"]));
	const result = await runProcess(pageData, options);
	check("stored '</xmp>' alone stays on comment path", result.fallbackTag, null);
}

// the rung patterns are matched over the archive BYTES rather than a decoded string, so these
// four pin the parts of that match a byte scan is easy to get wrong: closers are matched
// case-insensitively, a closer only counts when a tag-name terminator follows it, and the
// comment closer is '-->' or '--!>' and nothing else in between

{
	const options = makeOptions();
	const pageData = makePageData(4, 64 * 1024);
	pageData.resources.images.push(storedResource("photo.jpg", ["-->", "</SCRIPT>"]));
	const result = await runProcess(pageData, options);
	check("an upper-case closer counts, so '</SCRIPT>' escalates to", result.fallbackTag, "<style type=sfz-data>");
}

{
	const options = makeOptions();
	const pageData = makePageData(5, 64 * 1024);
	pageData.resources.images.push(storedResource("photo.jpg", ["-->", "</script\tsrc"]));
	const result = await runProcess(pageData, options);
	check("a tab terminates a closer, so '</script\\t' escalates to", result.fallbackTag, "<style type=sfz-data>");
}

{
	const options = makeOptions();
	const pageData = makePageData(6, 64 * 1024);
	pageData.resources.images.push(storedResource("photo.jpg", ["-->", "</scriptx"]));
	const result = await runProcess(pageData, options);
	check("'</scriptx' is not a closer, so it stops at", result.fallbackTag, "<script type=sfz-data>");
}

{
	const options = makeOptions();
	const pageData = makePageData(7, 64 * 1024);
	pageData.resources.images.push(storedResource("photo.jpg", ["--!>"]));
	const result = await runProcess(pageData, options);
	check("'--!>' closes a comment, so it falls back to", result.fallbackTag, "<script type=sfz-data>");
}

{
	const options = makeOptions();
	const pageData = makePageData(8, 64 * 1024);
	pageData.resources.images.push(storedResource("photo.jpg", ["--?>"]));
	const result = await runProcess(pageData, options);
	check("'--?>' does not close a comment", result.fallbackTag, null);
}

Deno.exit(failed ? 1 : 0);
