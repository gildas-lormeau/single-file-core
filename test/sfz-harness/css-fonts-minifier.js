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
// What happens when even the union cannot answer changed with it. Switching pruning off for the
// whole document was never a policy about uncertainty — a page naming its families plainly has
// always dropped a face it had not drawn yet, and only a page holding one unreadable value anywhere
// was spared, all of it. So the rendered list decides in that case too: a family the browser
// resolved when it drew the page is in that list whatever the stylesheets can be made to say. The
// one case that still keeps everything is the one where the rendering itself is missing.
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

// what survives when the stylesheets cannot say which family a value names: the faces the page
// declares AND the rendering reports having drawn with. It is USED_FONTS that decides there, so a
// face nothing drew is dropped even though nothing could be shown to name it either
const RENDERED_FAMILIES = ["usedone", "usedtwo", "usedthree"];

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

// The other half of the contract: what happens when the value genuinely cannot be determined. The
// stylesheets no longer decide there — the rendering does. The browser resolved the value when it
// drew the page, so whatever the property named is in the list of fonts reported as used, and a
// face absent from that list was drawn by nothing.
//
// It used to keep EVERY declared face, and not as a decision about uncertainty: a page naming its
// families plainly has always dropped a face it had not drawn yet, and only a page holding one
// value that happened not to parse was spared — the whole document, over one unreadable name. The
// case these checks still guard is the one below them, where the rendering itself is unavailable.
check("a property declared nowhere falls back to the fonts that were drawn",
	run({ rules: ".card p{font-family:var(--set-by-script),serif}" }),
	RENDERED_FAMILIES);

// the shorthand cannot be substituted with several candidate values, but its var() sits in family
// position, so the parser hands it back as the family and the union answers it there instead
check("a font shorthand with several candidates resolves through the family",
	run({ rules: ".card{--probe-font:\"UsedOne\"}.note{--probe-font:\"UsedTwo\"}p{font:italic 1em var(--probe-font)}" }),
	["usedone", "usedtwo"]);

// a property holding the whole shorthand is the case the union must NOT touch: its values are not
// family lists, and reading them as such would name families the document never had
check("a property holding a whole shorthand falls back to the fonts that were drawn",
	run({ rules: ".card{--font:italic 1em \"UsedOne\"}.note{--font:italic 1em \"UsedTwo\"}p{font:var(--font)}" }),
	RENDERED_FAMILIES);

check("a var() nested in a fallback falls back to the fonts that were drawn",
	run({ rules: ".card{--probe-font:\"UsedOne\"}.card p{font-family:var(--other,var(--probe-font),serif)}" }),
	RENDERED_FAMILIES);

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
check("a property naming itself through another one falls back to the fonts that were drawn",
	run({ rules: ".card{--first-font:var(--second-font)}.note{--second-font:var(--first-font)}.card p{font-family:var(--first-font),serif}" }),
	RENDERED_FAMILIES);

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

check("a property whose value is another undetermined property falls back to the fonts that were drawn",
	run({ rules: ".card{--probe-font:var(--set-by-script)}.card p{font-family:var(--probe-font),serif}" }),
	RENDERED_FAMILIES);

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

// font-style used to be compared as an exact string, so a page asking for italic never matched a
// face declared "oblique" or "oblique 0deg 20deg" — which is how MDN declares Inter and Fira Sans.
// A fallback rung papered over it by forcing BOTH sides of the comparison to "normal", which kept
// every slanted face of any family drawn at a compatible weight: apple.com carried 1.13 MB of SF
// Pro italics for a page holding no italic text at all. CSS Fonts 4 makes italic and oblique
// interchangeable, so they are matched as one bucket now and the rung is gone.
const STYLE_FACES = `
	@font-face{font-family:"Probe";font-style:normal;font-weight:400;src:url(n.woff2)}
	@font-face{font-family:"Probe";font-style:italic;font-weight:400;src:url(i.woff2)}
	@font-face{font-family:"Slanted";font-style:normal;font-weight:400;src:url(sn.woff2)}
	@font-face{font-family:"Slanted";font-style:oblique 0deg 20deg;font-weight:400;src:url(so.woff2)}
	@font-face{font-family:"Upright";font-style:normal;font-weight:400;src:url(u.woff2)}
	@font-face{font-family:"Ranged";font-style:oblique 0deg 20deg;font-weight:400;src:url(r.woff2)}
	@font-face{font-family:"Steep";font-style:normal;font-weight:400;src:url(tn.woff2)}
	@font-face{font-family:"Steep";font-style:oblique;font-weight:400;src:url(to.woff2)}
	@font-face{font-family:"Variable";font-stretch:75% 100%;font-style:oblique 0deg 20deg;font-weight:1 999;src:url(v.woff2)}`;
const STYLE_RULES = "p{font-family:\"Probe\"}q{font-family:\"Slanted\"}s{font-family:\"Upright\"}b{font-family:\"Ranged\"}u{font-family:\"Steep\"}i{font-family:\"Variable\"}";

function runStyles(usedFonts) {
	const stylesheet = cssTree.parse(STYLE_FACES + STYLE_RULES);
	removeUnusedFonts(createStubDocument(), [{ stylesheet }], [], { usedFonts });
	const kept = [];
	stylesheet.children.forEach(ruleData => {
		if (ruleData.type == "Atrule" && ruleData.name == "font-face") {
			const value = property => {
				const declaration = ruleData.block.children.filter(node => node.property == property).tail;
				return declaration ? cssTree.generate(declaration.data.value).replace(/^"|"$/g, "").toLowerCase() : "normal";
			};
			kept.push(`${value("font-family")} ${value("font-style")}`);
		}
	});
	return kept;
}

check("an italic face is dropped when only upright text was drawn",
	runStyles([["probe", "400", "normal", "normal"]]),
	["probe normal"]);

check("an italic face is kept when italic text was drawn",
	runStyles([["probe", "400", "normal", "normal"], ["probe", "400", "italic", "normal"]]),
	["probe normal", "probe italic"]);

check("an oblique face matches an italic request",
	runStyles([["slanted", "400", "italic", "normal"]]),
	["slanted normal", "slanted oblique 0deg 20deg"]);

// the rung that stays: nothing declares a slanted face, so the browser slants the upright one and
// reports italic. Dropping it would leave the text with no face at all
check("an upright face is kept when the italic it was slanted into was drawn",
	runStyles([["upright", "400", "italic", "normal"]]),
	["upright normal"]);

// the case the whole thing turns on, and the one that has nothing to do with italic text: an
// oblique RANGE starting at 0deg draws upright text too, so MDN's single variable Inter face is
// the only face on the page. Comparing the declaration as a string matches neither "normal" nor
// "italic", which drops it and leaves the document with no font at all
check("an oblique range reaching 0deg is kept for upright text",
	runStyles([["ranged", "400", "normal", "normal"]]),
	["ranged oblique 0deg 20deg"]);

check("an oblique range reaching 0deg is kept for italic text too",
	runStyles([["ranged", "400", "italic", "normal"]]),
	["ranged oblique 0deg 20deg"]);

// a plain "oblique" is 14deg, so it cannot draw upright text and nothing upright should keep it
check("a 14deg oblique face is dropped when only upright text was drawn",
	runStyles([["steep", "400", "normal", "normal"]]),
	["steep normal"]);

check("a 14deg oblique face is kept when italic text was drawn",
	runStyles([["steep", "400", "italic", "normal"]]),
	["steep normal", "steep oblique"]);

// the 2022 MDN page, declaration for declaration: ONE variable face carrying the whole site, with a
// weight RANGE and a style RANGE at once (font-stretch:75% 100%;font-style:oblique 0deg 20deg;
// font-weight:1 999, read off the November 2023 stylesheet). The weight ladder and the style range
// both have to admit it, and the page draws upright 400 text only. Dropping it is the 2023
// regression whole: the document keeps no face at all and renders in a system fallback
check("a variable face declaring a weight range and a style range is kept for upright text",
	runStyles([["variable", "400", "normal", "normal"]]),
	["variable oblique 0deg 20deg"]);

check("the same variable face is kept for the italic its range covers",
	runStyles([["variable", "400", "italic", "normal"]]),
	["variable oblique 0deg 20deg"]);

// a single font-weight in @font-face names that exact weight, not "this weight or anything heavier".
// Reading it as the range w..900 kept a face the browser can never select: the ladder below declares
// italic at 400, 600 and 700, the page draws italic at 400 and at 700, and the 600 face matched the
// 700 it had no part in drawing. Measured at 208,896 bytes on one real page, and the failure is
// silent because the archive renders correctly either way, it is only larger
const WEIGHT_FACES = `
	@font-face{font-family:"Ladder";font-style:italic;font-weight:400;src:url(w400.woff2)}
	@font-face{font-family:"Ladder";font-style:italic;font-weight:600;src:url(w600.woff2)}
	@font-face{font-family:"Ladder";font-style:italic;font-weight:700;src:url(w700.woff2)}`;
const WEIGHT_RULES = "p{font-family:\"Ladder\"}";

check("a weight the page never draws is dropped from between two it does",
	runWeights([["ladder", "400", "italic", "normal"], ["ladder", "700", "italic", "normal"]]),
	["ladder 400", "ladder 700"]);

check("the ladder keeps only the weight the page draws",
	runWeights([["ladder", "600", "italic", "normal"]]),
	["ladder 600"]);

// CSS resolves a codepoint two faces of one family, weight and style both cover to the LAST of them,
// so a subset whose every matching character a later subset also carries can never be selected. The
// three Fira Sans cyrillic subsets on the page this came from were each held open by one character,
// U+0301, which the later vietnamese subset covers too. Read "cover" as the declared unicode-range
// here, which is an approximation: what the browser actually selects on is the effective character
// map, so the subtraction is only sound because a Google Fonts subset carries exactly the glyphs its
// range names. The comment below the next block is the other half of that, and why an absent range
// is never read as covering everything
const COVERED_RANGE_FACES = `
	@font-face{font-family:"Subset";font-style:normal;font-weight:400;src:url(early.woff2);unicode-range:U+0300-0301}
	@font-face{font-family:"Subset";font-style:normal;font-weight:400;src:url(late.woff2);unicode-range:U+0300-0400}`;
const DISJOINT_RANGE_FACES = `
	@font-face{font-family:"Subset";font-style:normal;font-weight:400;src:url(early.woff2);unicode-range:U+0300-0301}
	@font-face{font-family:"Subset";font-style:normal;font-weight:400;src:url(late.woff2);unicode-range:U+0400-0500}`;
const RANGE_RULES = "p{font-family:\"Subset\"}";

check("a subset a later subset covers entirely is dropped",
	runRanges(COVERED_RANGE_FACES, "́"),
	["subset u+0300-0400"]);

// the rung that stays: the later subset does not reach U+0301, so the earlier one is the only face
// that can draw it and dropping it would leave that character to a fallback
check("a subset keeping one character of its own is kept",
	runRanges(DISJOINT_RANGE_FACES, "́ѐ"),
	["subset u+0300-0301", "subset u+0400-0500"]);

// the same overlap across different styles is not an overlap at all: the later face cannot draw
// upright text, so it takes nothing away from the earlier one
check("a later subset of another style does not cover the earlier one",
	runRanges(`
	@font-face{font-family:"Subset";font-style:normal;font-weight:400;src:url(early.woff2);unicode-range:U+0300-0301}
	@font-face{font-family:"Subset";font-style:italic;font-weight:400;src:url(late.woff2);unicode-range:U+0300-0400}`, "́",
	[["subset", "400", "normal", "normal"], ["subset", "400", "italic", "normal"]]),
	["subset u+0300-0301", "subset u+0300-0400"]);

// The shadowing above subtracts DECLARED ranges, and a declared range is only what the browser loads
// on. What it draws with is the font's effective character map, so a later face never shadows an
// earlier one just by covering it on paper. CSS Fonts 4 §5.2: "After downloading, if the effective
// character map supports the character in question, select that font. When the matched face is a
// composite face, user agents must use the procedure above on each of the faces in the composite face
// in reverse order of @font-face rule definition." §4.5.1 adds that a rule with no range "defaults to
// the entire range". So the last rule is checked first and a character it has no glyph for falls back
// to the rule before it, and the faces below are one composite face rather than a stack.
//
// These two exist because the tempting reading of §4.5.1 is that an absent range "defaults to the
// entire range", so a later face declaring none shadows every face before it. testReachableUnicodeRange
// carried a guard saying exactly that for a while, dead, and reviving it deletes the earlier rule:
// measured on a pair whose later face is icon-only, the three latin glyphs it has no glyph for went
// from Roboto on the page to Times-Roman in the capture. Real pages carry the shape — the Disqus
// frames on sandordargo.com declare `icons` twice with two different payloads, and science.org
// declares icomoon twice, where dropping the earlier rule once rendered a tofu box in place of a
// close button.
const COMPOSITE_FACES = `
	@font-face{font-family:"Subset";font-style:normal;font-weight:400;src:url(early.woff2)}
	@font-face{font-family:"Subset";font-style:normal;font-weight:400;src:url(late.woff2)}`;

check("every face of a composite face is kept when none declares a range",
	runSources(COMPOSITE_FACES, "A"),
	["subset url(early.woff2)", "subset url(late.woff2)"]);

// the same rule from the other side: an unranged face declared last covers everything on paper and
// still takes nothing away from the ranged face before it
const UNRANGED_LAST_FACES = `
	@font-face{font-family:"Subset";font-style:normal;font-weight:400;src:url(early.woff2);unicode-range:U+0041-005A}
	@font-face{font-family:"Subset";font-style:normal;font-weight:400;src:url(late.woff2)}`;

check("an unranged face declared last does not shadow the ranged face before it",
	runSources(UNRANGED_LAST_FACES, "A"),
	["subset url(early.woff2)", "subset url(late.woff2)"]);

// Two tests decided whether a unicode-range subset survived, and neither crossed with the other:
// docChars is one character set for the WHOLE document, and options.usedFonts is a list of
// (family, weight, style) tuples carrying no characters at all. So a face survived when its range
// held any character on the page AND its family was drawn somewhere, never when the characters in
// its range were drawn IN THAT FAMILY. On a page about Ancient Greek that keeps seven Fira Sans
// subsets the browser never requests: the Greek really is on the page, only ever set in Fira Sans
// normal 400, whose Greek subset is the one face that does load. The vietnamese subsets pass for a
// reason worth knowing separately, their range holds the combining diacritics U+0300-0329 that any
// IPA-heavy page is full of.
//
// The capture walk already visits every element for usedFonts, so it now also accumulates the
// characters each element draws, and the minifier keeps a face only when its range meets the
// characters actually drawn in that family.
//
// The bucket is keyed on family and STYLE, never on weight, and this is the trap: a measurement on
// the page above pruned 12 faces and 697,848 bytes when bucketed by the weight the computed style
// reports, and THREE of them were faces the browser had really drawn with. A declared
// "font-weight: normal" is not the string "400" a computed style reports, and more generally the
// CSS weight-selection algorithm has to run before comparing weights at all — which is what
// testUsedFont already does. So this gate unions over weights and layers on top of that one rather
// than replacing it.
//
// Every direction of doubt keeps the face: a family with no bucket, a style with no bucket, a
// bucket holding no characters at all, a range that cannot be parsed, and generated content whose
// characters cannot be read (counter(), attr(), an escape) all return true, because a character
// missed here drops a face the page needs.
//
// The empty bucket is the one that was found by measuring rather than by reasoning. A family can
// sit in the computed font-family of elements that draw no text of their own, and reading that as
// "no character is ever drawn in this family" dropped Inter from a real capture of techcrunch.com,
// a face the browser had loaded. So an empty bucket is uncertainty, not a negative.
const DRAWN_FACES = `
	@font-face{font-family:"Subset";font-style:normal;font-weight:400;src:url(latin.woff2);unicode-range:U+0041-005A}
	@font-face{font-family:"Subset";font-style:italic;font-weight:400;src:url(greek.woff2);unicode-range:U+0370-03FF}`;
const DRAWN_USED_FONTS = [["subset", "400", "normal", "normal"], ["subset", "400", "italic", "normal"]];
const LATIN_RANGE = [[0x41, 0x41]];
const LATIN_AND_GREEK_RANGES = [[0x41, 0x41], [0x391, 0x391]];

// the Greek IS on the page, so the document-wide test keeps the italic subset; it is only ever
// drawn upright, and that is what the cross product sees
check("a subset whose range is never drawn in its own family is dropped",
	runDrawn(DRAWN_FACES, "AΑ", [["subset", "normal", LATIN_AND_GREEK_RANGES, 0], ["subset", "italic", LATIN_RANGE, 0]]),
	["subset u+0041-005a"]);

check("a subset whose range is drawn in its own family is kept",
	runDrawn(DRAWN_FACES, "AΑ", [["subset", "normal", LATIN_RANGE, 0], ["subset", "italic", LATIN_AND_GREEK_RANGES, 0]]),
	["subset u+0041-005a", "subset u+0370-03ff"]);

// the capture could not read what one element draws, so that family and style answer for nothing
check("a bucket holding unreadable generated content keeps the face",
	runDrawn(DRAWN_FACES, "AΑ", [["subset", "normal", LATIN_AND_GREEK_RANGES, 0], ["subset", "italic", LATIN_RANGE, 1]]),
	["subset u+0041-005a", "subset u+0370-03ff"]);

// a capture that reports no characters at all must leave the old behaviour exactly as it was
check("no character data keeps every face the other tests keep",
	runDrawn(DRAWN_FACES, "AΑ", []),
	["subset u+0041-005a", "subset u+0370-03ff"]);

// the family is in a computed stack, but only on elements that draw no text of their own, so the
// bucket cannot say the range is unused
check("a family whose bucket holds no characters keeps its faces",
	runDrawn(DRAWN_FACES, "AΑ", [["subset", "normal", [], 0], ["subset", "italic", [], 0]]),
	["subset u+0041-005a", "subset u+0370-03ff"]);

// nothing was drawn italic, so there is no bucket to answer for the italic face and it is left to
// testUsedFont, which owns that question
check("a style the page never draws is left to the weight and style test",
	runDrawn(DRAWN_FACES, "AΑ", [["subset", "normal", LATIN_AND_GREEK_RANGES, 0]]),
	["subset u+0041-005a", "subset u+0370-03ff"]);

// the pin for the trap above: one bucket answers for every weight of its family and style
check("a face is not dropped for the weight its characters were drawn at",
	runDrawn(`
	@font-face{font-family:"Subset";font-style:normal;font-weight:400;src:url(regular.woff2);unicode-range:U+0041-005A}
	@font-face{font-family:"Subset";font-style:normal;font-weight:700;src:url(bold.woff2);unicode-range:U+0041-005A}`,
	"A",
	[["subset", "normal", LATIN_RANGE, 0]],
	[["subset", "400", "normal", "normal"], ["subset", "700", "normal", "normal"]]),
	["subset u+0041-005a", "subset u+0041-005a"]);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
Deno.exit(failures ? 1 : 0);

function runDrawn(faces, text, usedFontsCharacters, usedFonts = DRAWN_USED_FONTS) {
	return runFaces(faces + RANGE_RULES, text, usedFonts, "unicode-range", usedFontsCharacters);
}

function runWeights(usedFonts) {
	return runFaces(WEIGHT_FACES + WEIGHT_RULES, "", usedFonts, "font-weight");
}

function runRanges(faces, text, usedFonts = [["subset", "400", "normal", "normal"]]) {
	return runFaces(faces + RANGE_RULES, text, usedFonts, "unicode-range");
}

// faces of one composite member are told apart by their source, not by a range they do not declare
function runSources(faces, text, usedFonts = [["subset", "400", "normal", "normal"]]) {
	return runFaces(faces + RANGE_RULES, text, usedFonts, "src");
}

function runFaces(source, text, usedFonts, property, usedFontsCharacters) {
	const stylesheet = cssTree.parse(source);
	removeUnusedFonts(createStubDocument(text), [{ stylesheet }], [], { usedFonts, usedFontsCharacters });
	const kept = [];
	stylesheet.children.forEach(ruleData => {
		if (ruleData.type == "Atrule" && ruleData.name == "font-face") {
			const value = name => {
				const declaration = ruleData.block.children.filter(node => node.property == name).tail;
				return declaration ? cssTree.generate(declaration.data.value).replace(/^"|"$/g, "").toLowerCase() : "";
			};
			kept.push(`${value("font-family")} ${value(property)}`);
		}
	});
	return kept;
}

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
function createStubDocument(text = "") {
	return {
		createElement: () => ({ textContent: "", remove() { } }),
		body: { appendChild() { }, innerText: text }
	};
}
