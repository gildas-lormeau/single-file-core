import "./dom.js";

// The runtime of the notes a page gets in the editor: the module the editor drives while a note is
// created, moved, anchored or hidden, and the script written into the saved page so the same notes
// keep working once the page is opened on its own. Geometry is out of reach here, every rectangle is
// zero, so the checks are about the DOM the runtime writes: the note structure, the refs that tie a
// note to its anchor, the masks, the serialization steps before a save, and what the embedded entry
// does to a page that holds a serialized note.
const notes = await import("../../core/notes.js");
const { DOMParser } = globalThis;
const NOTE_REFS = "data-single-file-note-refs";

let failed = false;

const win = globalThis.window;
const doc = (new DOMParser()).parseFromString("<!DOCTYPE html><html><head></head><body><main><p id=\"paragraph\">text</p></main></body></html>", "text/html");
Object.defineProperty(doc, "defaultView", { value: win, configurable: true });
if (!doc.elementsFromPoint) {
	doc.elementsFromPoint = () => [];
}

{
	const updates = [];
	const controller = notes.init(doc, { editable: true, onUpdate: saved => updates.push(saved) });
	const masks = doc.querySelectorAll("." + notes.MASK_CLASS);
	check("init adds the page mask and the note mask", masks.length, 2);
	check("the page mask carries its container class", masks[0].classList.contains("single-file-page-mask"), true);
	check("the masks live in a shadow root", Boolean(masks[0].shadowRoot && masks[0].shadowRoot.querySelector(".page-mask")), true);
	check("the mask shadow root carries the mask stylesheet", masks[1].shadowRoot.querySelector("style").textContent.includes(".note-mask"), true);

	const containerElement = controller.addNote({ color: "note-yellow" });
	const noteElement = containerElement.shadowRoot.querySelector(".note");
	check("addNote creates a single-file-note element", containerElement.tagName.toLowerCase(), notes.NOTE_TAGNAME);
	check("the first note gets id 1", containerElement.dataset.noteId, "1");
	check("the note is inserted before the page mask", containerElement.nextElementSibling, masks[0]);
	check("the note shadow root starts with the notes stylesheet", containerElement.shadowRoot.childNodes[0].tagName.toLowerCase() + ":" + containerElement.shadowRoot.childNodes[0].textContent.includes(".note textarea"), "style:true");
	check("the note is anchored, colored and selected", noteElement.className, "note note-anchored note-yellow note-selected");
	check("the color is kept on the note", noteElement.dataset.color, "note-yellow");
	check("the note has a header, a blockquote with a textarea and a resize handle", Array.from(noteElement.children).map(element => element.tagName.toLowerCase() + (element.className ? "." + element.className : "")).join(","), "header,blockquote,div.note-resize");
	check("the header holds the anchor and remove buttons", Array.from(noteElement.querySelector("header").children).map(element => element.className).join(","), "note-anchor,note-remove");
	check("the buttons are inline images", noteElement.querySelector(".note-remove").getAttribute("src").startsWith("data:image/png;base64,"), true);
	check("the blockquote cites the annotation selector", noteElement.querySelector("blockquote").getAttribute("cite"), "https://www.w3.org/TR/annotation-model/#selector(type=CssSelector,value=[data-single-file-note-refs~=\"1\"])");
	check("the textarea is editable and auto-directed", noteElement.querySelector("textarea").readOnly + ":" + noteElement.querySelector("textarea").getAttribute("dir"), "false:auto");
	check("the anchor button is shown when editable", noteElement.querySelector(".note-anchor").style.getPropertyValue("display"), "");
	check("a new note is referenced from the root element", doc.documentElement.getAttribute(NOTE_REFS), "1");
	check("adding a note reports an update", updates.join(","), "false");

	const secondElement = controller.addNote({ color: "note-pink" });
	check("the second note gets id 2", secondElement.dataset.noteId, "2");
	check("refs accumulate on the anchor", doc.documentElement.getAttribute(NOTE_REFS), "1 2");
	check("adding a note selects it and unselects the previous one", noteElement.classList.contains("note-selected") + ":" + secondElement.shadowRoot.querySelector(".note").classList.contains("note-selected"), "false:true");

	secondElement.shadowRoot.querySelector(".note-remove").onclick(new win.Event("click"));
	check("the remove button drops the note", doc.querySelectorAll(notes.NOTE_TAGNAME).length, 1);
	check("the remove button drops its ref", doc.documentElement.getAttribute(NOTE_REFS), "1");
	check("removing a note reports an update", updates.length, 3);

	noteElement.querySelector(".note-anchor").onclick(new win.Event("click"));
	check("the anchor button toggles the anchored state", noteElement.classList.contains("note-anchored"), false);
	check("an unanchored note stays referenced from the root", doc.documentElement.getAttribute(NOTE_REFS), "1");
	check("toggling the anchor reports an update", updates.length, 4);

	// a note anchored to a paragraph and moved into it by the editor goes back to the root when the
	// paragraph is cut out of the page
	const paragraph = doc.getElementById("paragraph");
	doc.documentElement.removeAttribute(NOTE_REFS);
	paragraph.setAttribute(NOTE_REFS, "1");
	paragraph.appendChild(containerElement);
	noteElement.classList.add("note-anchored");
	controller.resetAnchorNote(containerElement);
	check("resetAnchorNote drops the anchored state", noteElement.classList.contains("note-anchored"), false);
	check("resetAnchorNote moves the ref to the root", (paragraph.getAttribute(NOTE_REFS) || "none") + ":" + doc.documentElement.getAttribute(NOTE_REFS), "none:1");
	check("resetAnchorNote moves the note back before the page mask", containerElement.parentElement == doc.documentElement && containerElement.nextElementSibling == masks[0], true);

	controller.hideNotes();
	check("hideNotes hides the note", noteElement.classList.contains("note-hidden"), true);
	controller.displayNotes();
	check("displayNotes shows it again", noteElement.classList.contains("note-hidden"), false);

	notes.insertHighlightsStylesheet(doc);
	notes.insertHighlightsStylesheet(doc);
	const highlightsStylesheets = doc.querySelectorAll("style.single-file-highlights-stylesheet");
	check("the highlights stylesheet is inserted once", highlightsStylesheets.length, 1);
	check("the highlights stylesheet covers highlights, masks, notes and removed content", [".single-file-highlight-yellow", ".single-file-mask", "single-file-note", ".single-file-removed", ".single-file-cut-hover"].every(selector => highlightsStylesheets[0].textContent.includes(selector)), true);
}

// Before a save the editor turns every shadow root into a template, then this step makes the
// templates self-sufficient: a hidden note is shown again, and the text typed into a textarea only
// lives in its value until it is written back as content. The template is built the way the editor
// builds it, by appending the shadow root's children to a template element: in a browser they become
// children of the template, and core queries them through the template element. happy-dom moves
// every appended node into the template's content whatever the method used, so the template's
// querySelector is pointed at its content here to stand in for the browser's children.
{
	const saveDoc = (new DOMParser()).parseFromString("<html><body><single-file-note data-note-id=\"1\"><div class=\"note note-hidden\"><textarea></textarea></div></single-file-note></body></html>", "text/html");
	const noteContainer = saveDoc.querySelector("single-file-note");
	const templateElement = saveDoc.createElement("template");
	templateElement.setAttribute("shadowrootmode", "open");
	Array.from(noteContainer.childNodes).forEach(childNode => templateElement.appendChild(childNode));
	noteContainer.appendChild(templateElement);
	templateElement.querySelector = selector => templateElement.content.querySelector(selector);
	templateElement.content.querySelector("textarea").value = "typed";
	notes.serializeNotes(saveDoc);
	check("serializeNotes unhides the note in the template", templateElement.content.querySelector(".note").className, "note");
	check("serializeNotes writes the textarea value into its content", templateElement.content.querySelector("textarea").textContent, "typed");
}

{
	const restoreDoc = (new DOMParser()).parseFromString("<html><body><div id=\"host\"><template shadowrootmode=\"open\"><span id=\"inner\"><template shadowrootmode=\"closed\"><b>deep</b></template></span></template></div><div id=\"attached\"><template shadowrootmode=\"open\"><i>x</i></template></div></body></html>", "text/html");
	const attached = restoreDoc.getElementById("attached");
	attached.attachShadow({ mode: "open" });
	notes.restoreShadowRoots(restoreDoc);
	const host = restoreDoc.getElementById("host");
	check("restoreShadowRoots attaches the template as a shadow root", Boolean(host.shadowRoot && host.shadowRoot.querySelector("#inner")), true);
	check("the template is removed from the host", host.querySelector("template"), null);
	check("nested templates are restored, closed roots included", host.shadowRoot.querySelector("#inner").querySelector("template"), null);
	check("a host that already has a shadow root is left alone", Boolean(attached.querySelector("template")), true);
}

// Elements core could not nest where the page nested them carry a track id; the saved page puts
// each one back under the element whose id is its prefix, then drops the ids.
{
	const nestingDoc = (new DOMParser()).parseFromString("<html><body><div data-sf-nesting-track-id=\"1\"><span data-sf-nesting-track-id=\"1.1\">a</span></div><p data-sf-nesting-track-id=\"1.2\">b</p><p data-sf-nesting-track-id=\"2\">c</p></body></html>", "text/html");
	notes.repairNesting(nestingDoc);
	const div = nestingDoc.querySelector("div");
	check("repairNesting moves a misplaced child under its parent", Array.from(div.children).map(element => element.textContent).join(","), "a,b");
	check("repairNesting keeps a child already in place", div.children[0].tagName.toLowerCase(), "span");
	check("repairNesting leaves a top-level element where it is", nestingDoc.body.children.length, 2);
	check("repairNesting removes the track ids", nestingDoc.querySelectorAll("[data-sf-nesting-track-id]").length, 0);
}

{
	check("getPosition returns the first touch", notes.getPosition({ touches: [{ clientX: 3 }], clientX: 9 }).clientX, 3);
	check("getPosition returns the event without touches", notes.getPosition({ touches: [], clientX: 9 }).clientX, 9);
}

// The entry written into saved pages, run against a page holding a serialized note: the note gets
// its shadow root back and its listeners attached in read-only mode, and the masks the listeners
// need are there.
{
	const pageDoc = (new DOMParser()).parseFromString("<html><body><p data-single-file-note-refs=\"1\">anchor</p><single-file-note data-note-id=\"1\"><template shadowrootmode=\"open\"><style>.note{}</style><div class=\"note note-anchored note-blue\" data-color=\"note-blue\"><header><img class=\"note-anchor\"><img class=\"note-remove\"></header><blockquote><textarea>saved</textarea></blockquote><div class=\"note-resize\"></div></div></template></single-file-note></body></html>", "text/html");
	Object.defineProperty(pageDoc, "defaultView", { value: win, configurable: true });
	globalThis.document = pageDoc;
	await import("../../single-file-notes.js");
	const containerElement = pageDoc.querySelector("single-file-note");
	check("the saved page entry restores the note shadow root", Boolean(containerElement.shadowRoot), true);
	check("the saved page entry makes the textarea read-only", containerElement.shadowRoot.querySelector("textarea").readOnly, true);
	check("the saved page entry hides the anchor button", containerElement.shadowRoot.querySelector(".note-anchor").style.getPropertyValue("display"), "none");
	check("the saved page entry attaches the drag handlers", typeof containerElement.shadowRoot.querySelector("header").onmousedown, "function");
	check("the saved page entry adds the masks", pageDoc.querySelectorAll("." + notes.MASK_CLASS).length, 2);
	check("the saved page entry listens for mouse up on the root element", typeof pageDoc.documentElement.onmouseup, "function");
	delete globalThis.document;
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
