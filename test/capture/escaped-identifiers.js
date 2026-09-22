import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";

// A CSS identifier is compared by what it means, not by how it is spelled: `\61` is `a`, and a
// pseudo-class name is ASCII case-insensitive. The pass compared spellings, so an escape or a
// capital defeated three separate protections, each reproduced on df1a44f in Chromium 151,
// Firefox 153 and WebKit 26.5. An escaped layer name was read as a layer of its own, so the order
// of the two came out reversed. The `revert-layer` keyword was matched by name, so an escaped one
// slipped past the rollback protection and the declaration it rolls back to was pruned. And
// `:WHERE()` in upper case was not recognized as the zero-specificity form, so the id inside it was
// counted and the rule won a cascade it loses live.
// The dotted form is what makes the layer case more than a decode: `@layer a\.b` is ONE layer
// literally named `a.b`, unrelated to `a` and its sublayer `b`, so the name has to be split on its
// unescaped dots before each segment is decoded, and the decoded segments joined on a separator no
// decoded name can hold.
const cases = [
	{
		label: "an escaped layer name is the layer it spells",
		css: "@layer a, b; @layer b { p { color: blue } } @layer \\61 { p { color: red } }",
		body: "<p>t</p>",
		kept: ["color:blue"],
		removed: ["color:red"]
	},
	{
		label: "control: the same layers written without an escape",
		css: "@layer a, b; @layer b { p { color: blue } } @layer a { p { color: red } }",
		body: "<p>t</p>",
		kept: ["color:blue"],
		removed: ["color:red"]
	},
	{
		label: "control: an escaped dot is part of the name, not a sublayer separator",
		css: "@layer a\\.b { p { color: red } } @layer c { p { color: blue } } @layer a { @layer b { p { color: green } } }",
		body: "<p>t</p>",
		kept: ["color:green"],
		removed: ["color:red", "color:blue"]
	},
	{
		label: "control: an escaped layer name still orders after a layer declared before it",
		css: "@layer \\61 { p { color: red } } @layer b { p { color: blue } }",
		body: "<p>t</p>",
		kept: ["color:blue"],
		removed: ["color:red"]
	},
	// The keyword is written inside a var() fallback because a bare `color: r\65 vert-layer` cannot
	// be measured here: the value validity check falls back to the css-tree lexer when CSS.supports
	// is missing, as it is under deno, the lexer does not decode escapes, so the declaration is read
	// as invalid and deleted. The rollback target then survives for the wrong reason and the check
	// passes whatever the keyword test does. A var() fallback is valid to the lexer, so the keyword
	// test is what decides. The bare form is verified in a browser instead, where CSS.supports
	// answers true: Chromium 151, Firefox 153 and WebKit 26.5 all keep the red declaration on
	// 2026-09-22, and all three drop it before this fix.
	{
		label: "an escaped revert-layer keeps what it rolls back to",
		css: "@layer a { p { color: red } } @layer b { p { color: var(--nope, r\\65 vert-layer) } }",
		body: "<p>t</p>",
		kept: ["color:red"],
		removed: []
	},
	{
		label: "control: an unescaped revert-layer keeps the same declaration",
		css: "@layer a { p { color: red } } @layer b { p { color: var(--nope, revert-layer) } }",
		body: "<p>t</p>",
		kept: ["color:red"],
		removed: []
	},
	{
		label: "control: a fallback that is not revert-layer still prunes what it beats",
		css: "@layer a { p { color: red } } @layer b { p { color: var(--nope, blue) } }",
		body: "<p>t</p>",
		kept: ["var(--nope,blue)"],
		removed: ["color:red"]
	},
	{
		label: "an uppercase :WHERE() has no specificity",
		css: "p:WHERE(#t) { color: red } .box p { color: blue }",
		body: "<div class=\"box\"><p id=\"t\">t</p></div>",
		kept: ["color:blue"],
		removed: ["color:red"]
	},
	{
		label: "control: the lowercase form reaches the same verdict",
		css: "p:where(#t) { color: red } .box p { color: blue }",
		body: "<div class=\"box\"><p id=\"t\">t</p></div>",
		kept: ["color:blue"],
		removed: ["color:red"]
	},
	{
		label: "control: an uppercase :IS() does count the id it holds",
		css: "p:IS(#t) { color: red } .box p { color: blue }",
		body: "<div class=\"box\"><p id=\"t\">t</p></div>",
		kept: ["color:red"],
		removed: ["color:blue"]
	},
	// The same rule applies to the name of an at-rule, which was compared raw, without even lowering
	// its case. Every protection the pass keys on that name was lost: the layer order, the
	// conditional context a rule sits in, the exemption that keeps `@keyframes` out of selector
	// pruning, and the scoping root. Each shape below was reproduced in Chromium 151, Firefox 153 and
	// WebKit 26.5 on c51d9b2, in both the escaped and the upper-case spelling.
	// css-tree recognises its own at-rule names by spelling too, so an ESCAPED one is parsed with a
	// Raw prelude instead of a structured one. That costs nothing where the pass only reads the
	// prelude back as text, which is the layer and conditional cases, but `@scope` needs the parsed
	// form, so the pass re-parses a Raw prelude before reading it.
	{
		label: "an escaped @layer keeps the order its statement declares",
		css: "@l\\61 yer b, a; @l\\61 yer a { p { color: red } } @l\\61 yer b { p { color: blue } }",
		body: "<p>t</p>",
		kept: ["color:red"],
		removed: ["color:blue"]
	},
	{
		label: "an upper-case @LAYER keeps it too",
		css: "@LAYER b, a; @LAYER a { p { color: red } } @LAYER b { p { color: blue } }",
		body: "<p>t</p>",
		kept: ["color:red"],
		removed: ["color:blue"]
	},
	{
		label: "control: the same layers with the plain spelling",
		css: "@layer b, a; @layer a { p { color: red } } @layer b { p { color: blue } }",
		body: "<p>t</p>",
		kept: ["color:red"],
		removed: ["color:blue"]
	},
	{
		label: "an escaped @media still separates the conditional context",
		css: "p { color: blue } @m\\65 dia print { p { color: red } }",
		body: "<p>t</p>",
		kept: ["color:blue", "color:red"],
		removed: []
	},
	{
		label: "an upper-case @MEDIA separates it too",
		css: "p { color: blue } @MEDIA print { p { color: red } }",
		body: "<p>t</p>",
		kept: ["color:blue", "color:red"],
		removed: []
	},
	{
		label: "control: a plain @media separates it",
		css: "p { color: blue } @media print { p { color: red } }",
		body: "<p>t</p>",
		kept: ["color:blue", "color:red"],
		removed: []
	},
	{
		label: "an escaped @keyframes is still exempt from selector pruning",
		css: "p { animation: c 1s } @k\\65 yframes c { from { color: red } to { color: blue } }",
		body: "<p>t</p>",
		kept: ["color:red", "color:blue"],
		removed: []
	},
	{
		label: "an upper-case @KEYFRAMES is exempt too",
		css: "p { animation: c 1s } @KEYFRAMES c { from { color: red } to { color: blue } }",
		body: "<p>t</p>",
		kept: ["color:red", "color:blue"],
		removed: []
	},
	{
		label: "an escaped @scope still scopes its rules",
		css: "@sc\\6f pe (.box) { p { color: red } } p { color: blue }",
		body: "<div class=\"box\"><p>in</p></div><p>out</p>",
		kept: ["color:red"],
		removed: []
	},
	// The escaped `:\73 cope` twin of the case below is absent on purpose and lives in the browser
	// lane instead. happy-dom 20.14.5 does not decode an escape anywhere in a selector: it throws
	// `not a valid selector` on `:\73 cope` and on `details[o\70 en] p`, and answers false for
	// `.b\6f x`, where all three browsers answer as if the escape were spelled out. Any case that
	// needs the DOM to match an escaped selector is therefore undecidable here.
	{
		label: "control: a plain :scope names the scoping root",
		css: "@scope (.box) { :scope { color: red } }",
		body: "<div class=\"box\">t</div>",
		kept: ["color:red"],
		removed: []
	},
	{
		label: "an escaped state attribute is still read as a state",
		css: "p { color: blue } details[o\\70 en] p { color: red }",
		body: "<details><summary>s</summary><p>t</p></details>",
		kept: ["color:red"],
		removed: []
	},
	{
		label: "control: the same state attribute with the plain spelling",
		css: "p { color: blue } details[open] p { color: red }",
		body: "<details><summary>s</summary><p>t</p></details>",
		kept: ["color:red"],
		removed: []
	}
];

let failed = false;

for (const testCase of cases) {
	const page = html(testCase.body, "<style>" + testCase.css + "</style>");
	const content = await capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, removeUnusedStyles: true });
	const styleText = content.substring(content.indexOf("<style>"), content.indexOf("</style>"));
	testCase.kept.forEach(fragment => check(testCase.label + ", kept " + fragment, styleText.includes(fragment), true));
	testCase.removed.forEach(fragment => check(testCase.label + ", removed " + fragment, styleText.includes(fragment), false));
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
