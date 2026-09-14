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

// deno-dom exposes content attributes but almost none of the IDL properties that reflect them, so
// `style.media` and `link.media` read undefined here and a fixture could not carry a media query at
// all. resolveStylesheetsURLs is the only caller (core/index.js:1284) and media reflects its
// attribute verbatim, with "" when absent, so this shim is faithful for both elements. `link.rel`
// and `link.href` are missing the same way and are NOT shimmed: href reflects an ABSOLUTE url in a
// browser, not the attribute, so a naive getter would make a test pass for the wrong reason.
// It reflects both ways: replaceStylesheets assigns linkElement.media, which writes the attribute.
Object.defineProperty(Element.prototype, "media", {
	configurable: true,
	get() {
		return this.getAttribute("media") || "";
	},
	set(value) {
		this.setAttribute("media", value);
	}
});
