import { capture, html } from "./common.js";

// The other suites test the stylesheets somebody thought of. This one tests stylesheets nobody wrote:
// it generates them from a small grammar of everything a rule can be made of, and checks two things
// that must hold whatever the stylesheet is.
//
//   1. A save never fails because of a stylesheet. The page of SingleFile #2058 could not be saved
//      at all because one rule was written `:is(){…}`, valid and unusual, and the pass normalising
//      selectors read the first item of that empty list. A stylesheet is a third party's input, and
//      the worst a pass may do with a rule it does not understand is keep it.
//   2. Saving a saved page changes nothing. The stylesheet of a saved page has been through every
//      pass once: a second run that removes or rewrites something more means the first run left its
//      output in a state the passes do not agree on. This one does not hold yet: about 3 generated
//      stylesheets in 100 lose something more on the second save (an emptied rule, a declaration
//      overridden in the same rule, a selector of a list, spaces). It is counted and printed, and
//      becomes a check with CSS_STRICT_REPEAT=1, to work on the passes one at a time.
//
// The stylesheets are drawn from a seeded generator, so a run is reproducible and a failure prints
// the seed and the stylesheet that caused it. A share of them is then damaged (characters removed,
// repeated or swapped) because a real stylesheet is not always valid either.
//
//   deno run --allow-read --allow-env test/capture/css-generated-stylesheets.js
//   CSS_SEED=12345 CSS_CASES=5000 deno run ... the same with another seed and more cases
//   CSS_DAMAGED=0 ... no damaged stylesheet, CSS_REPORTS=100 ... print more of the failing cases
//
// When this fails, the stylesheet printed is a new case for the suite of the pass that failed.

const PAGE_URL = "https://example.com/page.html";
const DEFAULT_SEED = 20261117;
const DEFAULT_CASES = 400;
const MAX_DEPTH = 3;
const DEFAULT_DAMAGED_SHARE = 0.25;
const BODY = "<div class=\"a used\" id=\"i\"><p class=\"b\" lang=\"en\"><a href=\"#\" data-x=\"1\">link</a><span>text</span></p>" +
	"<ul><li>one</li><li class=\"b\">two</li></ul><input type=\"text\" disabled><svg><rect width=\"1\" height=\"1\"></rect></svg></div>";
const OPTION_SETS = [
	{ removeUnusedStyles: true },
	{ removeUnusedStyles: true, removeAlternativeMedias: true, removeAlternativeFonts: true, compressCSS: true },
	{ removeUnusedStyles: true, moveStylesInHead: true, groupDuplicateStylesheets: true, removeAlternativeImages: true },
	{ removeUnusedStyles: false, compressCSS: true }
];

const TYPES = ["a", "p", "div", "span", "li", "ul", "input", "rect", "svg", "x-item", "*", "html", "body"];
const CLASSES = [".a", ".b", ".used", ".unused", ".x-1", ".\\31 0", ".a\\:b"];
const IDS = ["#i", "#none", "#\\#"];
const ATTRIBUTES = ["[href]", "[data-x=\"1\"]", "[lang|=en]", "[class~=a i]", "[href^='#' s]", "[type=text]", "[data-x=1]", "[xlink|href]", "[*|href]", "[|href]"];
const PSEUDO_CLASSES = [":hover", ":focus", ":focus-visible", ":first-child", ":last-child", ":only-child", ":empty", ":root", ":disabled", ":checked",
	":link", ":any-link", ":target", ":defined", ":host", ":scope", ":popover-open", ":not-a-pseudo-class", ":-moz-focusring", ":-webkit-autofill"];
const FUNCTIONAL_PSEUDO_CLASSES = [":is", ":where", ":not", ":has", ":host", ":host-context", ":matches", ":-webkit-any", ":-moz-any"];
const ARGUMENT_PSEUDO_CLASSES = [":nth-child(2n+1)", ":nth-child(odd of .b)", ":nth-last-child(1)", ":nth-of-type(2)", ":lang(en)", ":dir(rtl)", ":state(open)",
	":nth-child()", ":lang()", ":nth-child(2n + 1 of)", ":unknown-function(a, b)"];
const PSEUDO_ELEMENTS = ["::before", "::after", ":before", "::marker", "::placeholder", "::selection", "::first-line", "::part(label)", "::slotted(span)",
	"::slotted()", "::-webkit-scrollbar", "::-moz-range-thumb", "::view-transition-group(*)", "::highlight(search)", "::not-a-pseudo-element"];
const COMBINATORS = [" ", " > ", " + ", " ~ ", ">", "+", "~", " || "];
const NAMESPACE_PREFIXES = ["svg|", "*|", "|", "unknown|"];
const PROPERTIES = ["color", "background", "width", "margin", "font-family", "content", "display", "--x", "--Y", "-webkit-appearance", "grid-template-areas", "transition", "not-a-property"];
const VALUES = ["red", "#00f", "rgb(1 2 3 / 50%)", "calc(100% - (2px * 3))", "var(--x, var(--Y, 1px))", "url(data:image/gif;base64,R0lGODlhAQABAAAAACw=)",
	"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E\")", "\"\\\"\"", "'a\\'b'", "\"\\201C\"", "1px solid", "light-dark(#fff, #000)",
	"-webkit-box", "min(1px, 2em)", "\"a\" \"b\"", "all 1s cubic-bezier(.1, .2, .3, 1)", "{ a: b }", "", "initial", "1px !ie", "expression(1)", "env(safe-area-inset-top, 0)"];
const MEDIA_CONDITIONS = ["screen", "print", "(min-width: 1px)", "screen and (max-width: 100px)", "not all", "(pointer: coarse)", "(width >= 1px)", "only screen, print", "", "(unknown-feature)"];
const SUPPORTS_CONDITIONS = ["(display: grid)", "not (display: grid)", "selector(:is())", "selector(:has(a))", "(display: grid) and (not (display: inline-grid))", "font-tech(color-COLRv1)", "(unknown: value)"];
const CONTAINER_CONDITIONS = ["(min-width: 1px)", "card (width > 1px)", "style(--x: 1)", ""];

const seed = Number(Deno.env.get("CSS_SEED")) || DEFAULT_SEED;
const casesCount = Number(Deno.env.get("CSS_CASES")) || DEFAULT_CASES;
const damagedShare = Deno.env.get("CSS_DAMAGED") === undefined ? DEFAULT_DAMAGED_SHARE : Number(Deno.env.get("CSS_DAMAGED"));
const random = getRandom(seed);
let failed = false;
let saveFailures = 0, repeatFailures = 0, reportsCount = 0;

for (let indexCase = 0; indexCase < casesCount; indexCase++) {
	let css = getStylesheet();
	if (random() < damagedShare) {
		css = damage(css);
	}
	const options = pick(OPTION_SETS);
	let content, errorMessage;
	try {
		content = await save(css, options);
	} catch (error) {
		errorMessage = error.stack || error.message;
	}
	if (errorMessage) {
		saveFailures++;
		report("the save failed", indexCase, options, css, errorMessage);
	} else {
		const savedCss = getStyleTexts(content);
		let repeatedCss;
		try {
			repeatedCss = getStyleTexts(await save(savedCss.join("\n"), options));
		} catch (error) {
			saveFailures++;
			report("the save of the saved page failed", indexCase, options, savedCss.join("\n"), error.stack || error.message);
		}
		if (repeatedCss && repeatedCss.join("\n") != savedCss.join("\n")) {
			repeatFailures++;
			reportRepeat("saving the saved page changed its stylesheet", indexCase, options, css, "first save:  " + savedCss.join("\n") + "\nsecond save: " + repeatedCss.join("\n"));
		}
	}
}

check("no stylesheet makes the save fail (" + casesCount + " generated, seed " + seed + ")", saveFailures, 0);
if (Deno.env.get("CSS_STRICT_REPEAT")) {
	check("saving a saved page leaves its stylesheet unchanged", repeatFailures, 0);
} else {
	console.log("INFO saving a saved page changed its stylesheet in " + repeatFailures + " cases of " + casesCount + " (not a check yet, see the header)");
}
{
	let errorMessage;
	try {
		await save(":is() { color: red } a { color: blue }", OPTION_SETS[0]);
	} catch (error) {
		errorMessage = error.message;
	}
	check("control: the stylesheet of #2058 is saved", errorMessage, undefined);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function save(css, options) {
	const page = html(BODY, "<style>" + css.replace(/<\/style/gi, "<\\/style") + "</style>");
	return capture({ [PAGE_URL]: { body: page } }, { url: PAGE_URL, content: page, ...options });
}

function getStyleTexts(content) {
	return Array.from(content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)).map(match => match[1]);
}

function getStylesheet() {
	const rules = [];
	if (random() < 0.1) {
		rules.push("@charset \"utf-8\";");
	}
	if (random() < 0.15) {
		rules.push(pick(["@namespace svg url(http://www.w3.org/2000/svg);", "@namespace url(http://www.w3.org/1999/xhtml);", "@namespace xlink \"http://www.w3.org/1999/xlink\";"]));
	}
	if (random() < 0.15) {
		rules.push(pick(["@layer base, theme;", "@layer base;", "@layer;"]));
	}
	const rulesCount = 1 + Math.floor(random() * 6);
	for (let indexRule = 0; indexRule < rulesCount; indexRule++) {
		rules.push(getRule(0));
	}
	return rules.join(pick(["", " ", "\n", "/* comment */"]));
}

function getRule(depth) {
	const choice = random();
	if (depth >= MAX_DEPTH || choice < 0.5) {
		return getStyleRule(depth);
	} else if (choice < 0.6) {
		return "@media " + pick(MEDIA_CONDITIONS) + " {" + getRules(depth) + "}";
	} else if (choice < 0.67) {
		return "@supports " + pick(SUPPORTS_CONDITIONS) + " {" + getRules(depth) + "}";
	} else if (choice < 0.74) {
		return "@layer" + pick(["", " base", " theme.sub"]) + " {" + getRules(depth) + "}";
	} else if (choice < 0.79) {
		return "@container " + pick(CONTAINER_CONDITIONS) + " {" + getRules(depth) + "}";
	} else if (choice < 0.84) {
		return "@scope" + pick(["", " (.a)", " (.a) to (.b)", " (:is())", " to (.b)"]) + " {" + getRules(depth) + "}";
	} else if (choice < 0.88) {
		return "@starting-style {" + getRules(depth) + "}";
	} else if (choice < 0.92) {
		return "@keyframes " + pick(["spin", "\"quoted\"", "none-such"]) + " {" + pick(["from", "0%", "0%, 50%", "entry 10%"]) + " {" + getDeclarations() + "} to {" + getDeclarations() + "}}";
	} else if (choice < 0.95) {
		return "@font-face {font-family: " + pick(["f", "\"g h\""]) + "; src: " + pick(["local(x)", "url(data:font/woff2;base64,d09GMg==) format(\"woff2\")", "url(f.woff) format(woff) tech(variations), local(\"y\")", ""]) + "; unicode-range: U+0-7F}";
	} else if (choice < 0.97) {
		return "@property --x {syntax: \"<length>\"; inherits: false; initial-value: 0px}";
	} else {
		return pick(["@page :first {margin: 1in}", "@counter-style c {system: cyclic; symbols: \"*\"}", "@unknown-rule x {a{color:red}}", "@unknown-statement x;", "@font-palette-values --p {font-family: f}",
			"@position-try --t {top: anchor(bottom)}", "@view-transition {navigation: auto}"]);
	}
}

function getRules(depth) {
	const rules = [];
	const rulesCount = Math.floor(random() * 3);
	for (let indexRule = 0; indexRule < rulesCount; indexRule++) {
		rules.push(getRule(depth + 1));
	}
	if (random() < 0.2) {
		rules.push(getDeclarations());
	}
	return rules.join("");
}

function getStyleRule(depth) {
	let content = getDeclarations();
	if (depth < MAX_DEPTH && random() < 0.2) {
		content += (content && !content.endsWith(";") ? ";" : "") + pick(["&", "& ", "", "> ", "+ "]) + getRule(depth + 1);
		if (random() < 0.5) {
			content += getDeclarations();
		}
	}
	return getSelectorList(0) + " {" + content + "}";
}

function getDeclarations() {
	const declarations = [];
	const declarationsCount = Math.floor(random() * 4);
	for (let indexDeclaration = 0; indexDeclaration < declarationsCount; indexDeclaration++) {
		declarations.push(pick(PROPERTIES) + pick([":", ": ", " : "]) + pick(VALUES) + (random() < 0.15 ? pick([" !important", "!important", " ! important"]) : ""));
	}
	return declarations.join(pick([";", "; ", ";;"])) + (random() < 0.5 ? ";" : "");
}

function getSelectorList(depth) {
	const selectors = [];
	const selectorsCount = random() < 0.08 ? 0 : 1 + Math.floor(random() * 3);
	for (let indexSelector = 0; indexSelector < selectorsCount; indexSelector++) {
		selectors.push(getSelector(depth));
	}
	return selectors.join(pick([",", ", "]));
}

function getSelector(depth) {
	const compounds = [];
	const compoundsCount = 1 + Math.floor(random() * 3);
	for (let indexCompound = 0; indexCompound < compoundsCount; indexCompound++) {
		compounds.push(getCompound(depth));
	}
	let selector = compounds.reduce((text, compound) => text ? text + pick(COMBINATORS) + compound : compound, "");
	if (random() < 0.08) {
		selector = pick(["> ", "+ ", "~ ", "& ", "&", "& > "]) + selector;
	}
	return selector;
}

function getCompound(depth) {
	let compound = "";
	if (random() < 0.08) {
		compound += pick(NAMESPACE_PREFIXES);
	}
	if (random() < 0.6) {
		compound += pick(TYPES);
	}
	const partsCount = Math.floor(random() * 3) + (compound ? 0 : 1);
	for (let indexPart = 0; indexPart < partsCount; indexPart++) {
		const choice = random();
		if (choice < 0.3) {
			compound += pick(CLASSES);
		} else if (choice < 0.4) {
			compound += pick(IDS);
		} else if (choice < 0.55) {
			compound += pick(ATTRIBUTES);
		} else if (choice < 0.7) {
			compound += pick(PSEUDO_CLASSES);
		} else if (choice < 0.8) {
			compound += pick(ARGUMENT_PSEUDO_CLASSES);
		} else if (choice < 0.92) {
			compound += pick(FUNCTIONAL_PSEUDO_CLASSES) + "(" + (depth < MAX_DEPTH ? getSelectorList(depth + 1) : "") + ")";
		} else {
			compound += "&";
		}
	}
	if (random() < 0.12) {
		compound += pick(PSEUDO_ELEMENTS) + (random() < 0.3 ? pick(PSEUDO_CLASSES) : "");
	}
	return compound;
}

function damage(css) {
	const editsCount = 1 + Math.floor(random() * 3);
	for (let indexEdit = 0; indexEdit < editsCount && css.length > 1; indexEdit++) {
		const position = Math.floor(random() * css.length);
		const choice = random();
		if (choice < 0.4) {
			css = css.substring(0, position) + css.substring(position + 1);
		} else if (choice < 0.7) {
			css = css.substring(0, position) + css[position] + css.substring(position);
		} else {
			css = css.substring(0, position) + pick(["{", "}", "(", ")", "[", "]", "\"", "'", "\\", "/*", "<!--", "@", ";", ","]) + css.substring(position);
		}
	}
	return css;
}

function pick(values) {
	return values[Math.floor(random() * values.length)];
}

function getRandom(state) {
	return () => {
		state = (state + 0x6D2B79F5) | 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function report(label, indexCase, options, css, detail) {
	reportsCount++;
	if (reportsCount <= (Number(Deno.env.get("CSS_REPORTS")) || 12)) {
		console.log("     " + label + " (case " + indexCase + ", seed " + seed + ", options " + JSON.stringify(options) + ")");
		console.log("     stylesheet: " + css);
		console.log("     " + detail.split("\n").slice(0, 6).join("\n     "));
	}
}

function reportRepeat(...args) {
	if (Deno.env.get("CSS_STRICT_REPEAT")) {
		report(...args);
	}
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
