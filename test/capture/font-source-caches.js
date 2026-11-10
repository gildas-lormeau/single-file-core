// Font sources can contain megabytes of base64 repeated across faces. Sharing the work of reading
// them must not share mutable per-rule arrays or objects, or leak resource metadata to another save.
// Exercise the common helper directly so allocation counts are deterministic, without timing or GC.
import * as cssTree from "../../vendor/css-tree.js";
import "./dom.js";
const { getProcessorHelperCommonClass } = await import("../../core/lib/processor-helper-common.js");

let generated = 0;
const Helper = getProcessorHelperCommonClass({}, {
	...cssTree,
	generate(node) {
		generated++;
		return cssTree.generate(node);
	}
});
const helper = new Helper();
let failed = false;

// Keep the old last-matching-declaration semantics, including malformed values and the IE hack.
{
	const rule = face("font-weight:300;font-weight:500;color:red;font-weight:700\\9");
	generated = 0;
	check("the last non-hack declaration wins", helper.getPropertyValue(rule, "font-weight"), "500");
	check("matching values are generated once each", generated, 3);
	check("an absent property is undefined", helper.getPropertyValue(rule, "src"), undefined);
	check("a hack alone is ignored", helper.getPropertyValue(face("font-weight:700\\9"), "font-weight"), undefined);
	check("an empty block has no value", helper.getPropertyValue(face(""), "src"), undefined);
	const malformed = { type: "Declaration", property: "font-weight", value: { type: "InvalidForTest" } };
	rule.block.children.push(malformed);
	check("a final generation failure clears the previous value", helper.getPropertyValue(rule, "font-weight"), undefined);
	rule.block.children.push({ type: "Declaration", property: "font-weight", value: { type: "Raw", value: "900\\9" } });
	check("a skipped hack does not restore a value before a failure", helper.getPropertyValue(rule, "font-weight"), undefined);
	rule.block.children.push({ type: "Declaration", property: "font-weight", value: cssTree.parse("600", { context: "value" }) });
	check("a later valid value recovers from a generation failure", helper.getPropertyValue(rule, "font-weight"), "600");
	malformed.property = "unrelated";
	check("an unrelated malformed value is never generated", helper.getPropertyValue(rule, "font-weight"), "600");
}

// Duplicate detection groups by tree, descriptors AND source, and keeps the last matching rule.
// Compare its result with the previous compound-string key algorithm for every nested group.
{
	const details = helper.createFontsDetailsInfo();
	const scopes = new Map();
	const shadow = {};
	const sources = ["url(a.woff2)", "url(b.woff2)", "url(a.woff2)", "url(a.woff2)", undefined, undefined, "local(Test)"];
	function populate(group) {
		for (let index = 0; index < sources.length; index++) {
			const rule = face("font-family:Test;" + (sources[index] ? "src:" + sources[index] : ""));
			group.fonts.set(rule, []);
			if (index == 3) scopes.set(rule, shadow);
		}
		group.fonts.set(face("font-family:Other;src:url(a.woff2)"), []);
	}
	populate(details);
	for (const name of ["medias", "supports", "layers"]) {
		const nested = helper.createFontsDetailsInfo();
		populate(nested);
		details[name].set("group", nested);
	}
	helper.markRepeatedFontFaceRules(details, scopes, new Map());
	for (const [name, group] of [["root", details], ...["medias", "supports", "layers"].map(name => [name, details[name].get("group")])]) {
		const lastRules = new Map(), expected = new Set();
		group.fonts.forEach((info, rule) => {
			const key = (scopes.has(rule) ? 1 : 0) + " " + helper.getFontKey(rule) + " " + helper.getPropertyValue(rule, "src");
			if (lastRules.has(key)) expected.add(lastRules.get(key));
			lastRules.set(key, rule);
		});
		check(name + ": nested maps preserve compound-key equality", [...group.repeatedFonts].every(rule => expected.has(rule)) && group.repeatedFonts.size == expected.size, true);
		check(name + ": only the earlier equal source and missing source repeat", group.repeatedFonts.size, 2);
	}
}

{
	const source = "url(a.woff2) format(\"woff2\"),local(Test),url(a.woff2) format(\"woff2\")";
	const sheet = cssTree.parse(font("A", source) + "@media print{" + font("B", source) + "}@supports(display:grid){" + font("C", source) + "}@layer test{" + font("D", source) + "}");
	const details = helper.createFontsDetailsInfo(), cache = new Map();
	helper.getFontsDetails(null, sheet.children, 0, details, cache);
	const arrays = collect(details).map(([, sources]) => sources);
	check("one source-list cache entry spans nested groups", cache.size, 1);
	check("source order and last-duplicate preference are unchanged", arrays[0], ["url(a.woff2)format(\"woff2\")", "local(Test)"]);
	check("each rule owns its source array", new Set(arrays).size, 4);
	arrays[0].pop();
	check("editing a rule cannot alter another rule or the cached list", arrays.slice(1).every(sources => sources.length == 2) && [...cache.values()][0]?.length == 2, true);
}

// Stop just before source selection, after the real common pass has parsed all sources. Resource
// map reads count source-detail parsing: a repeated large URL needs one lookup, not one per face.
{
	const payload = "A".repeat(256 * 1024);
	const url = "data:font/woff2;base64," + payload;
	const source = "url(" + url + ") format(\"woff2\") tech(variations)";
	const generatedSource = cssTree.generate(cssTree.parse(source, { context: "value" }));
	const sheet = cssTree.parse(Array.from({ length: 12 }, (_, index) => font("Family" + index, source)).join("") +
		"@media print{" + font("Print", source) + "}@supports(display:grid){" + font("Grid", source) + "}@layer test{" + font("Layer", source) + "}");
	const stylesheets = new Map([[0, { stylesheet: sheet }], [1, { stylesheet: cssTree.parse(font("SecondSheet", source)), mediaText: "screen" }]]);
	let resourceReads = 0, observed = [];
	const resources = new Map([[0, { name: url, contentType: "font/woff2" }]]);
	resources.values = function () { resourceReads++; return Map.prototype.values.call(this); };
	const observer = new Helper();
	observer.processFontFaceRules = async function (rules, index, details) {
		if (!index) observed.push(...collect(details).map(([, sources]) => sources[0]));
	};
	await observer.removeAlternativeFonts(null, stylesheets, resources);
	check("repeated large sources are parsed once across sheets and nested groups", resourceReads, 1);
	check("all sixteen rules receive source details", observed.length, 16);
	check("each rule owns its source-details object", new Set(observed).size, 16);
	check("large source bytes and metadata stay intact", observed.every(info => info.fontUrl == url && info.src == generatedSource && info.format == "woff2" && info.tech == "variations" && info.contentType == "font/woff2"), true);
	observed[0].format = "changed";
	check("mutating one source detail leaves the other rules alone", observed.slice(1).every(info => info.format == "woff2"), true);
	resources.set(0, { name: url, contentType: "application/new-pass" });
	observed = [];
	await observer.removeAlternativeFonts(null, stylesheets, resources);
	check("a second pass reads resource metadata again", resourceReads, 2);
	check("neither mutation nor resource metadata leaks between passes", observed.every(info => info.format == "woff2" && info.contentType == "application/new-pass"), true);
	observed = [];
	await observer.removeAlternativeFonts(null, stylesheets);
	check("an inline pass cannot inherit archive content types", observed.every(info => !("contentType" in info)), true);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function face(declarations) {
	return cssTree.parse("@font-face{" + declarations + "}").children.head.data;
}

function font(family, source) {
	return "@font-face{font-family:" + family + ";src:" + source + "}";
}

function collect(details) {
	return [...details.fonts, ...["medias", "supports", "layers"].flatMap(name => [...details[name].values()].flatMap(collect))];
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label);
	if (!pass) failed = true;
}
