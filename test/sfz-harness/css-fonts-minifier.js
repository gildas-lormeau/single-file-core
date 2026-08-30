// removeUnusedFonts decides which @font-face rules to keep by reading the font-family declarations
// out of the stylesheets. When a family is written as var(--name), the value has to be resolved
// first, and the only resolution the module had was getComputedStyle(body).getPropertyValue(name).
// Custom properties inherit downward, so that answers for a property declared on :root and returns
// nothing for one declared on any descendant — and a single unresolved variable anywhere sets
// unusedFonts to [], which switches pruning off for the WHOLE document. One declaration moved from
// :root to .card took a probe page from 7,611 to 43,648 bytes with every unused font embedded.
//
// The fix keeps the computed value as the first answer and falls back to the union of every value
// the document declares for that property. The union is a superset of what any one element sees,
// so it can only keep too much, never too little — and options.usedFonts, which comes from the
// rendered computed styles, gates the result anyway.
//
// The other var() defects this pins, all found alongside it:
//   - custom property names are case-sensitive; they were lowercased with the family names, so
//     var(--ProbeFont) never resolved, not even from :root
//   - the "font" shorthand's var() regexp required var(--name) exactly, so a fallback in it made
//     the shorthand unreadable and switched pruning off
//   - a var() fallback is one raw token, so a list in it was pushed as a single mangled name and
//     the families it holds were dropped
import * as cssTree from "../../vendor/css-tree.js";

// the module reaches core/helper.js, which pulls in the frame hooks, and those install themselves
// against window and document as they are evaluated: the stubs go in before the dynamic import
globalThis.window = globalThis;
globalThis.document = {};
globalThis.Document = class Document { };
globalThis.MutationObserver = class MutationObserver { observe() { } };
const { process: removeUnusedFonts } = await import("../../modules/css-fonts-minifier.js");

const FONT_FACES = `
	@font-face{font-family:"UsedOne";src:url(one.woff2)}
	@font-face{font-family:"UsedTwo";src:url(two.woff2)}
	@font-face{font-family:"UsedThree";src:url(three.woff2)}
	@font-face{font-family:"Unused";src:url(unused.woff2)}`;

// what the rendered page reports as actually drawn: [family, weight, style, variant]. A family
// missing from this list is dropped whatever the stylesheets say, so it holds every family the
// tests below may legitimately keep
const USED_FONTS = [
	["usedone", "400", "normal", "normal"],
	["usedtwo", "400", "normal", "normal"],
	["usedthree", "400", "normal", "normal"]
];

const ALL_FAMILIES = ["usedone", "usedtwo", "usedthree", "unused"];

let failures = 0;

check("a plain family name prunes the rest",
	run({ rules: ".card p{font-family:\"UsedOne\",serif}" }),
	["usedone"]);

check("a property declared on :root resolves through the computed style",
	run({ rules: ":root{--probe-font:\"UsedOne\"}.card p{font-family:var(--probe-font),serif}", computed: { "--probe-font": "\"UsedOne\"" } }),
	["usedone"]);

check("a property declared on a descendant resolves through the declared values",
	run({ rules: ".card{--probe-font:\"UsedOne\"}.card p{font-family:var(--probe-font),serif}" }),
	["usedone"]);

check("a mixed-case property name is not lowercased away",
	run({ rules: ".card{--ProbeFont:\"UsedOne\"}.card p{font-family:var(--ProbeFont),serif}" }),
	["usedone"]);

check("a property declared inside a media query resolves too",
	run({ rules: "@media screen{.card{--probe-font:\"UsedOne\"}}.card p{font-family:var(--probe-font),serif}" }),
	["usedone"]);

check("several declared values are all kept as candidates",
	run({ rules: ".card{--probe-font:\"UsedOne\"}.note{--probe-font:\"UsedTwo\"}p{font-family:var(--probe-font),serif}" }),
	["usedone", "usedtwo"]);

check("a fallback list is parsed as a list, not as one name",
	run({ rules: ":root{--probe-font:\"UsedOne\"}.card p{font-family:var(--probe-font,\"UsedTwo\",\"UsedThree\"),serif}", computed: { "--probe-font": "\"UsedOne\"" } }),
	["usedone", "usedtwo", "usedthree"]);

check("the font shorthand resolves a uniquely declared property",
	run({ rules: ".card{--probe-font:\"UsedOne\"}.card p{font:italic 1em var(--probe-font)}" }),
	["usedone"]);

check("the font shorthand resolves a property written with a fallback",
	run({ rules: ".card{--probe-font:\"UsedOne\"}.card p{font:italic 1em var(--probe-font,serif)}" }),
	["usedone"]);

// the conservative half of the contract: when the value genuinely cannot be determined, every
// declared font stays, including the one no rule names. These are the cases the union does not
// cover, and getting them wrong loses fonts from the saved page rather than merely wasting bytes
check("a property declared nowhere keeps every font",
	run({ rules: ".card p{font-family:var(--set-by-script),serif}" }),
	ALL_FAMILIES);

// the shorthand cannot be substituted with several candidate values, but its var() sits in family
// position, so the parser hands it back as the family and the union answers it there instead
check("a font shorthand with several candidates resolves through the family",
	run({ rules: ".card{--probe-font:\"UsedOne\"}.note{--probe-font:\"UsedTwo\"}p{font:italic 1em var(--probe-font)}" }),
	["usedone", "usedtwo"]);

// a property holding the whole shorthand is the case the union must NOT touch: its values are not
// family lists, and reading them as such would drop every font in the document
check("a property holding a whole shorthand keeps every font",
	run({ rules: ".card{--font:italic 1em \"UsedOne\"}.note{--font:italic 1em \"UsedTwo\"}p{font:var(--font)}" }),
	ALL_FAMILIES);

check("a var() nested in a fallback keeps every font",
	run({ rules: ".card{--probe-font:\"UsedOne\"}.card p{font-family:var(--other,var(--probe-font),serif)}" }),
	ALL_FAMILIES);

// the check above leaves the family undetermined because the OUTER property is declared nowhere.
// A var() written in the font-family itself is split by the AST walk, which hands each branch over
// separately, so nesting alone was never the problem there. The chain that did give up is a var()
// inside a property VALUE: it was read one level deep and whatever it named stayed unresolved,
// which switched pruning off for the whole document
check("a property whose value is another declared property resolves through it",
	run({ rules: ".card{--first-font:var(--second-font)}.note{--second-font:\"UsedOne\"}.card p{font-family:var(--first-font),serif}" }),
	["usedone"]);

// splitting that value on every comma cut this one into "var(--second-font" and "\"UsedTwo\")",
// two names that resolve to nothing, and the document went undetermined over a value it holds in full
check("a value holding a var() with its own fallback is split on the top-level comma",
	run({ rules: ".card{--first-font:var(--second-font,\"UsedTwo\"),serif}.note{--second-font:\"UsedOne\"}.card p{font-family:var(--first-font)}" }),
	["usedone", "usedtwo"]);

// two properties naming each other resolve for ever without the guard: this check hangs rather
// than fails when it regresses
check("a property naming itself through another one keeps every font",
	run({ rules: ".card{--first-font:var(--second-font)}.note{--second-font:var(--first-font)}.card p{font-family:var(--first-font),serif}" }),
	ALL_FAMILIES);

// The rendered-fonts list is what says a declared face is really drawn, and an EMPTY one is not
// the same answer as a short one: every rendered element has a computed font-family, so an empty
// list means the computed styles could not be read at all. It happens for real. A frame whose
// contentDocument is unreachable is re-parsed from its srcdoc with DOMParser
// (processors/frame-tree/content/content-frame-tree.js), and that document is never rendered, so
// it reports no font and the frame lost EVERY face it declared — measured on derstandard.at,
// where the newsletter box inside such a frame fell back to a system font, and on MDN, where the
// text in the CSS-demo frame reflowed. The families are named right there in the frame's own CSS.
check("a document that reports no rendered font keeps every font",
	run({ rules: ".card p{font-family:\"UsedOne\",serif}", usedFonts: [] }),
	ALL_FAMILIES);

check("a property whose value is another undetermined property keeps every font",
	run({ rules: ".card{--probe-font:var(--set-by-script)}.card p{font-family:var(--probe-font),serif}" }),
	ALL_FAMILIES);

// An unquoted family name is a sequence of identifier tokens, and the walk that joins them has to
// resume after the LAST of them. Resuming after the first pushed every word but that one again as a
// family in its own right, so "Helvetica Neue Light" also claimed fonts named "Neue Light" and
// "Light". It only ever kept too much, which is why it went unnoticed; a page declaring a family
// whose name is the tail of another one paid for it.
const TAIL_FACES = `
	@font-face{font-family:"Helvetica Neue Light";src:url(one.woff2)}
	@font-face{font-family:"Neue Light";src:url(two.woff2)}
	@font-face{font-family:"Light";src:url(three.woff2)}`;

const TAIL_USED_FONTS = [
	["helvetica neue light", "400", "normal", "normal"],
	["neue light", "400", "normal", "normal"],
	["light", "400", "normal", "normal"]
];

check("a multi-word family name is read whole",
	run({ faces: TAIL_FACES, usedFonts: TAIL_USED_FONTS, rules: "p{font-family:Helvetica Neue Light,serif}" }),
	["helvetica neue light"]);

check("a quoted name is still matched by its quoted declaration",
	run({ faces: TAIL_FACES, usedFonts: TAIL_USED_FONTS, rules: "p{font-family:\"Neue Light\",serif}" }),
	["neue light"]);

// the token that ends a name is not always the comma: a string or a number ends it too, and the
// walk used to append the token's absent `name` to the family as the text "undefined"
check("a name is ended by a token that is not an identifier",
	run({ faces: TAIL_FACES, usedFonts: TAIL_USED_FONTS, rules: "p{font-family:Light \"Neue Light\"}" }),
	["neue light", "light"]);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
Deno.exit(failures ? 1 : 0);

function run({ rules, computed, faces = FONT_FACES, usedFonts = USED_FONTS }) {
	const stylesheet = cssTree.parse(faces + rules);
	const options = { usedFonts };
	const originalGetComputedStyle = globalThis.getComputedStyle;
	if (computed) {
		options.doc = { body: {} };
		globalThis.getComputedStyle = () => ({ getPropertyValue: name => computed[name] || "" });
	}
	try {
		removeUnusedFonts(createStubDocument(), [{ stylesheet }], [], options);
	} finally {
		globalThis.getComputedStyle = originalGetComputedStyle;
	}
	const families = [];
	stylesheet.children.forEach(ruleData => {
		if (ruleData.type == "Atrule" && ruleData.name == "font-face") {
			const declaration = ruleData.block.children.filter(node => node.property == "font-family").tail;
			families.push(cssTree.generate(declaration.data.value).replace(/^"|"$/g, "").toLowerCase());
		}
	});
	return families;
}

function check(label, actual, expected) {
	const ok = actual.length == expected.length && actual.every((family, index) => family == expected[index]);
	if (!ok) {
		failures++;
	}
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual.join(", ") || "(none)"}${ok ? "" : " (expected " + expected.join(", ") + ")"}`);
}

// the module only reaches the document to borrow a <style> element for unescaping content values
// and to read the body text, so a full DOM is not needed here
function createStubDocument() {
	return {
		createElement: () => ({ textContent: "", remove() { } }),
		body: { appendChild() { }, innerText: "" }
	};
}
