import "./dom.js";
import { Window } from "npm:happy-dom@20.14.5";

// preProcessDoc marks what removeHiddenElements will prune, from the live page: a hidden element is
// emptied and forced hidden, its descendants removed. A closed details was the one exception, because
// its summary opens it with no script. A popover with a popovertarget button and a dialog with a
// commandfor button open the same way, so a saved page kept their invokers and lost what they
// showed: an empty popover under a display:none !important class that no click could lift.
const singleFile = await import("../../single-file.js");
const { helper } = singleFile;

const HIDDEN = helper.HIDDEN_CONTENT_ATTRIBUTE_NAME;
const REMOVED = helper.REMOVED_CONTENT_ATTRIBUTE_NAME;

let failed = false;

const window = new Window();
const document = window.document;
// getElementsInfo falls back to globalThis.HTMLElement and globalThis.SVGElement after the window's
// own, and reads them unguarded; a browser always has both, Deno has neither
globalThis.HTMLElement = window.HTMLElement;
globalThis.SVGElement = window.SVGElement;
document.body.innerHTML = `
	<button popovertarget="invoked-popover">Toggle</button>
	<div id="invoked-popover" popover style="display:none"><p id="invoked-popover-content">kept</p></div>
	<div id="orphan-popover" popover style="display:none"><p id="orphan-popover-content">removed</p></div>
	<button commandfor="command-popover" command="toggle-popover">Toggle</button>
	<div id="command-popover" popover style="display:none"><p id="command-popover-content">kept</p></div>
	<button commandfor="invoked-dialog" command="show-modal">Open</button>
	<dialog id="invoked-dialog" style="display:none"><p id="invoked-dialog-content">kept</p></dialog>
	<dialog id="orphan-dialog" style="display:none"><p id="orphan-dialog-content">removed</p></dialog>
	<button popovertarget='quote"id'>Toggle</button>
	<div id='quote"id' popover style="display:none"><p id="quote-popover-content">kept</p></div>
	<details><summary>Details</summary><p id="details-content">kept</p></details>
	<div style="display:none"><p id="plain-hidden-content">removed</p></div>
`;

helper.preProcessDoc(document, window, { removeHiddenElements: true });

check("a popover with a popovertarget button is not marked hidden", marked("invoked-popover", HIDDEN), false);
check("its content is not marked removed", marked("invoked-popover-content", REMOVED), false);
check("a popover no button invokes is still marked hidden", marked("orphan-popover", HIDDEN), true);
check("its content is still marked removed", marked("orphan-popover-content", REMOVED), true);
check("a popover with a commandfor button is not marked hidden", marked("command-popover", HIDDEN), false);
check("its content is not marked removed", marked("command-popover-content", REMOVED), false);
check("a dialog with a commandfor button is not marked hidden", marked("invoked-dialog", HIDDEN), false);
check("its content is not marked removed", marked("invoked-dialog-content", REMOVED), false);
check("a dialog no button invokes is still marked hidden", marked("orphan-dialog", HIDDEN), true);
check("its content is still marked removed", marked("orphan-dialog-content", REMOVED), true);
check("an id holding a double quote is still found", marked("quote-popover-content", REMOVED), false);
check("control: the content of a closed details is kept", marked("details-content", REMOVED), false);
check("control: the content of a plain hidden element is removed", marked("plain-hidden-content", REMOVED), true);

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function marked(id, attributeName) {
	return document.getElementById(id).hasAttribute(attributeName);
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
