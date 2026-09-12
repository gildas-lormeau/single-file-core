// Three modules read globals when they are evaluated, so every one of them has to exist before core
// is imported: core/util.js captures DOMParser, and processors/hooks/content/content-hooks-frames.js
// reads globalThis.window, then calls init() and new MutationObserver(init) at module scope. That
// hook belongs to the page world and does nothing useful here; it only has to load without throwing.
// Import this module first and import single-file.js dynamically, the way common.js does.
import { DOMParser, Document, Element } from "jsr:@b-fuze/deno-dom@0.1.56";

globalThis.DOMParser = DOMParser;
globalThis.Document = Document;
globalThis.window = globalThis;
globalThis.MutationObserver = class {
	observe() { }
	disconnect() { }
};

// deno-dom implements neither of these, so removeEmbedScripts throws here and nowhere else. Mapping
// them onto the qualified-name methods is faithful for what deno-dom can represent, which is only
// null-namespace attributes: it drops the prefix of xlink:href and lowercases nothing, so the
// namespaced and mixed-case cases cannot be written as a fixture at all. Those are covered by the
// browser suite in single-file-cli, which drives a real DOM.
Element.prototype.setAttributeNS = function (namespaceURI, qualifiedName, value) {
	this.setAttribute(qualifiedName, value);
};
Element.prototype.removeAttributeNS = function (namespaceURI, localName) {
	this.removeAttribute(localName);
};
