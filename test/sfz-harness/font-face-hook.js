/*
 * Copyright 2010-2026 Gildas Lormeau
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

// A face a page script creates with `new FontFace(family, source, descriptors)` is saved by
// insertFonts as an @font-face rule written from what the page-world hook reports. The hook used to
// report the family argument as the script passed it, and insertFonts writes it unquoted, so
// "Goudy Bookletter 1911", "Ahem!" or "a;b" became an invalid descriptor and the saved page lost the
// font, and a family passed with quotes changed meaning: Chrome and WebKit keep them as part of the
// name, Firefox reads them as CSS. It now reports the attributes of the FontFace object, which each
// engine serializes as valid CSS naming the family it actually uses. Measured on 2026-10-04 in
// Chromium 151, Firefox 153 and WebKit 26.5 with css-corpus/tmp-aster/fontface/hook-lane.mjs, which
// drives this hook in the three engines: 15 of 21 name and engine pairs lost the font before, none after.
//
// document.fonts.delete reported only `fontFace.family`, which never equalled the key of the face it
// added (raw family and constructor descriptors), so a deleted face was still saved. Both events are
// now built from the face, so the keys match. The stub FontFace below serializes the family the way
// Chromium does, with quotes.

const NEW_FONT_FACE_EVENT = "single-file-new-font-face";
const DELETE_FONT_EVENT = "single-file-delete-font";
const HOOK_PATH = new URL("../../processors/hooks/content/content-hooks-frames-web.js", import.meta.url);

let failures = 0;

const dispatchedEvents = [];
installStubs();
const NativeFontFace = globalThis.FontFace;
new Function(await Deno.readTextFile(HOOK_PATH))();

check("the hook replaces FontFace", globalThis.FontFace !== NativeFontFace);
check("the replaced FontFace still looks native",
	globalThis.FontFace.toString() === "function FontFace() { [native code] }" && globalThis.FontFace.name === "FontFace");

{
	const face = new globalThis.FontFace("Goudy Bookletter 1911", "url(font.woff2)");
	const detail = await nextDetail(NEW_FONT_FACE_EVENT);
	check("the constructor returns the native face", face instanceof NativeFontFace);
	check("a family that is invalid unquoted is reported as the engine serializes it", detail["font-family"] === "\"Goudy Bookletter 1911\"");
	check("the source is reported as given", detail.src === "url(font.woff2)");
	check("descriptors left at their defaults are not reported", sameKeys(detail, ["font-family", "src"]));
}

{
	new globalThis.FontFace("'Quoted Font'", "url(font.woff2)", { weight: "700", unicodeRange: "U+41" });
	const detail = await nextDetail(NEW_FONT_FACE_EVENT);
	check("quotes passed in the family are reported the way the engine reads them", detail["font-family"] === "\"'Quoted Font'\"");
	check("descriptors are reported from the face", detail["font-weight"] === "700" && detail["unicode-range"] === "U+41");
}

{
	new globalThis.FontFace("Broken", "url(font.woff2)", { weight: "invalid" });
	const detail = await nextDetail(NEW_FONT_FACE_EVENT);
	check("a face the engine rejected reports no family, so insertFonts skips it", !("font-family" in detail));
}

{
	const face = new globalThis.FontFace("Deleted Font", "url(font.woff2)", { style: "italic" });
	const added = await nextDetail(NEW_FONT_FACE_EVENT);
	globalThis.document.fonts.delete(face);
	const deleted = await nextDetail(DELETE_FONT_EVENT);
	check("deleting a face reports the key its creation reported", getKey(deleted) === getKey(added));
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
Deno.exit(failures ? 1 : 0);

async function nextDetail(type) {
	await new Promise(resolve => setTimeout(resolve, 0));
	const index = dispatchedEvents.findIndex(event => event.type === type);
	return index === -1 ? {} : dispatchedEvents.splice(index, 1)[0].detail;
}

function getKey(detail) {
	const key = Object.assign({}, detail);
	delete key.src;
	return JSON.stringify(key);
}

function sameKeys(object, keys) {
	return Object.keys(object).sort().join() === keys.slice().sort().join();
}

function check(label, condition) {
	if (!condition) {
		failures++;
	}
	console.log((condition ? "PASS" : "FAIL") + " " + label);
}

// the stub models only what the hook touches while it installs itself and while it reports a face;
// it is deliberately not a DOM
function installStubs() {
	class StubFontFace {
		constructor(family, source, descriptors = {}) {
			const parsed = Object.values(descriptors).every(value => value !== "invalid");
			this.family = parsed ? "\"" + family.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"" : "";
			this.style = parsed ? descriptors.style || "normal" : "";
			this.weight = parsed ? descriptors.weight || "normal" : "";
			this.stretch = parsed ? "normal" : "";
			this.unicodeRange = parsed ? descriptors.unicodeRange || "U+0-10FFFF" : "";
			this.featureSettings = parsed ? "normal" : "";
			this.variationSettings = parsed ? "normal" : "";
			this.display = parsed ? "auto" : "";
			this.ascentOverride = parsed ? "normal" : "";
			this.descentOverride = parsed ? "normal" : "";
			this.lineGapOverride = parsed ? "normal" : "";
		}
	}
	function StubElement() { }
	StubElement.prototype.attachShadow = function () { return {}; };
	globalThis.FontFace = StubFontFace;
	globalThis.Element = StubElement;
	globalThis.CSSStyleSheet = class CSSStyleSheet { };
	globalThis.CustomEvent = class CustomEvent {
		constructor(type, init = {}) {
			this.type = type;
			this.detail = init.detail;
		}
	};
	globalThis.Event = class Event { constructor(type) { this.type = type; } };
	globalThis.UIEvent = globalThis.Event;
	globalThis.screen = { width: 0, height: 0 };
	globalThis.MutationObserver = class MutationObserver { observe() { } };
	globalThis.fetch = () => Promise.reject(new Error("the hook test makes no request"));
	globalThis.document = {
		addEventListener() { },
		removeEventListener() { },
		dispatchEvent(event) {
			dispatchedEvents.push(event);
			return true;
		},
		querySelectorAll: () => [],
		documentElement: {},
		fonts: { add() { }, delete() { return true; }, clear() { }, forEach() { } }
	};
}
