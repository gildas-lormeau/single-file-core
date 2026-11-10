/*
 * Copyright 2010-2025 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 *
 * This file is part of SingleFile.
 *
 *   The code in this file is free software: you can redistribute it and/or
 *   modify it under the terms of the GNU Affero General Public License
 *   (GNU AGPL) as published by the Free Software Foundation, either version 3
 *   of the License, or (at your option) any later version.
 *
 *   The code in this file is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 *   General Public License for more details.
 *
 *   As additional permission under GNU AGPL version 3 section 7, you may
 *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU
 *   AGPL normally required by section 4, provided you include this license
 *   notice and a URL through which recipients can access the Corresponding
 *   Source.
 */

import { NESTING_TRACK_ID_ATTRIBUTE_NAME } from "./constants.js";

const NOTE_TAGNAME = "single-file-note";
const NOTE_CLASS = "note";
const NOTE_MASK_CLASS = "note-mask";
const NOTE_HIDDEN_CLASS = "note-hidden";
const NOTE_ANCHORED_CLASS = "note-anchored";
const NOTE_SELECTED_CLASS = "note-selected";
const NOTE_MOVING_CLASS = "note-moving";
const NOTE_COLLAPSED_CLASS = "note-collapsed";
const NOTE_MASK_MOVING_CLASS = "note-mask-moving";
const NOTE_RESIZE_CLASS = "note-resize";
const NOTE_REMOVE_CLASS = "note-remove";
const NOTE_ANCHOR_CLASS = "note-anchor";
const NOTE_REFS_ATTRIBUTE_NAME = "data-single-file-note-refs";
const PAGE_MASK_CLASS = "page-mask";
const PAGE_MASK_ACTIVE_CLASS = "page-mask-active";
const PAGE_MASK_CONTAINER_CLASS = "single-file-page-mask";
const MASK_CLASS = "single-file-mask";
const HIGHLIGHT_CLASS = "single-file-highlight";
const HIGHLIGHT_HIDDEN_CLASS = "single-file-highlight-hidden";
const HIGHLIGHTS_STYLESHEET_CLASS = "single-file-highlights-stylesheet";
const REMOVED_CONTENT_CLASS = "single-file-removed";
const SHADOWROOT_ATTRIBUTE_NAME = "shadowrootmode";
const SCRIPT_TEMPLATE_SHADOW_ROOT = "data-template-shadow-root";
const NOTE_SELECTOR_URL_PREFIX = "https://www.w3.org/TR/annotation-model/#selector(type=CssSelector,value=[" + NOTE_REFS_ATTRIBUTE_NAME + "~=\"";
const NOTE_SELECTOR_URL_SUFFIX = "\"])";
const FORBIDDEN_TAG_NAMES = ["a", "area", "audio", "base", "br", "col", "command", "embed", "hr", "img", "iframe", "input", "keygen", "link", "meta", "param", "source", "track", "video", "wbr"];
const NOTE_INITIAL_POSITION_X = 20;
const NOTE_INITIAL_POSITION_Y = 20;
const NOTE_INITIAL_WIDTH = 150;
const NOTE_INITIAL_HEIGHT = 150;
const NOTE_HEADER_HEIGHT = 25;
const SELECT_PX_THRESHOLD = 4;
const COLLAPSING_NOTE_DELAY = 750;
const RESOURCES_LOAD_DELAY = 100;
const RESOURCES_LOAD_MAX_MUTATIONS = 20;
const BUTTON_ANCHOR_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgAgMAAAAOFJJnAAABhGlDQ1BJQ0MgcHJvZmlsZQAAKJF9kT1Iw0AcxV9TtaIVETuIOASsThZERRylikWwUNoKrTqYXPohNGlIUlwcBdeCgx+LVQcXZ10dXAVB8APEydFJ0UVK/F9SaBHjwXE/3t173L0DhFqJqWbbOKBqlpGMRcVMdkUMvKIbfQCG0SExU4+nFtLwHF/38PH1LsKzvM/9OXqUnMkAn0g8y3TDIl4nnt60dM77xCFWlBTic+Ixgy5I/Mh12eU3zgWHBZ4ZMtLJOeIQsVhoYbmFWdFQiaeIw4qqUb6QcVnhvMVZLVVY4578hcGctpziOs0hxLCIOBIQIaOCDZRgIUKrRoqJJO1HPfyDjj9BLplcG2DkmEcZKiTHD/4Hv7s185MTblIwCrS/2PbHCBDYBepV2/4+tu36CeB/Bq60pr9cA2Y+Sa82tfAR0LsNXFw3NXkPuNwBBp50yZAcyU9TyOeB9zP6pizQfwt0rbq9NfZx+gCkqaulG+DgEBgtUPaax7s7W3v790yjvx825XKP2aKCdAAAAAlwSFlzAAAuIwAALiMBeKU/dgAAAAd0SU1FB+QLEQA4M3Y7LzIAAAAZdEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVBXgQ4XAAAACVBMVEUAAAAAAACKioqjwG1pAAAAAXRSTlMAQObYZgAAAAFiS0dEAmYLfGQAAABkSURBVBjThc47CsNADIThWfD0bnSfbdIroP/+V0mhsN5gTNToK0YPaSvnF9B9wGykG54j/2GF1/hauE4E1AOuNxrBdA5KUXIqdiCnqC1zIZ2mFJQzKJ3wesOhcwDM4+fo7cOuD9C4HTQ9HAAQAAAAAElFTkSuQmCC";
const BUTTON_CLOSE_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgAgMAAAAOFJJnAAABhGlDQ1BJQ0MgcHJvZmlsZQAAKJF9kT1Iw0AcxV9TtaIVETuIOASsThZERRylikWwUNoKrTqYXPohNGlIUlwcBdeCgx+LVQcXZ10dXAVB8APEydFJ0UVK/F9SaBHjwXE/3t173L0DhFqJqWbbOKBqlpGMRcVMdkUMvKIbfQCG0SExU4+nFtLwHF/38PH1LsKzvM/9OXqUnMkAn0g8y3TDIl4nnt60dM77xCFWlBTic+Ixgy5I/Mh12eU3zgWHBZ4ZMtLJOeIQsVhoYbmFWdFQiaeIw4qqUb6QcVnhvMVZLVVY4578hcGctpziOs0hxLCIOBIQIaOCDZRgIUKrRoqJJO1HPfyDjj9BLplcG2DkmEcZKiTHD/4Hv7s185MTblIwCrS/2PbHCBDYBepV2/4+tu36CeB/Bq60pr9cA2Y+Sa82tfAR0LsNXFw3NXkPuNwBBp50yZAcyU9TyOeB9zP6pizQfwt0rbq9NfZx+gCkqaulG+DgEBgtUPaax7s7W3v790yjvx825XKP2aKCdAAAAAlwSFlzAAAuIwAALiMBeKU/dgAAAAd0SU1FB+QLEQA6Na1u6IUAAAAZdEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVBXgQ4XAAAACVBMVEUAAAAAAACKioqjwG1pAAAAAXRSTlMAQObYZgAAAAFiS0dEAmYLfGQAAABlSURBVBhXTc/BEUQhCAPQ58ES6McSPED/rfwDI7vOMCoJIeGd6CvFgZXiwk47Ia5VUKdrVXcb39kfqxqmTg+I2xJ2tqhVTaGaQjTl7/GgIc/4CL4Vs3RsjLFndcxPnAn4iww8A3yQjRZjti1t6AAAAABJRU5ErkJggg==";
const NOTES_STYLESHEET = minifyText(`
	.note {
		all: initial;
		display: flex;
		flex-direction: column;
		height: 150px;
		width: 150px;
		position: absolute;
		top: 10px;
		left: 10px;
		border: 1px solid rgb(191, 191, 191);
		z-index: 2147483646;
		box-shadow: 3px 3px 3px rgba(33, 33, 33, .7);
		min-height: 100px;
		min-width: 100px;
	}

	.note-selected {
		z-index: 2147483647;
	}

	.note-hidden {
		display: none;
	}

	.note-collapsed {
		min-height: 30px;
		max-height: 30px;
		overflow: hidden;
	}

	.note blockquote {
		all: initial;
		padding: 1px;
		height: 100%;
	}

	.note textarea {
		all: initial;
		white-space: break-spaces;
		font-family: Arial, Helvetica, sans-serif;
		font-size: 14px;
		height: 100%;
		width: 100%;
		padding: 2px;
		border: 1px solid transparent;
		resize: none;
		color: black;
	}

	.note textarea:focus {
		border: 1px dotted rgb(160, 160, 160);
	}

	.note header {
		all: initial;
		min-height: 30px;
		cursor: grab;
		user-select: none;
	}

	.note .note-remove {
		all: initial;
		position: absolute;
		right: 0px;
		top: 2px;
		padding: 5px;
		opacity: .5;
		cursor: pointer;
		user-select: none;
		width: 16px;
		height: 16px;
	}

	.note .note-anchor {
		all: initial;
		position: absolute;
		left: 0px;
		top: 2px;
		padding: 5px;
		opacity: .25;
		cursor: pointer;
		width: 16px;
		height: 16px;
	}

	.note .note-resize {
		all: initial;
		position: absolute;
		bottom: -5px;
		right: -5px;
		height: 15px;
		width: 15px;
		cursor: nwse-resize;
		user-select: none;
	}

	.note .note-remove:hover {
		opacity: 1;
	}

	.note .note-anchor:hover {
		opacity: .5;
	}

	.note-anchored .note-anchor {
		opacity: .5;
	}

	.note-anchored .note-anchor:hover {
		opacity: 1;
	}

	.note-moving {
		opacity: .75;
		box-shadow: 6px 6px 3px rgba(33, 33, 33, .7);
	}

	.note-moving * {
		cursor: grabbing;
	}

	.note-yellow header {
		background-color: #f5f545;
	}

	.note-yellow blockquote {
		background-color: #ffff7c;
	}

	.note-pink header {
		background-color: #ffa59f;
	}

	.note-pink blockquote {
		background-color: #ffbbb6;
	}

	.note-blue header {
		background-color: #84c8ff;
	}

	.note-blue blockquote {
		background-color: #95d0ff;
	}

	.note-green header {
		background-color: #93ef8d;
	}

	.note-green blockquote {
		background-color: #9cff95;
	}
`);
const MASK_STYLESHEET = minifyText(`
	.note-mask {
		all: initial;
		position: fixed;
		z-index: 2147483645;
		pointer-events: none;
		background-color: transparent;
		transition: background-color 125ms;
	}

	.note-mask-moving.note-yellow {
		background-color: rgba(255, 255, 124, .3);
	}

	.note-mask-moving.note-pink {
		background-color: rgba(255, 187, 182, .3);
	}

	.note-mask-moving.note-blue {
		background-color: rgba(149, 208, 255, .3);
	}

	.note-mask-moving.note-green {
		background-color: rgba(156, 255, 149, .3);
	}

	.page-mask {
		all: initial;
		position: fixed;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
		z-index: 2147483646;
	}

	.page-mask-active {
		width: 100vw;
		height: 100vh;
	}
`);
const HIGHLIGHTS_STYLESHEET = minifyText(`
	.single-file-highlight-yellow, .single-file-highlight-yellow-mode ::selection {
		background-color: #ffff7c !important;
		color: black !important;
	}

	.single-file-highlight-pink, .single-file-highlight-pink-mode ::selection {
		background-color: #ffbbb6 !important;
		color: black !important;
	}

	.single-file-highlight-blue, .single-file-highlight-blue-mode ::selection {
		background-color: #95d0ff !important;
		color: black !important;
	}

	.single-file-highlight-green, .single-file-highlight-green-mode ::selection {
		background-color: #93ef8d !important;
		color: black !important;
	}

	span.single-file-highlight-yellow, span.single-file-highlight-pink, span.single-file-highlight-blue, span.single-file-highlight-green {
		display: inline !important;
	}

	.single-file-highlight-hidden {
		background-color: inherit !important;
		color: inherit !important;
	}

	.single-file-mask {
		all: initial;
		display: contents !important;
	}

	.single-file-mask.single-file-page-mask {
		opacity: .99 !important;
	}

	single-file-note {
		all: initial !important;
		display: contents !important;
	}

	.single-file-cut-hover, .single-file-cut-outer-hover, .single-file-cut-selected, .single-file-cut-outer-selected {
		transition: outline-width 125ms !important;
		outline-offset: -4px !important;
		outline-width: 4px !important;
	}

	.single-file-cut-hover, .single-file-cut-outer-hover {
		outline-style: dotted !important;
	}

	.single-file-cut-selected, .single-file-cut-outer-selected {
		outline-style: dashed !important;
	}

	.single-file-cut-hover, .single-file-cut-selected {
		outline-color: red !important;
	}

	.single-file-cut-outer-hover, .single-file-cut-outer-selected {
		outline-color: green !important;
	}

	.single-file-cut-mode, .single-file-cut-mode * {
		pointer-events: auto !important;
		touch-action: none !important;
	}

	.single-file-cut-hover, .single-file-cut-outer-hover, .single-file-remove-highlights-mode .single-file-highlight:hover {
		cursor: crosshair !important;
	}

	.single-file-removed {
		display: none !important;
		float: none !important;
		position: static !important;
		visibility: collapse !important;
	}

	a[href], img {
		-webkit-touch-callout: none;
	}
`);

export {
	init,
	restoreShadowRoots,
	repairNesting,
	serializeNotes,
	insertHighlightsStylesheet,
	getShadowRoot,
	getPosition,
	NOTE_TAGNAME,
	MASK_CLASS,
	HIGHLIGHT_CLASS,
	HIGHLIGHT_HIDDEN_CLASS,
	REMOVED_CONTENT_CLASS,
	SHADOWROOT_ATTRIBUTE_NAME,
	SCRIPT_TEMPLATE_SHADOW_ROOT
};

function init(doc, { editable = false, onUpdate = () => { } } = {}) {
	const win = doc.defaultView;
	const maskPageElement = getMaskElement(doc, PAGE_MASK_CLASS, PAGE_MASK_CONTAINER_CLASS);
	const maskNoteElement = getMaskElement(doc, NOTE_MASK_CLASS);
	let selectedNote, anchorElement, resizingNoteMode, movingNoteMode, collapseNoteTimeout, previousMoveHandlers;
	return {
		addNote,
		attachNoteListeners,
		anchorNote,
		resetAnchorNote,
		onMouseUp,
		reflowNotes,
		watchNotesLayout,
		waitResourcesLoad,
		saveNoteOffset,
		saveNoteOffsets,
		displayNotes,
		hideNotes
	};

	function addNote({ color }) {
		const containerElement = doc.createElement(NOTE_TAGNAME);
		const noteElement = doc.createElement("div");
		const headerElement = doc.createElement("header");
		const blockquoteElement = doc.createElement("blockquote");
		const mainElement = doc.createElement("textarea");
		const resizeElement = doc.createElement("div");
		const removeNoteElement = doc.createElement("img");
		const anchorIconElement = doc.createElement("img");
		const noteShadow = containerElement.attachShadow({ mode: "open" });
		headerElement.appendChild(anchorIconElement);
		headerElement.appendChild(removeNoteElement);
		blockquoteElement.appendChild(mainElement);
		noteElement.appendChild(headerElement);
		noteElement.appendChild(blockquoteElement);
		noteElement.appendChild(resizeElement);
		noteShadow.appendChild(getStyleElement(doc, NOTES_STYLESHEET));
		noteShadow.appendChild(noteElement);
		const notesElements = Array.from(doc.querySelectorAll(NOTE_TAGNAME));
		const noteId = Math.max.call(Math, 0, ...notesElements.map(noteElement => Number(noteElement.dataset.noteId))) + 1;
		blockquoteElement.cite = NOTE_SELECTOR_URL_PREFIX + noteId + NOTE_SELECTOR_URL_SUFFIX;
		noteElement.classList.add(NOTE_CLASS);
		noteElement.classList.add(NOTE_ANCHORED_CLASS);
		noteElement.classList.add(color);
		noteElement.dataset.color = color;
		mainElement.dir = "auto";
		const boundingRectDocument = doc.documentElement.getBoundingClientRect();
		let positionX = NOTE_INITIAL_WIDTH + NOTE_INITIAL_POSITION_X - 1 - boundingRectDocument.x;
		let positionY = NOTE_INITIAL_HEIGHT + NOTE_INITIAL_POSITION_Y - 1 - boundingRectDocument.y;
		while (Array.from(doc.elementsFromPoint(positionX - win.scrollX, positionY - win.scrollY)).find(element => element.tagName.toLowerCase() == NOTE_TAGNAME)) {
			positionX += NOTE_INITIAL_POSITION_X;
			positionY += NOTE_INITIAL_POSITION_Y;
		}
		noteElement.style.setProperty("left", (positionX - NOTE_INITIAL_WIDTH - 1) + "px");
		noteElement.style.setProperty("top", (positionY - NOTE_INITIAL_HEIGHT - 1) + "px");
		resizeElement.className = NOTE_RESIZE_CLASS;
		resizeElement.ondragstart = event => event.preventDefault();
		removeNoteElement.className = NOTE_REMOVE_CLASS;
		removeNoteElement.src = BUTTON_CLOSE_URL;
		removeNoteElement.ondragstart = event => event.preventDefault();
		anchorIconElement.className = NOTE_ANCHOR_CLASS;
		anchorIconElement.src = BUTTON_ANCHOR_URL;
		anchorIconElement.ondragstart = event => event.preventDefault();
		containerElement.dataset.noteId = noteId;
		addNoteRef(doc.documentElement, noteId);
		attachNoteListeners(containerElement, true);
		doc.documentElement.insertBefore(containerElement, maskPageElement.getRootNode().host);
		noteElement.classList.add(NOTE_SELECTED_CLASS);
		selectedNote = noteElement;
		saveNoteOffset(containerElement);
		onUpdate(false);
		return containerElement;
	}

	function attachNoteListeners(containerElement, editableNote = editable) {
		const noteShadow = containerElement.shadowRoot;
		const noteElement = noteShadow.childNodes[1];
		const headerElement = noteShadow.querySelector("header");
		const mainElement = noteShadow.querySelector("textarea");
		const noteId = containerElement.dataset.noteId;
		const resizeElement = noteShadow.querySelector("." + NOTE_RESIZE_CLASS);
		const anchorIconElement = noteShadow.querySelector("." + NOTE_ANCHOR_CLASS);
		const removeNoteElement = noteShadow.querySelector("." + NOTE_REMOVE_CLASS);
		mainElement.readOnly = !editableNote;
		if (!editableNote) {
			anchorIconElement.style.setProperty("display", "none", "important");
		} else {
			anchorIconElement.style.removeProperty("display");
		}
		headerElement.ontouchstart = headerElement.onmousedown = event => {
			if (event.target == headerElement) {
				collapseNoteTimeout = win.setTimeout(() => {
					noteElement.classList.toggle(NOTE_COLLAPSED_CLASS);
					hideMaskNote();
				}, COLLAPSING_NOTE_DELAY);
				event.preventDefault();
				const position = getPosition(event);
				const clientX = position.clientX;
				const clientY = position.clientY;
				const boundingRect = noteElement.getBoundingClientRect();
				const deltaX = clientX - boundingRect.left;
				const deltaY = clientY - boundingRect.top;
				maskPageElement.classList.add(PAGE_MASK_ACTIVE_CLASS);
				doc.documentElement.style.setProperty("user-select", "none", "important");
				anchorElement = getAnchorElement(containerElement);
				displayMaskNote();
				selectNote(noteElement);
				moveNote(event, deltaX, deltaY);
				movingNoteMode = { event, deltaX, deltaY };
				saveMoveHandlers();
				doc.documentElement.ontouchmove = doc.documentElement.onmousemove = event => {
					win.clearTimeout(collapseNoteTimeout);
					if (!movingNoteMode) {
						movingNoteMode = { deltaX, deltaY };
					}
					movingNoteMode.event = event;
					moveNote(event, deltaX, deltaY);
				};
			}
		};
		resizeElement.ontouchstart = resizeElement.onmousedown = event => {
			event.preventDefault();
			resizingNoteMode = true;
			selectNote(noteElement);
			maskPageElement.classList.add(PAGE_MASK_ACTIVE_CLASS);
			doc.documentElement.style.setProperty("user-select", "none", "important");
			saveMoveHandlers();
			doc.documentElement.ontouchmove = doc.documentElement.onmousemove = event => {
				event.preventDefault();
				const { clientX, clientY } = getPosition(event);
				const boundingRectNote = noteElement.getBoundingClientRect();
				noteElement.style.width = clientX - boundingRectNote.left + "px";
				noteElement.style.height = clientY - boundingRectNote.top + "px";
			};
		};
		anchorIconElement.ontouchend = anchorIconElement.onclick = event => {
			event.preventDefault();
			noteElement.classList.toggle(NOTE_ANCHORED_CLASS);
			if (!noteElement.classList.contains(NOTE_ANCHORED_CLASS)) {
				deleteNoteRef(containerElement, noteId);
				addNoteRef(doc.documentElement, noteId);
			}
			saveNoteOffset(containerElement);
			onUpdate(false);
		};
		removeNoteElement.ontouchend = removeNoteElement.onclick = event => {
			event.preventDefault();
			deleteNoteRef(containerElement, noteId);
			containerElement.remove();
		};
		noteElement.onmousedown = () => {
			selectNote(noteElement);
		};

		function moveNote(event, deltaX, deltaY) {
			event.preventDefault();
			const { clientX, clientY } = getPosition(event);
			noteElement.classList.add(NOTE_MOVING_CLASS);
			if (editableNote) {
				if (noteElement.classList.contains(NOTE_ANCHORED_CLASS)) {
					deleteNoteRef(containerElement, noteId);
					anchorElement = getTarget(clientX, clientY) || doc.documentElement;
					addNoteRef(anchorElement, noteId);
				} else {
					anchorElement = doc.documentElement;
				}
			}
			doc.documentElement.insertBefore(containerElement, maskPageElement.getRootNode().host);
			noteElement.style.setProperty("left", (clientX - deltaX) + "px");
			noteElement.style.setProperty("top", (clientY - deltaY) + "px");
			noteElement.style.setProperty("position", "fixed");
			displayMaskNote();
		}

		function displayMaskNote() {
			if (anchorElement == doc.documentElement) {
				hideMaskNote();
			} else {
				const boundingRectAnchor = anchorElement.getBoundingClientRect();
				maskNoteElement.classList.add(NOTE_MASK_MOVING_CLASS);
				if (selectedNote) {
					maskNoteElement.classList.add(selectedNote.dataset.color);
				}
				maskNoteElement.style.setProperty("top", (boundingRectAnchor.y - 3) + "px");
				maskNoteElement.style.setProperty("left", (boundingRectAnchor.x - 3) + "px");
				maskNoteElement.style.setProperty("width", (boundingRectAnchor.width + 3) + "px");
				maskNoteElement.style.setProperty("height", (boundingRectAnchor.height + 3) + "px");
			}
		}

		function hideMaskNote() {
			maskNoteElement.classList.remove(NOTE_MASK_MOVING_CLASS);
			if (selectedNote) {
				maskNoteElement.classList.remove(selectedNote.dataset.color);
			}
		}

		function getTarget(clientX, clientY) {
			const targets = Array.from(doc.elementsFromPoint(clientX, clientY)).filter(element => element.matches("html *:not(" + NOTE_TAGNAME + "):not(." + MASK_CLASS + ")"));
			if (!targets.includes(doc.documentElement)) {
				targets.push(doc.documentElement);
			}
			let newTarget, target = targets[0], boundingRect = target.getBoundingClientRect();
			newTarget = determineTargetElement("floor", target, clientX - boundingRect.left, getMatchedParents(target, "left"));
			if (newTarget == target) {
				newTarget = determineTargetElement("ceil", target, boundingRect.left + boundingRect.width - clientX, getMatchedParents(target, "right"));
			}
			if (newTarget == target) {
				newTarget = determineTargetElement("floor", target, clientY - boundingRect.top, getMatchedParents(target, "top"));
			}
			if (newTarget == target) {
				newTarget = determineTargetElement("ceil", target, boundingRect.top + boundingRect.height - clientY, getMatchedParents(target, "bottom"));
			}
			target = newTarget;
			while (boundingRect = target && target.getBoundingClientRect(), boundingRect && boundingRect.width <= SELECT_PX_THRESHOLD && boundingRect.height <= SELECT_PX_THRESHOLD) {
				target = target.parentElement;
			}
			return target;
		}

		function getMatchedParents(target, property) {
			let element = target, matchedParent, parents = [];
			do {
				const boundingRect = element.getBoundingClientRect();
				if (element.parentElement && !element.parentElement.tagName.toLowerCase() != NOTE_TAGNAME && !element.classList.contains(MASK_CLASS)) {
					const parentBoundingRect = element.parentElement.getBoundingClientRect();
					matchedParent = Math.abs(parentBoundingRect[property] - boundingRect[property]) <= SELECT_PX_THRESHOLD;
					if (matchedParent) {
						if (element.parentElement.clientWidth > SELECT_PX_THRESHOLD && element.parentElement.clientHeight > SELECT_PX_THRESHOLD &&
							((element.parentElement.clientWidth - element.clientWidth > SELECT_PX_THRESHOLD) || (element.parentElement.clientHeight - element.clientHeight > SELECT_PX_THRESHOLD))) {
							parents.push(element.parentElement);
						}
						element = element.parentElement;
					}
				} else {
					matchedParent = false;
				}
			} while (matchedParent && element);
			return parents;
		}

		function determineTargetElement(roundingMethod, target, widthDistance, parents) {
			if (Math[roundingMethod](widthDistance / SELECT_PX_THRESHOLD) <= parents.length) {
				target = parents[parents.length - Math[roundingMethod](widthDistance / SELECT_PX_THRESHOLD) - 1];
			}
			return target;
		}
	}

	function selectNote(noteElement) {
		if (selectedNote) {
			selectedNote.classList.remove(NOTE_SELECTED_CLASS);
			maskNoteElement.classList.remove(selectedNote.dataset.color);
		}
		noteElement.classList.add(NOTE_SELECTED_CLASS);
		noteElement.classList.add(noteElement.dataset.color);
		selectedNote = noteElement;
	}

	function saveMoveHandlers() {
		if (!previousMoveHandlers) {
			previousMoveHandlers = { ontouchmove: doc.documentElement.ontouchmove, onmousemove: doc.documentElement.onmousemove };
		}
	}

	function restoreMoveHandlers() {
		if (previousMoveHandlers) {
			doc.documentElement.ontouchmove = previousMoveHandlers.ontouchmove;
			doc.documentElement.onmousemove = previousMoveHandlers.onmousemove;
			previousMoveHandlers = null;
		}
	}

	function onMouseUp(event) {
		if (resizingNoteMode) {
			event.preventDefault();
			resizingNoteMode = false;
			doc.documentElement.style.removeProperty("user-select");
			maskPageElement.classList.remove(PAGE_MASK_ACTIVE_CLASS);
			restoreMoveHandlers();
			onUpdate(false);
		}
		if (movingNoteMode) {
			event.preventDefault();
			anchorNote(movingNoteMode.event || event, selectedNote, movingNoteMode.deltaX, movingNoteMode.deltaY);
			movingNoteMode = null;
			restoreMoveHandlers();
			onUpdate(false);
		}
		if (collapseNoteTimeout) {
			win.clearTimeout(collapseNoteTimeout);
			collapseNoteTimeout = null;
		}
	}

	function anchorNote(event, noteElement, deltaX, deltaY) {
		event.preventDefault();
		const { clientX, clientY } = getPosition(event);
		doc.documentElement.style.removeProperty("user-select");
		noteElement.classList.remove(NOTE_MOVING_CLASS);
		maskNoteElement.classList.remove(NOTE_MASK_MOVING_CLASS);
		maskPageElement.classList.remove(PAGE_MASK_ACTIVE_CLASS);
		maskNoteElement.classList.remove(noteElement.dataset.color);
		const headerElement = noteElement.querySelector("header");
		headerElement.ontouchmove = doc.documentElement.onmousemove = null;
		let currentElement = anchorElement;
		let positionedElement;
		while (currentElement.parentElement && !positionedElement) {
			if (!FORBIDDEN_TAG_NAMES.includes(currentElement.tagName.toLowerCase())) {
				const currentElementStyle = win.getComputedStyle(currentElement);
				if (currentElementStyle.position != "static") {
					positionedElement = currentElement;
				}
			}
			currentElement = currentElement.parentElement;
		}
		if (!positionedElement) {
			positionedElement = doc.documentElement;
		}
		const containerElement = noteElement.getRootNode().host;
		if (positionedElement == doc.documentElement) {
			const firstMaskElement = doc.querySelector("." + MASK_CLASS);
			firstMaskElement.parentElement.insertBefore(containerElement, firstMaskElement);
		} else {
			positionedElement.appendChild(containerElement);
		}
		const boundingRectPositionedElement = positionedElement.getBoundingClientRect();
		const stylePositionedElement = win.getComputedStyle(positionedElement);
		const borderX = parseInt(stylePositionedElement.getPropertyValue("border-left-width"));
		const borderY = parseInt(stylePositionedElement.getPropertyValue("border-top-width"));
		noteElement.style.setProperty("position", "absolute");
		noteElement.style.setProperty("left", (clientX - boundingRectPositionedElement.x - deltaX - borderX) + "px");
		noteElement.style.setProperty("top", (clientY - boundingRectPositionedElement.y - deltaY - borderY) + "px");
		saveNoteOffset(containerElement);
	}

	function resetAnchorNote(containerElement) {
		const noteId = containerElement.dataset.noteId;
		const noteElement = containerElement.shadowRoot.childNodes[1];
		noteElement.classList.remove(NOTE_ANCHORED_CLASS);
		deleteNoteRef(containerElement, noteId);
		addNoteRef(doc.documentElement, noteId);
		doc.documentElement.insertBefore(containerElement, maskPageElement.getRootNode().host);
		saveNoteOffset(containerElement);
	}

	function reflowNotes() {
		doc.querySelectorAll(NOTE_TAGNAME).forEach(containerElement => {
			const noteElement = containerElement.shadowRoot.querySelector("." + NOTE_CLASS);
			const noteBoundingRect = noteElement.getBoundingClientRect();
			if ((noteBoundingRect.width || noteBoundingRect.height) && !noteElement.classList.contains(NOTE_MOVING_CLASS)) {
				const anchorElement = getAnchorElement(containerElement);
				const anchorBoundingRect = anchorElement.getBoundingClientRect();
				const offsetX = Number(containerElement.dataset.noteOffsetX);
				const offsetY = Number(containerElement.dataset.noteOffsetY);
				const savedOffset = anchorElement != doc.documentElement && !isNaN(offsetX) && !isNaN(offsetY);
				const maxX = anchorBoundingRect.x + Math.max(0, anchorBoundingRect.width - noteBoundingRect.width);
				const minX = anchorBoundingRect.x;
				const maxY = anchorBoundingRect.y + Math.max(0, anchorBoundingRect.height - NOTE_HEADER_HEIGHT);
				const minY = anchorBoundingRect.y;
				const positionX = Math.min(maxX, Math.max(minX, savedOffset ? anchorBoundingRect.x + offsetX : noteBoundingRect.x));
				const positionY = Math.min(maxY, Math.max(minY, savedOffset ? anchorBoundingRect.y + offsetY : noteBoundingRect.y));
				const left = parseFloat(noteElement.style.getPropertyValue("left"));
				const top = parseFloat(noteElement.style.getPropertyValue("top"));
				noteElement.style.setProperty("position", "absolute");
				if (Math.abs(positionX - noteBoundingRect.x) > 0.5) {
					noteElement.style.setProperty("left", (left + positionX - noteBoundingRect.x) + "px");
				}
				if (Math.abs(positionY - noteBoundingRect.y) > 0.5) {
					noteElement.style.setProperty("top", (top + positionY - noteBoundingRect.y) + "px");
				}
			}
		});
	}

	function watchNotesLayout() {
		if (win.ResizeObserver) {
			let reflowPending;
			new win.ResizeObserver(() => {
				if (!reflowPending) {
					reflowPending = win.requestAnimationFrame(() => {
						reflowPending = null;
						reflowNotes();
					});
				}
			}).observe(doc.documentElement);
		}
		if (doc.fonts) {
			doc.fonts.ready.then(() => reflowNotes());
		}
	}

	function waitResourcesLoad() {
		return new Promise(resolve => {
			let counterMutations = 0;
			const done = () => {
				observer.disconnect();
				resolve();
			};
			let timeoutInit = win.setTimeout(done, RESOURCES_LOAD_DELAY);
			const observer = new win.MutationObserver(() => {
				if (counterMutations < RESOURCES_LOAD_MAX_MUTATIONS) {
					counterMutations++;
					win.clearTimeout(timeoutInit);
					timeoutInit = win.setTimeout(done, RESOURCES_LOAD_DELAY);
				} else {
					done();
				}
			});
			observer.observe(doc, { subtree: true, childList: true, attributes: true });
		});
	}

	function saveNoteOffset(containerElement) {
		const noteElement = containerElement.shadowRoot.querySelector("." + NOTE_CLASS);
		if (noteElement) {
			const anchorElement = getAnchorElement(containerElement);
			const noteBoundingRect = noteElement.getBoundingClientRect();
			if (anchorElement == doc.documentElement) {
				delete containerElement.dataset.noteOffsetX;
				delete containerElement.dataset.noteOffsetY;
			} else if (noteBoundingRect.width || noteBoundingRect.height) {
				const anchorBoundingRect = anchorElement.getBoundingClientRect();
				containerElement.dataset.noteOffsetX = Math.round(noteBoundingRect.x - anchorBoundingRect.x);
				containerElement.dataset.noteOffsetY = Math.round(noteBoundingRect.y - anchorBoundingRect.y);
			}
		}
	}

	function saveNoteOffsets() {
		doc.querySelectorAll(NOTE_TAGNAME).forEach(containerElement => saveNoteOffset(containerElement));
	}

	function displayNotes() {
		doc.querySelectorAll(NOTE_TAGNAME).forEach(containerElement => containerElement.shadowRoot.querySelector("." + NOTE_CLASS).classList.remove(NOTE_HIDDEN_CLASS));
		reflowNotes();
	}

	function hideNotes() {
		doc.querySelectorAll(NOTE_TAGNAME).forEach(containerElement => containerElement.shadowRoot.querySelector("." + NOTE_CLASS).classList.add(NOTE_HIDDEN_CLASS));
	}

	function getAnchorElement(containerElement) {
		return doc.querySelector("[" + NOTE_REFS_ATTRIBUTE_NAME + "~=\"" + containerElement.dataset.noteId + "\"]") || doc.documentElement;
	}
}

function addNoteRef(anchorElement, noteId) {
	const noteRefs = getNoteRefs(anchorElement);
	noteRefs.push(noteId);
	setNoteRefs(anchorElement, noteRefs);
}

function deleteNoteRef(containerElement, noteId) {
	const anchorElement = containerElement.ownerDocument.querySelector("[" + NOTE_REFS_ATTRIBUTE_NAME + "~=\"" + noteId + "\"]") || containerElement.ownerDocument.documentElement;
	const noteRefs = getNoteRefs(anchorElement).filter(noteRef => noteRef != noteId);
	if (noteRefs.length) {
		setNoteRefs(anchorElement, noteRefs);
	} else {
		anchorElement.removeAttribute(NOTE_REFS_ATTRIBUTE_NAME);
	}
}

function getNoteRefs(anchorElement) {
	const noteRefs = anchorElement.getAttribute(NOTE_REFS_ATTRIBUTE_NAME);
	return noteRefs ? noteRefs.split(" ") : [];
}

function setNoteRefs(anchorElement, noteRefs) {
	anchorElement.setAttribute(NOTE_REFS_ATTRIBUTE_NAME, noteRefs.join(" "));
}

function getMaskElement(doc, className, containerClassName) {
	const maskContainerElement = doc.createElement("div");
	const maskElement = doc.createElement("div");
	if (containerClassName) {
		maskContainerElement.classList.add(containerClassName);
	}
	maskContainerElement.classList.add(MASK_CLASS);
	const firstNote = doc.querySelector(NOTE_TAGNAME);
	if (firstNote && firstNote.parentElement == doc.documentElement) {
		doc.documentElement.insertBefore(maskContainerElement, firstNote);
	} else {
		doc.documentElement.appendChild(maskContainerElement);
	}
	maskElement.classList.add(className);
	const maskShadow = maskContainerElement.attachShadow({ mode: "open" });
	maskShadow.appendChild(getStyleElement(doc, MASK_STYLESHEET));
	maskShadow.appendChild(maskElement);
	return maskElement;
}

function getStyleElement(doc, stylesheet) {
	const styleElement = doc.createElement("style");
	styleElement.textContent = stylesheet;
	return styleElement;
}

function insertHighlightsStylesheet(doc) {
	if (!doc.querySelector("." + HIGHLIGHTS_STYLESHEET_CLASS)) {
		const styleElement = getStyleElement(doc, HIGHLIGHTS_STYLESHEET);
		styleElement.classList.add(HIGHLIGHTS_STYLESHEET_CLASS);
		doc.documentElement.appendChild(styleElement);
	}
}

function serializeNotes(doc) {
	doc.querySelectorAll("template[" + SHADOWROOT_ATTRIBUTE_NAME + "]").forEach(templateElement => {
		const noteElement = templateElement.querySelector("." + NOTE_CLASS);
		if (noteElement) {
			noteElement.classList.remove(NOTE_HIDDEN_CLASS);
		}
		const mainElement = templateElement.querySelector("textarea");
		if (mainElement) {
			mainElement.textContent = mainElement.value;
		}
	});
}

function restoreShadowRoots(node) {
	node.querySelectorAll("template[" + SHADOWROOT_ATTRIBUTE_NAME + "]").forEach(templateElement => {
		const hostElement = templateElement.parentElement;
		if (hostElement && !getShadowRoot(hostElement)) {
			let shadowRoot;
			try {
				shadowRoot = hostElement.attachShadow({ mode: templateElement.getAttribute(SHADOWROOT_ATTRIBUTE_NAME) });
				shadowRoot.innerHTML = templateElement.innerHTML;
				templateElement.remove();
			} catch {
				// ignored
			}
			if (shadowRoot) {
				restoreShadowRoots(shadowRoot);
			}
		}
	});
}

function repairNesting(doc) {
	const trackedElements = new Map();
	doc.querySelectorAll("[" + NESTING_TRACK_ID_ATTRIBUTE_NAME + "]").forEach(element => trackedElements.set(element.getAttribute(NESTING_TRACK_ID_ATTRIBUTE_NAME), element));
	trackedElements.forEach((element, trackId) => {
		const trackIdParts = trackId.split(".");
		if (trackIdParts.length > 1) {
			const expectedParent = trackedElements.get(trackIdParts.slice(0, -1).join("."));
			if (expectedParent && element.parentElement !== expectedParent) {
				expectedParent.appendChild(element);
			}
		}
	});
	trackedElements.forEach(element => element.removeAttribute(NESTING_TRACK_ID_ATTRIBUTE_NAME));
}

function getShadowRoot(element) {
	const chrome = globalThis.chrome;
	if (element.openOrClosedShadowRoot) {
		return element.openOrClosedShadowRoot;
	} else if (chrome && chrome.dom && chrome.dom.openOrClosedShadowRoot) {
		try {
			return chrome.dom.openOrClosedShadowRoot(element);
		} catch {
			return element.shadowRoot;
		}
	} else {
		return element.shadowRoot;
	}
}

function getPosition(event) {
	if (event.touches && event.touches.length) {
		return event.touches[0];
	} else {
		return event;
	}
}

function minifyText(text) {
	return text.replace(/[\n\t\s]+/g, " ").trim();
}
