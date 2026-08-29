import { makePageData, makeOptions, runProcess, mulberry32 } from "./common.js";

function storedResource(name, literals) {
	const rand = mulberry32(0xbeef);
	const bytes = new Uint8Array(4096).map(() => (rand() * 256) | 0);
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
		["-->", "</noscript>", "</noframes>", "</noembed>", "</script>", "</style>", "</iframe>", "</xmp>"]));
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

Deno.exit(failed ? 1 : 0);
