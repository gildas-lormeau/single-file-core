// Three modules read globals when they are evaluated, so every one of them has to exist before core
// is imported: core/util.js captures DOMParser, and processors/hooks/content/content-hooks-frames.js
// reads globalThis.window, then calls init() and new MutationObserver(init) at module scope. That
// hook belongs to the page world and does nothing useful here; it only has to load without throwing.
// Import this module first and import single-file.js dynamically, the way common.js does.
import { DOMParser, Document } from "jsr:@b-fuze/deno-dom@0.1.56";

globalThis.DOMParser = DOMParser;
globalThis.Document = Document;
globalThis.window = globalThis;
globalThis.MutationObserver = class {
	observe() { }
	disconnect() { }
};
