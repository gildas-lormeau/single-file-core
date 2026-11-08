// Logic regressions for inline font validation, not browser font-decoder tests. These use the
// production parser, metadata pass and inline helper, with controlled FontFace outcomes and a
// manual clock. No network requests or real five-second delays are involved. In particular, a
// rejected primary's timer must not later mark its source valid while the original URL is tested.
import "./dom.js";

const nativeFontFace = globalThis.FontFace;
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
const timers = new Map();
const outcomes = new Map();
const calls = [];
let nextTimer = 0;
let failed = false;

globalThis.FontFace = class {
	constructor(family, src) {
		this.src = src;
	}
	load() {
		const url = cssTree.find(cssTree.parse(this.src, { context: "value" }), node => node.type == "Url").value;
		calls.push(url);
		const outcome = outcomes.get(url) || "loaded";
		this.loaded = outcome == "pending" ? new Promise(() => {}) :
			outcome == "loaded" ? Promise.resolve(this) : Promise.reject({ name: outcome });
		return this.loaded;
	}
};
globalThis.setTimeout = (callback, delay) => {
	const id = ++nextTimer;
	timers.set(id, { callback, delay });
	return id;
};
globalThis.clearTimeout = id => timers.delete(id);

// FontFace is bound at module evaluation, so install the stub before importing the helper.
const { getProcessorHelperClass, cssTree } = await import("../../core/lib/processor-helper-inline.js");
const Helper = getProcessorHelperClass({ findLast: (array, predicate) => array.findLast(predicate) });
const helper = new Helper();

try {
	// Both branches must clear timers, including rejection of the original URL fallback.
	reset({ primary: "SyntaxError", original: "SyntaxError" });
	const rejected = await run([source("primary", "woff2")], [["original"]]);
	check("a primary and original URL that reject remove the face", rejected.kept, []);
	check("both rejected loads clear their timers", timers.size, 0);
	fireTimers();
	check("firing remaining timers cannot revive a rejected face", rejected.kept, []);
	check("cache records the primary rejection, not fallback validity", [...rejected.cache.values()], ["other-rejection"]);

	// Share one cache and one declarations map between rules with identical primary bytes. Put
	// the other rule's URL node first in the map, so lookup by value alone chooses the wrong URL.
	for (const originals of [["good", "bad"], ["bad", "good"]]) {
		reset({ shared: "SyntaxError", good: "loaded", bad: "SyntaxError" });
		const result = await run([source("shared", "woff2"), source("shared", "woff2")], originals.map(url => [url]), true);
		check("fallback validity stays rule-local in order " + originals, result.kept, [originals.indexOf("good")]);
		check("a repeated primary is loaded only once in order " + originals, calls.filter(url => url == "shared").length, 1);
		check("each rule tests its own original in order " + originals, calls.filter(url => url != "shared"), originals);
		check("fallback success does not overwrite the primary cache in order " + originals, [...result.cache.values()], ["other-rejection"]);
		check("all rule-local fallback timers are cleared in order " + originals, timers.size, 0);
	}

	// The metadata pass stores sources in reverse order. The first source in CSS wins a format
	// tie; format preference, rather than source order, determines which format is tried first.
	const formats = ["woff2-variations", "woff2", "woff", "truetype-variations", "truetype"];
	for (let index = 0; index < formats.length; index++) {
		reset();
		const candidates = formats.slice(index).reverse().map(format => source(format, format));
		const result = await run([candidates.join(",")]);
		check("priority selects " + formats[index], result.urls, [formats[index]]);
		check("lower priority sources are never loaded after " + formats[index], calls, [formats[index]]);
	}
	reset();
	let result = await run([source("first", "woff2") + "," + source("last", "woff2")]);
	check("reverse metadata storage preserves the first CSS source on a tie", result.urls, ["first"]);
	check("the other tied source is not loaded", calls, ["first"]);

	reset({ first: "SyntaxError", original: "SyntaxError" });
	result = await run([source("first", "woff2") + "," + source("second", "woff2") + "," + source("lower", "woff")], [["original", "unused", "unused"]]);
	check("a rejected tied source advances to the next source before lower formats", calls, ["first", "original", "second"]);
	check("the successful second source alone survives", result.urls, ["second"]);

	reset();
	result = await run(["local(\"Installed\")," + source("color", "woff2") + " tech(color-COLRv1)," + source("plain", "woff2") + "," + source("lower", "woff")]);
	check("local and tech sources remain in CSS order with the plain winner", result.sources, ["local(\"Installed\")", source("color", "woff2") + " tech(color-COLRv1)", source("plain", "woff2")].map(value => cssTree.generate(cssTree.parse(value, { context: "value" }))));
	check("tech is validated but local and lower plain formats are not loaded", calls, ["plain", "color"]);

	for (const format of ["opentype", "embedded-opentype"]) {
		reset();
		result = await run([source("generic") + "," + source("otf", format)]);
		check(format + " remains the unvalidated fallback", result.urls, ["otf"]);
		check(format + " avoids loading generic alternatives", calls, []);
	}
	reset();
	result = await run([source("unknown-a") + "," + source("unknown-b", "future-format") + ",local(\"Installed\")"]);
	check("generic fallback keeps all valid unknown sources", result.urls, ["unknown-a", "unknown-b"]);
	check("generic fallback validates both unknown sources", [...calls].sort(), ["unknown-a", "unknown-b"]);

	reset({ missing: "SyntaxError" });
	result = await run([source("missing", "woff2")]);
	check("a rejected source without an original mapping keeps the compatibility fallback", result.urls, ["missing"]);
	check("missing original mapping does not turn primary rejection into cache success", [...result.cache.values()], ["other-rejection"]);

	reset({ color: "SyntaxError", original: "SyntaxError" });
	result = await run([source("color", "woff2") + " tech(color-COLRv1)," + source("plain", "woff2")], [["original", "unused"]]);
	check("a tech source rejected both locally and at its original URL is discarded", result.urls, ["plain"]);
	check("a rejected tech source leaves no timers", timers.size, 0);

	reset({ primary: "SyntaxError", original: "NetworkError" });
	result = await run([source("primary", "woff2")], [["original"]]);
	check("NetworkError acceptance is primary-only, not original URL fallback policy", result.kept, []);
	check("a rejected original URL NetworkError clears its timer", timers.size, 0);

	reset();
	result = await run([source("shared", "woff2"), source("shared", "woff2")]);
	check("successful primary cache is reused by later rules", calls, ["shared"]);
	check("both rules keep a successfully cached primary", result.kept, [0, 1]);
	check("successful primary is cached as loaded", [...result.cache.values()], ["loaded"]);
	check("successful primary clears its timer", timers.size, 0);

	reset({ network: "NetworkError" });
	result = await run([source("network", "woff2")]);
	check("NetworkError retains the primary under the existing policy", result.urls, ["network"]);
	check("NetworkError is cached as a primary policy outcome", [...result.cache.values()], ["network-policy"]);
	check("NetworkError clears its timer", timers.size, 0);

	reset({ slow: "pending" });
	const pending = run([source("slow", "woff2")]);
	await flush();
	check("a pending primary schedules the five-second policy timer", [...timers.values()].map(timer => timer.delay), [5000]);
	fireTimers();
	result = await pending;
	check("timeout keeps the pending primary", result.urls, ["slow"]);
	check("timeout acceptance is cached", [...result.cache.values()], ["timeout-policy"]);

	reset({ primary: "SyntaxError", original: "pending" });
	const fallbackPending = run([source("primary", "woff2")], [["original"]]);
	await flush();
	check("while fallback is pending only its own timer remains", timers.size, 1);
	fireTimers();
	result = await fallbackPending;
	check("original URL timeout retains the source under existing policy", result.urls, ["primary"]);
	check("original URL timeout does not replace the primary rejection cache", [...result.cache.values()], ["other-rejection"]);
} finally {
	globalThis.FontFace = nativeFontFace;
	globalThis.setTimeout = nativeSetTimeout;
	globalThis.clearTimeout = nativeClearTimeout;
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function source(url, format) {
	return "url(" + url + ")" + (format ? " format(\"" + format + "\")" : "");
}

function reset(values = {}) {
	timers.clear();
	outcomes.clear();
	Object.entries(values).forEach(([url, outcome]) => outcomes.set(url, outcome));
	calls.length = 0;
}

async function run(sources, originals = [], reverseDeclarations = false) {
	const stylesheet = cssTree.parse(sources.map((src, index) => "@font-face{font-family:F" + index + ";src:" + src + "}").join(""));
	const rules = stylesheet.children.toArray();
	const declarations = [];
	rules.forEach((rule, index) => {
		cssTree.findAll(rule, node => node.type == "Url").forEach((node, sourceIndex) => {
			if (originals[index] && originals[index][sourceIndex]) {
				declarations.push([node, [originals[index][sourceIndex]]]);
			}
		});
	});
	const cache = new Map();
	const stats = await helper.removeAlternativeFonts(null, new Map([[null, { stylesheet }]]), new Map(reverseDeclarations ? declarations.reverse() : declarations), cache);
	const kept = rules.map((rule, index) => stylesheet.children.toArray().includes(rule) ? index : -1).filter(index => index != -1);
	const urls = cssTree.findAll(stylesheet, node => node.type == "Url").map(node => node.value);
	const details = helper.createFontsDetailsInfo();
	helper.getFontsDetails(null, stylesheet.children, 0, details);
	return { kept, urls, cache, stats, sources: [...details.fonts.values()].flatMap(value => value.reverse()) };
}

function fireTimers() {
	for (const [id, timer] of [...timers]) {
		timers.delete(id);
		timer.callback();
	}
}

async function flush() {
	for (let index = 0; index < 20; index++) {
		await Promise.resolve();
	}
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
