import { makePageData, makeOptions, runProcess, freezeDate } from "./common.js";

const startSeed = Number(Deno.args[0] ?? 1);
const seedCount = Number(Deno.args[1] ?? 100);
const contentLength = Number(Deno.args[2] ?? 2 * 1024 * 1024);

const found = [];
const restoreDate = freezeDate();
const startTime = performance.now();
try {
	for (let seed = startSeed; seed < startSeed + seedCount; seed++) {
		const options = makeOptions();
		const result = await runProcess(makePageData(seed, contentLength), options);
		if (result.fallbackTag || result.extractionDisabled) {
			found.push({ seed, fallbackTag: result.fallbackTag, pageSize: result.bytes.length });
			console.log(`seed ${seed}: TRIGGER, fell back to ${result.fallbackTag}`);
		}
	}
} finally {
	restoreDate();
}
const seconds = (performance.now() - startTime) / 1000;
console.log(`${found.length} trigger(s) in ${seedCount} attempts (content ${contentLength} bytes, ${seconds.toFixed(1)}s)`);
if (found.length) {
	const path = new URL("trigger-seeds.json", import.meta.url).pathname;
	let existing = { contentLength, seeds: [] };
	try {
		existing = JSON.parse(Deno.readTextFileSync(path));
	} catch {
		// first run
	}
	const seeds = [...existing.seeds, ...found.filter(entry => !existing.seeds.some(known => known.seed == entry.seed))];
	Deno.writeTextFileSync(path, JSON.stringify({ contentLength, seeds }, null, "\t") + "\n");
	console.log(`saved to trigger-seeds.json (${seeds.length} total)`);
}
