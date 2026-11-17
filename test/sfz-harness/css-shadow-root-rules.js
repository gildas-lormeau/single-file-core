// removeUnusedStyles used to leave every stylesheet of a shadow root as it was: the pass collects the
// sheets of the document only. A component library that adopts one large sheet in each of its shadow
// roots therefore had that sheet written whole into every root: on a Reddit thread with 240 comments,
// 1517 copies of a 251 KB sheet, 381 MB of a 394 MB page (SingleFile #1514).
//
// Sheets with the same text in roots of the same component (hosts with the same tag name) are parsed
// once and copied (resolveStylesheetsURLs), so the pass prunes that one sheet against every root that
// shares it: a rule goes when none of its selectors matches in any of them. It removes whole rules
// and leaves the cascade alone. A vote button and a menu sharing one sheet each get their own pruned
// copy, which took that Reddit page to 21 MB where one copy for all of them gave 73 MB.
//
// It runs on the tree the page is saved from, where a nested shadow root is still a <template> child
// of its host. That child is gone once the saved page is parsed, so a selector that depends on the
// siblings of an element (:first-child, :empty, + and ~) cannot be trusted there. It is tested without
// that part, which can only match more, and kept whenever the part sits where dropping it would
// match less, inside :not() for instance.
//
// The DOM is faked as in css-rules-minifier.js: a table says which roots hold a match for a selector
// text, and the elements it hands back answer closest() with their root.
import * as cssTree from "../../vendor/css-tree.js";
import { process as minifyRules } from "../../modules/css-rules-minifier.js";

const HOSTS = { c: "x-item", m: "x-menu" };

let failures = 0;

const roots = {};

function root(name) {
	if (name == "document") {
		return null;
	}
	if (!roots[name]) {
		roots[name] = { nodeType: 1, localName: "template", parentElement: { nodeType: 1, localName: HOSTS[name] || "x-item" } };
	}
	return roots[name];
}

function createDocument(matches) {
	return {
		nodeType: 9,
		querySelectorAll(selectorText) {
			const names = matches[selectorText];
			return names ? names.map(name => ({ tagName: "DIV", nodeType: 1, getAttribute: () => null, closest: () => root(name) })) : [];
		}
	};
}

function styleElement(css) {
	return { nodeType: 1, localName: "style", textContent: css };
}

// The first root of each component holds the parsed sheet, the others stand for the copies.
function run(css, matches, { adoptedIn = ["a", "b"], documentSheets = [] } = {}) {
	const stylesheets = new Map();
	const parsed = new Map();
	adoptedIn.forEach(name => {
		const stylesheetInfo = { scoped: true, scope: root(name) };
		const hostName = stylesheetInfo.scope.parentElement.localName;
		if (!parsed.has(hostName)) {
			stylesheetInfo.stylesheet = cssTree.parse(css, { parseCustomProperty: true });
			parsed.set(hostName, stylesheetInfo.stylesheet);
		}
		stylesheets.set(styleElement(css), stylesheetInfo);
	});
	const documentStylesheets = documentSheets.map(documentCss => {
		const stylesheet = cssTree.parse(documentCss, { parseCustomProperty: true });
		stylesheets.set(styleElement(documentCss), { stylesheet });
		return stylesheet;
	});
	minifyRules(createDocument(matches), stylesheets, new Map());
	const results = Array.from(parsed.values()).map(stylesheet => cssTree.generate(stylesheet));
	return { result: results[0], results, documentResults: documentStylesheets.map(stylesheet => cssTree.generate(stylesheet)) };
}

function check(label, condition, detail) {
	if (!condition) {
		failures++;
	}
	console.log(`${condition ? "PASS" : "FAIL"} ${label}${condition ? "" : " -- " + detail}`);
}

const MATCHES = { ".used": ["a"], ".used-in-b": ["b"], ".elsewhere": ["c"], ".in-document": ["document"], "*": ["a", "b", "c", "document"] };

{
	const { result } = run(".used{color:red}.used-in-b{color:red}.unused{color:red}.elsewhere{color:red}.in-document{color:red}", MATCHES);
	check("a rule matching in a root that shares the sheet is kept", result.includes(".used{"), result);
	check("a rule matching in another root that shares the sheet is kept", result.includes(".used-in-b{"), result);
	check("a rule matching nowhere is removed", !result.includes(".unused"), result);
	check("a rule matching only in a root that does not use the sheet is removed", !result.includes(".elsewhere"), result);
	check("a rule matching only in the document is removed", !result.includes(".in-document"), result);
}

{
	const { result } = run(".used{color:red}.unused{color:red}", MATCHES, { adoptedIn: ["a"] });
	check("a sheet used in one root only is pruned too", result == ".used{color:red}", result);
}

{
	const { result } = run(":host{display:block}:host(.dark) .unused{color:red}:host-context(.x) .unused{color:red}::slotted(.unused){color:red}.unused::part(label){color:red}:scope .unused{color:red}", MATCHES);
	check("a :host rule is kept", result.includes(":host{display:block}"), result);
	check("a rule under :host() is kept", result.includes(":host(.dark) .unused"), result);
	check("a rule under :host-context() is kept", result.includes(":host-context(.x) .unused"), result);
	check("a ::slotted() rule is kept", result.includes("::slotted(.unused)"), result);
	check("a ::part() rule is kept", result.includes(".unused::part(label)"), result);
	check("a :scope rule is kept", result.includes(":scope .unused"), result);
}

{
	const { result } = run(".used:hover{color:red}.unused:hover{color:red}.used::before{content:''}.unused::before{content:''}", MATCHES);
	check("a state rule whose element exists is kept", result.includes(".used:hover"), result);
	check("a state rule whose element is absent is removed", !result.includes(".unused:hover"), result);
	check("a pseudo-element rule whose element exists is kept", result.includes(".used::before"), result);
	check("a pseudo-element rule whose element is absent is removed", !result.includes(".unused::before"), result);
}

// The table holds no entry for ".used:first-child" or ".x+.used": a literal query would match nothing.
{
	const { result } = run(".used:first-child{color:red}.unused:first-child{color:red}.x+.used{color:red}.used~.unused{color:red}.used:empty{color:red}.used:nth-child(2n){color:red}:last-child{color:red}", MATCHES);
	check("a :first-child rule is tested without the pseudo-class", result.includes(".used:first-child"), result);
	check("and still goes when the rest matches nothing", !result.includes(".unused:first-child"), result);
	check("a sibling combinator is tested from its subject", result.includes(".x+.used"), result);
	check("and still goes when the subject matches nothing", !result.includes(".used~.unused"), result);
	check("an :empty rule is tested without the pseudo-class", result.includes(".used:empty"), result);
	check("an :nth-child() rule is tested without the pseudo-class", result.includes(".used:nth-child(2n)"), result);
	check("a compound holding nothing else is tested as *", result.includes(":last-child{"), result);
}

{
	const { result } = run(".unused:not(:first-child){color:red}:is(.x+.unused){color:red}.unused:not(:has(.y)){color:red}.unused:not(.z){color:red}", MATCHES);
	check("a sibling-dependent pseudo-class inside :not() keeps the rule", result.includes(".unused:not(:first-child)"), result);
	check("a sibling combinator inside :is() keeps the rule", result.includes(":is(.x+.unused)"), result);
	check(":has() inside :not() keeps the rule", result.includes(".unused:not(:has(.y))"), result);
	check("control: a plain :not() does not", !result.includes(".unused:not(.z)"), result);
}

{
	const { result } = run("@media (min-width:1px){.used{color:red}.unused{color:red}}@media print{.unused{color:red}}@layer base{.unused{color:red}}@keyframes spin{from{opacity:0}to{opacity:1}}@font-face{font-family:x;src:url(x.woff2)}", MATCHES);
	check("a conditional rule is pruned inside", result.includes("@media (min-width:1px){.used{color:red}}"), result);
	check("a conditional rule left empty is removed", !result.includes("print"), result);
	check("a layer left empty stays, it holds a place in the layer order", result.includes("@layer base{}"), result);
	check("keyframes are left alone", result.includes("@keyframes spin{from{opacity:0}to{opacity:1}}"), result);
	check("a font face is left alone", result.includes("@font-face{"), result);
}

{
	const { result } = run(".unused,.used{color:red}.unused,.elsewhere{color:red}", MATCHES);
	check("a rule is kept whole when one of its selectors matches", result.includes(".unused,.used{color:red}"), result);
	check("and removed when none does", !result.includes(".elsewhere"), result);
}

{
	const { result } = run("@namespace url(http://www.w3.org/2000/svg);.unused{color:red}", MATCHES);
	check("a sheet declaring a default namespace is left alone", result.includes(".unused"), result);
}

// Roots a and b belong to one component, root m to another: each component has its own copy.
{
	const { results } = run(".used{color:red}.used-in-menu{color:red}.unused{color:red}", { ...MATCHES, ".used-in-menu": ["m"] }, { adoptedIn: ["a", "b", "m"] });
	check("a component keeps what its own roots match", results[0] == ".used{color:red}", results[0]);
	check("and another component sharing the sheet keeps its own", results[1] == ".used-in-menu{color:red}", results[1]);
}

// The same text can also be a sheet of the document, which has its own copy and its own pass. That
// pass computes its cascade as if every element lived in the document, so it must not reach the copy
// of a shadow root, where the later document rule does not apply.
{
	const { result, documentResults } = run(".used{color:red}.in-document{color:red}", MATCHES, { adoptedIn: ["a"], documentSheets: [".used{color:red}.in-document{color:red}", ".used{color:blue}"] });
	check("the copy of a shadow root keeps a declaration a document rule would beat", result == ".used{color:red}", result);
	check("control: the copy of the document loses it", !documentResults[0].includes("color:red}.in") && documentResults[0].includes(".in-document{color:red}"), documentResults[0]);
}

if (failures) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");
