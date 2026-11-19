// Three modules read globals when they are evaluated, so every one of them has to exist before core
// is imported: core/util.js captures DOMParser, and processors/hooks/content/content-hooks-frames.js
// reads globalThis.window, then calls init() and new MutationObserver(init) at module scope. That
// hook belongs to the page world and does nothing useful here; it only has to load without throwing.
// Import this module first and import single-file.js dynamically, the way common.js does.
//
// happy-dom rather than deno-dom, because core reads IDL properties and deno-dom implements almost
// none of them. Three of those gaps needed shims here, and the fourth was not noticed until it broke
// a suite: deno-dom does not reflect `.type`, so saveFilenameTemplateData() produced a
// `<script data-single-file-options>` carrying no type at all, which core's own
// `script[type="application/json"][data-single-file-options]` selector does not match. The harness
// was agreeing with itself and disagreeing with every browser. happy-dom reflects `type`, `media`,
// `rel` and `href`, resolves `href` against the base the way a browser does, keeps `xlink:href`, and
// implements both NS attribute methods, so no shim is needed for any of it.
import { Window } from "npm:happy-dom@20.14.5";

const window = new Window();

globalThis.DOMParser = window.DOMParser;
globalThis.Document = window.Document;
globalThis.Element = window.Element;
globalThis.window = globalThis;

// core/infobar.js resets the host element by enumerating its computed style, so a capture that
// includes the infobar throws without this. The element it enumerates belongs to a document parsed
// by the DOMParser above, not to this window, and happy-dom answers for it all the same.
globalThis.getComputedStyle = element => window.getComputedStyle(element);

// core/infobar.js finds the comment SingleFile writes at the top of a saved page with
// document.evaluate("//comment()", …, FIRST_ORDERED_NODE_TYPE), which gives the first comment of the
// document in document order, whether it is a child of the document or of an element. happy-dom
// has no XPath at all. Only that expression is answered here, any other one throws so that a new
// use in core is noticed. The method goes on the prototype of a parsed document: the documents
// of the DOMParser do not inherit from window.Document.prototype.
globalThis.Node = window.Node;
globalThis.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9 };
Object.getPrototypeOf(new window.DOMParser().parseFromString("", "text/html")).evaluate = function (expression, contextNode, resolver, type) {
	if (expression != "//comment()" || type != globalThis.XPathResult.FIRST_ORDERED_NODE_TYPE) {
		throw new Error("document.evaluate is not shimmed for " + expression);
	}
	return { singleNodeValue: findFirstComment(contextNode) };
};

function findFirstComment(node) {
	for (const childNode of node.childNodes) {
		const comment = childNode.nodeType == window.Node.COMMENT_NODE ? childNode : findFirstComment(childNode);
		if (comment) {
			return comment;
		}
	}
	return null;
}

// happy-dom has a real MutationObserver, and that is the reason not to use it: the hook above
// observes the document and re-runs init() on every mutation a capture makes. It has nothing to do
// here, and the stub keeps it from being called once per mutation for the length of a capture.
// core reads the referrerPolicy IDL property, which a browser reflects "limited to only known values":
// matched case-insensitively, never trimmed, and "" for anything else. Measured in Chrome on
// "No-Referrer", " origin " and "bogus": "no-referrer", "", "". happy-dom returns the raw attribute
// for all three, so the reflection is redefined here the way the browser does it.
const REFERRER_POLICIES = ["no-referrer", "no-referrer-when-downgrade", "same-origin", "origin", "strict-origin", "origin-when-cross-origin", "strict-origin-when-cross-origin", "unsafe-url"];
[window.HTMLImageElement, window.HTMLLinkElement, window.HTMLScriptElement].forEach(elementClass => {
	Object.defineProperty(elementClass.prototype, "referrerPolicy", {
		configurable: true,
		get() {
			const value = (this.getAttribute("referrerpolicy") || "").toLowerCase();
			return REFERRER_POLICIES.includes(value) ? value : "";
		},
		set(value) {
			this.setAttribute("referrerpolicy", value);
		}
	});
});

// core reads the poster IDL property of a video to decide whether a poster has to be captured,
// and happy-dom 20 does not reflect it at all, so the attribute is reflected here. A browser
// would resolve it against the document base; the suites only test for its presence.
Object.defineProperty(window.HTMLVideoElement.prototype, "poster", {
	configurable: true,
	get() {
		return this.getAttribute("poster") || "";
	},
	set(value) {
		this.setAttribute("poster", value);
	}
});

globalThis.MutationObserver = class {
	observe() { }
	disconnect() { }
};
