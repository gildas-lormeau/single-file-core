// Several @font-face rules that declare the same family with the same style descriptors are one
// composite face, not a stack where the last rule wins. CSS Fonts 4 §5.2: "When the matched face is
// a composite face, user agents must use the procedure above on each of the faces in the composite
// face in reverse order of @font-face rule definition", selecting a face only "if the effective
// character map supports the character in question". §4.5.1 says the same for the case where the
// ranges are identical rather than merely overlapping: "If the unicode ranges overlap for a set of
// @font-face rules with the same family and style descriptor values, the rules are ordered in the
// reverse order they were defined; the last rule defined is the first to be checked for a given
// character." So the later rule wins per character, and a character it has no glyph for falls back
// to the earlier rule of the same family.
//
// Dropping the earlier rule therefore loses glyphs. science.org declares icomoon twice, weight 400
// style normal in both, first a 103-codepoint icon set and then a 30-codepoint one holding only the
// slideshow arrows. The banner close button is content:"\e928", which lives in the first font only,
// so keeping the last rule alone rendered a tofu box reading "E9 28" where the X had been.
//
// Pooling the sources of every rule sharing a key breaks it the same way even when both rules are
// kept: one winning source gets written into all of them, so both rules end up naming the same font
// and the other one is gone just as surely. Each rule keeps its own sources.
//
// Rules that are duplicates outright, same key and same src, are still emitted once: they are the
// same member of the composite declared twice, so dropping one changes nothing.
import * as cssTree from "../../vendor/css-tree.js";

// helper.js reaches the frame hooks, which install themselves against window and document as they
// are evaluated: the stubs go in before the dynamic import
globalThis.window = globalThis;
globalThis.document = {};
globalThis.Document = class Document { };
globalThis.MutationObserver = class MutationObserver { observe() { } };
const { getProcessorHelperCommonClass } = await import("../../core/lib/processor-helper-common.js");

const ProcessorHelperCommon = getProcessorHelperCommonClass({}, cssTree);

// the real subclasses pick one source out of the list and rewrite the rule with it; the contract
// under test is which rules survive and which sources each one is handed, so this records that and
// keeps every rule
class TestProcessorHelper extends ProcessorHelperCommon {
	constructor() {
		super();
		this.processedRules = [];
	}
	async processFontFaceRule(ruleData, fontInfo) {
		this.processedRules.push({
			family: this.getPropertyValue(ruleData, "font-family"),
			sources: fontInfo.map(source => source.src)
		});
		return true;
	}
}

async function run(css) {
	const helper = new TestProcessorHelper();
	const stylesheets = new Map([[0, { stylesheet: cssTree.parse(css) }]]);
	await helper.removeAlternativeFonts({}, stylesheets, new Map(), new Map());
	const remaining = [];
	stylesheets.get(0).stylesheet.children.forEach(ruleData => {
		if (ruleData.type == "Atrule" && ruleData.name == "font-face") {
			remaining.push(helper.getPropertyValue(ruleData, "src"));
		}
	});
	return { processed: helper.processedRules, remaining };
}

let failures = 0;

// a rule that was dropped when it should have been kept leaves a hole in the list, and reporting
// that as a failed comparison is more use than throwing on the way to the assertion
function sourcesOf(processedRules, index) {
	const rule = processedRules[index];
	return rule ? rule.sources : null;
}

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failures++;
	}
}

const TWO_FACES = `
	@font-face{font-family:icomoon;src:url(big.ttf) format("truetype"),url(big.woff) format("woff");font-weight:400;font-style:normal}
	@font-face{font-family:icomoon;src:url(small.ttf) format("truetype"),url(small.woff) format("woff");font-weight:400;font-style:normal}`;

const two = await run(TWO_FACES);
check("both members of the composite face are kept", two.processed.length, 2);
check("the earlier rule keeps its own sources", sourcesOf(two.processed, 0).sort(), ["url(big.ttf)format(\"truetype\")", "url(big.woff)format(\"woff\")"]);
check("the later rule keeps its own sources", (sourcesOf(two.processed, 1) || []).sort(), ["url(small.ttf)format(\"truetype\")", "url(small.woff)format(\"woff\")"]);
check("neither rule is removed from the stylesheet", two.remaining.length, 2);

const DUPLICATE = `
	@font-face{font-family:icomoon;src:url(one.woff) format("woff");font-weight:400;font-style:normal}
	@font-face{font-family:icomoon;src:url(one.woff) format("woff");font-weight:400;font-style:normal}`;

const duplicate = await run(DUPLICATE);
check("an outright duplicate rule is emitted once", duplicate.processed.length, 1);
check("the duplicate is removed from the stylesheet", duplicate.remaining.length, 1);

// unicode-range is part of the font key, so the subsetting idiom was never affected by the
// shadowing bug; it is pinned here because the fix moved what the key is used for
const RANGES = `
	@font-face{font-family:sub;src:url(latin.woff2) format("woff2");unicode-range:U+0-7F}
	@font-face{font-family:sub;src:url(greek.woff2) format("woff2");unicode-range:U+370-3FF}`;

const ranges = await run(RANGES);
check("faces split by unicode-range are all kept", ranges.processed.length, 2);
check("each range keeps its own source", ranges.processed.map(rule => rule.sources), [["url(latin.woff2)format(\"woff2\")"], ["url(greek.woff2)format(\"woff2\")"]]);

// a rule declaring the same source twice contributes it once, in the position its later declaration
// gives it. The sources are compared after the separating comma is stripped, so a repeat is
// recognised wherever it sits: the value is split by a regexp that keeps that comma, and comparing
// the raw pieces made the last source in a list unequal to the same source anywhere before it
const REPEATED = `
	@font-face{font-family:repeat;src:url(a.woff) format("woff"),url(b.woff) format("woff"),url(a.woff) format("woff"),url(c.woff) format("woff");font-weight:400}`;

const repeated = await run(REPEATED);
check("a source repeated inside one rule is listed once", (sourcesOf(repeated.processed, 0) || []).length, 3);

const REPEATED_LAST = `
	@font-face{font-family:repeat;src:url(a.woff) format("woff"),url(b.woff) format("woff"),url(a.woff) format("woff");font-weight:400}`;

const repeatedLast = await run(REPEATED_LAST);
check("a repeat in last position is recognised too", (sourcesOf(repeatedLast.processed, 0) || []).length, 2);
// the list is held in reverse of the order it is written back in, so the entry the rule declares
// last comes first here: a.woff keeps the position its second declaration gives it
check("the repeat keeps the position of its later declaration", sourcesOf(repeatedLast.processed, 0), ["url(a.woff)format(\"woff\")", "url(b.woff)format(\"woff\")"]);

if (failures) {
	console.log("\n" + failures + " check(s) failed");
	Deno.exit(1);
} else {
	console.log("\nall checks passed");
}
