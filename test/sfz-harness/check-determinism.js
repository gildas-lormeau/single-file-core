import { makePageData, makeOptions, runProcess, freezeDate, buildZip, generateContent, sameBytes, firstDifference } from "./common.js";

const SEED = 1;
const SIZE = 512 * 1024;
let failed = false;

function report(label, ok, detail = "") {
	console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
	failed ||= !ok;
}

{
	const restoreDate = freezeDate();
	try {
		const first = await runProcess(makePageData(SEED, SIZE), makeOptions());
		const second = await runProcess(makePageData(SEED, SIZE), makeOptions());
		report("process() deterministic with frozen Date", sameBytes(first.bytes, second.bytes),
			`sizes ${first.bytes.length}/${second.bytes.length}, first diff at ${firstDifference(first.bytes, second.bytes)}`);
	} finally {
		restoreDate();
	}
}

{
	const first = await runProcess(makePageData(SEED, SIZE), makeOptions());
	await new Promise(resolve => setTimeout(resolve, 5));
	const second = await runProcess(makePageData(SEED, SIZE), makeOptions());
	report("process() NON-deterministic with real Date (archiveTime)", !sameBytes(first.bytes, second.bytes),
		"confirms archiveTime must be pinned across retries");
}

const content = generateContent(SEED, SIZE);
const engines = [
	{ label: "vendor CompressionStream", config: { useCompressionStream: true } },
	{ label: "vendor level 1 (no CompressionStream)", config: { useCompressionStream: false, level: 1 } },
	{ label: "vendor level 9 (no CompressionStream)", config: { useCompressionStream: false, level: 9 } }
];
const outputs = [];
for (const { label, config } of engines) {
	const first = await buildZip(content, config);
	const second = await buildZip(content, config);
	report(`${label} deterministic`, sameBytes(first, second), `${first.length} bytes`);
	outputs.push({ label, bytes: first });
}
const storeFallback = outputs[1].bytes.length >= content.length;
report("no silent store fallback without CompressionStream", !storeFallback, `${outputs[1].bytes.length} bytes for ${content.length} input`);
const levelLever = !storeFallback && !sameBytes(await rawEntryData(outputs[1].bytes), await rawEntryData(outputs[2].bytes));
console.log(`INFO level lever ${levelLever ? "AVAILABLE (levels produce distinct streams)" : "ABSENT (native streams ignore level; perturbation levers: store/deflate flip + text input tweaks)"}`);

async function rawEntryData(bytes) {
	const { ZipReader, BlobReader, Uint8ArrayWriter } = await import("../../vendor/zip/zip.js");
	const reader = new ZipReader(new BlobReader(new Blob([bytes])));
	const [entry] = await reader.getEntries();
	return entry.getData(new Uint8ArrayWriter(), { passThrough: true });
}

Deno.exit(failed ? 1 : 0);
