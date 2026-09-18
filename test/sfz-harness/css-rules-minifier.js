// removeUnusedStyles skips a rule whose selector carries a pseudo-element or a state pseudo-class:
// analyzeSelector flags it unqueryable and the guard in processSelectors then never calls
// matchElements, so the selector is neither matched nor queued for removal and the rule survives
// whatever the document holds. The cost is not the CSS text, it is what the CSS text references —
// a design system that hangs its hero art on `.variant .hero_grad::before` gets every variant's
// image embedded, and on one Fujitsu press release that was 161 of 177 images and 26.1 MB of 26.3.
//
// The reachability test is restored here: every selector is queried through sanitizeSelector, which
// already strips pseudo-elements and unqueryable pseudo-classes, and only updateMatchingSelectors
// stays gated. That split is what keeps the cascade honest — a ::before or :hover rule's
// declarations must never be attributed to the originating element, or they out-compete that
// element's own declarations and get real ones removed as losing.
//
// The one case sanitizing cannot decide is an unqueryable pseudo-class inside the arguments of a
// functional pseudo-class, because normalizeSelectorNode does not descend into them: `.x:where(a:focus)`
// is queried literally and matches nothing while nothing is focused. Those selectors keep the old
// behaviour rather than being removed. `:not()` is treated the same way even though its direction is
// safe — `:not(:hover)` over-matches — because tracking the parity of nested `:not()` to prove it
// costs more than the handful of selectors it would recover.
import * as cssTree from "../../vendor/css-tree.js";
import { process as minifyRules } from "../../modules/css-rules-minifier.js";

let failures = 0;

const elements = {};

function element(name) {
	if (!elements[name]) {
		elements[name] = { tagName: "DIV", nodeType: 1, getAttribute: () => null };
	}
	return elements[name];
}

function createDocument(matches) {
	return {
		nodeType: 9,
		querySelectorAll(selectorText) {
			const names = matches[selectorText];
			return names ? names.map(element) : [];
		}
	};
}

function run(css, matches) {
	const stylesheet = cssTree.parse(css);
	const stylesheets = new Map();
	stylesheets.set({}, { stylesheet });
	minifyRules(createDocument(matches), stylesheets);
	return cssTree.generate(stylesheet);
}

function check(label, condition, detail) {
	if (!condition) {
		failures++;
	}
	console.log(`${condition ? "PASS" : "FAIL"} ${label}${condition ? "" : " -- " + detail}`);
}

const PRESENT = { ".present": ["a"], "*": ["a"] };

const pseudoResult = run(`
	.present:after{content:"";display:table}
	.absent:after{content:"";display:table}
	.present::before{color:red}
	.absent::before{color:red}
`, PRESENT);
check("a pseudo-element rule whose originating element exists is kept",
	pseudoResult.includes(".present:after") && pseudoResult.includes(".present::before"),
	pseudoResult);
check("a pseudo-element rule whose originating element is absent is removed",
	!pseudoResult.includes(".absent"),
	pseudoResult);
check("the kept pseudo-element rule keeps its declarations",
	pseudoResult.includes("content:\"\"") && pseudoResult.includes("display:table"),
	pseudoResult);

const stateResult = run(`
	.present:hover{color:red}
	.absent:hover{color:red}
`, PRESENT);
check("a state rule whose subject exists is kept",
	stateResult.includes(".present:hover") && stateResult.includes("color:red"),
	stateResult);
check("a state rule whose subject is absent is removed",
	!stateResult.includes(".absent"),
	stateResult);

const listResult = run(`
	.present,.absent::before{margin-right:1px}
	.present{margin-right:2px}
`, PRESENT);
check("a dead selector is dropped from a list whose other selector matches",
	!listResult.includes(".absent"),
	listResult);
check("the declaration of a rule with an unqueryable selector survives the cascade",
	listResult.includes("margin-right:1px") && listResult.includes("margin-right:2px"),
	listResult);

const cascadeControl = run(`
	.present{color:red}
	.present{color:blue}
`, PRESENT);
check("control: a losing declaration in fully queryable rules is still removed",
	!cascadeControl.includes("color:red") && cascadeControl.includes("color:blue"),
	cascadeControl);

const nestedResult = run(`
	.absent:where(a:focus){outline:1px}
	.absent:not(:hover){outline:2px}
	.absent:is(a:hover) .present{outline:3px}
`, PRESENT);
check("a state pseudo-class inside :where() keeps the rule, the query cannot decide it",
	nestedResult.includes(":where(a:focus)"),
	nestedResult);
check("a state pseudo-class inside :not() keeps the rule too, conservatively",
	nestedResult.includes(":not(:hover)"),
	nestedResult);
check("a state pseudo-class inside :is() keeps the rule",
	nestedResult.includes(":is(a:hover)"),
	nestedResult);

const viewTransitionResult = run(`
	::view-transition-group(card){opacity:1}
`, PRESENT);
check("a pseudo-element with no originating element sanitizes to * and is kept",
	viewTransitionResult.includes("view-transition-group"),
	viewTransitionResult);

const plainResult = run(`
	.present{color:red}
	.absent{color:blue}
`, PRESENT);
check("control: a plain selector matching nothing is still removed",
	plainResult.includes(".present") && !plainResult.includes(".absent"),
	plainResult);

const structuralResult = run(`
	.present:nth-child(2){color:red}
`, { ".present:nth-child(2)": ["a"], "*": ["a"] });
check("a tree-structural pseudo-class is queried as written, not stripped",
	structuralResult.includes(":nth-child(2)"),
	structuralResult);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
Deno.exit(failures ? 1 : 0);
