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

// happy-dom has a real MutationObserver, and that is the reason not to use it: the hook above
// observes the document and re-runs init() on every mutation a capture makes. It has nothing to do
// here, and the stub keeps it from being called once per mutation for the length of a capture.
globalThis.MutationObserver = class {
	observe() { }
	disconnect() { }
};
