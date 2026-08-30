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

// A shadow root's constructed stylesheets cannot be read from the extension's own
// world, so the page-world hook reads them and answers a request event. It used to
// resolve the root with `event.target.shadowRoot`, which is null for a CLOSED root,
// and then answered nothing at all. The extension still captured the root's content,
// because it reaches closed roots through openOrClosedShadowRoot, so a closed root
// came back in the saved page with its markup intact and its styles gone, with no
// error anywhere. Measured on 2026-08-30 in Firefox and in Chrome, and again after
// the fix, with tmp/closed-shadow-root-probe.html.
//
// The hook now records every root as it is attached and falls back to that record.
// This test drives the hook's own listener over a stub of the one browser rule the
// bug turns on: attachShadow returns the root to its caller either way, and leaves
// host.shadowRoot null when the mode is closed.

const REQUEST_EVENT = "single-file-request-get-adopted-stylesheets";
const RESPONSE_EVENT = "single-file-response-get-adopted-stylesheets";
const UNREGISTER_EVENT = "single-file-unregister-request-get-adopted-stylesheets";
const HOOK_PATH = new URL("../../processors/hooks/content/content-hooks-frames-web.js", import.meta.url);

let failures = 0;

const documentListeners = new Map();
installStubs();
const originalAttachShadow = globalThis.Element.prototype.attachShadow;
new Function(await Deno.readTextFile(HOOK_PATH))();
const listener = documentListeners.get(REQUEST_EVENT);

check("the hook registers a listener for the request event", Boolean(listener));
check("the hook patches attachShadow", globalThis.Element.prototype.attachShadow !== originalAttachShadow);
check("the patched attachShadow still looks native",
	globalThis.Element.prototype.attachShadow.toString() === "function attachShadow() { [native code] }" &&
	globalThis.Element.prototype.attachShadow.name === "attachShadow");

// an open root: the host exposes it, which is the path that always worked
const openHost = new StubElement();
const openRoot = openHost.attachShadow({ mode: "open" });
adopt(openRoot, ".open { color: red }");
check("attachShadow returns the root for an open mode", openRoot instanceof StubShadowRoot);
check("an open root answers with its stylesheets",
	sameStrings(request(openHost, openRoot), [".open { color: red }"]));

// a closed root: the host exposes nothing, so only the record can resolve it
const closedHost = new StubElement();
const closedRoot = closedHost.attachShadow({ mode: "closed" });
adopt(closedRoot, ".closed { color: blue }");
check("a closed root is hidden from its host", closedHost.shadowRoot === null);
check("attachShadow returns the root for a closed mode", closedRoot instanceof StubShadowRoot);
check("a closed root answers with its stylesheets",
	sameStrings(request(closedHost, closedRoot), [".closed { color: blue }"]));

// the same, for a sheet the page never passed through replaceSync, so that the
// answer comes from cssRules rather than from the recorded text
const rulesHost = new StubElement();
const rulesRoot = rulesHost.attachShadow({ mode: "closed" });
rulesRoot.adoptedStyleSheets = [{ cssRules: [{ cssText: ".rules { color: green }" }] }];
check("a closed root answers from cssRules when the text was not recorded",
	sameStrings(request(rulesHost, rulesRoot), [".rules { color: green }"]));

// an empty root still registers the hook's listener on itself, which is what lets a
// NESTED host inside it be reached later; only the answer is withheld
const emptyHost = new StubElement();
const emptyRoot = emptyHost.attachShadow({ mode: "closed" });
check("an empty root answers nothing", request(emptyHost, emptyRoot) === undefined);
check("an empty root is still listened to for nested hosts", emptyRoot.listenerCount(REQUEST_EVENT) > 0);

// a target that is neither a host nor a recorded root must not throw
check("an unrelated target is ignored", request(new StubElement(), new StubShadowRoot()) === undefined);

// the cleanup the hook installs on each root it answers for. Both halves of it were dead:
// the unregister handler was a fresh closure per handshake, so it was never the no-op that
// re-adding a registered listener is and one was left behind per root per save, and it
// removed the request listener without the capture flag it had been added with, which
// matches nothing at all
const repeatHost = new StubElement();
const repeatRoot = repeatHost.attachShadow({ mode: "open" });
adopt(repeatRoot, ".repeat { color: teal }");
request(repeatHost, repeatRoot);
const unregisterAfterFirst = repeatRoot.listenerCount(UNREGISTER_EVENT);
request(repeatHost, repeatRoot);
request(repeatHost, repeatRoot);
check("one handshake installs one unregister listener", unregisterAfterFirst === 1);
check("repeated handshakes do not accumulate unregister listeners",
	repeatRoot.listenerCount(UNREGISTER_EVENT) === 1);
check("the root is listened to for requests until it is unregistered",
	repeatRoot.listenerCount(REQUEST_EVENT) === 1);
repeatRoot.dispatchEvent(new globalThis.CustomEvent(UNREGISTER_EVENT, { bubbles: true }));
check("unregistering removes the request listener the hook added with capture",
	repeatRoot.listenerCount(REQUEST_EVENT) === 0);
check("the unregister listener removes itself once it has fired",
	repeatRoot.listenerCount(UNREGISTER_EVENT) === 0);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
Deno.exit(failures ? 1 : 0);

function request(target, listeningRoot) {
	let answer;
	const responseListener = event => answer = event.detail.adoptedStyleSheets;
	listeningRoot.addEventListener(RESPONSE_EVENT, responseListener);
	listener({ target, stopPropagation() { } });
	listeningRoot.removeEventListener(RESPONSE_EVENT, responseListener);
	return answer;
}

function adopt(root, text) {
	const sheet = new globalThis.CSSStyleSheet();
	sheet.replaceSync(text);
	root.adoptedStyleSheets = [sheet];
}

function sameStrings(value, expected) {
	return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

function check(label, condition) {
	if (!condition) {
		failures++;
	}
	console.log((condition ? "PASS" : "FAIL") + " " + label);
}

// the stub below models only what the hook touches while it installs itself and
// while it answers one request; it is deliberately not a DOM
function StubShadowRoot() {
	this.adoptedStyleSheets = [];
	this.listeners = new Map();
}

function StubElement() {
	this.shadowRoot = null;
	this.listeners = new Map();
}

function installStubs() {
	// a listener is identified by type, callback AND capture: adding one that is already
	// registered is a no-op, and removing one with a different capture flag matches nothing.
	// The stub has to model both, because those are the two rules the cleanup code got wrong
	const listenerMethods = {
		addEventListener(type, listener, options) {
			const capture = Boolean(options && options.capture);
			if (!this.listeners.has(type)) {
				this.listeners.set(type, []);
			}
			const listeners = this.listeners.get(type);
			if (!listeners.some(entry => entry.listener === listener && entry.capture === capture)) {
				listeners.push({ listener, capture, once: Boolean(options && options.once) });
			}
		},
		removeEventListener(type, listener, options) {
			const capture = Boolean(options && options.capture);
			const listeners = this.listeners.get(type) || [];
			const index = listeners.findIndex(entry => entry.listener === listener && entry.capture === capture);
			if (index !== -1) {
				listeners.splice(index, 1);
			}
		},
		dispatchEvent(event) {
			event.currentTarget = this;
			(this.listeners.get(event.type) || []).slice().forEach(entry => {
				if (entry.once) {
					this.removeEventListener(event.type, entry.listener, { capture: entry.capture });
				}
				entry.listener(event);
			});
			event.currentTarget = null;
			return true;
		},
		listenerCount(type) {
			return (this.listeners.get(type) || []).length;
		}
	};
	Object.assign(StubShadowRoot.prototype, listenerMethods);
	Object.assign(StubElement.prototype, listenerMethods);

	// the rule the bug turns on: the caller gets the root whatever the mode, while the
	// host exposes it only when the mode is open
	StubElement.prototype.attachShadow = function (init) {
		const shadowRoot = new StubShadowRoot();
		shadowRoot.host = this;
		this.shadowRoot = init && init.mode === "closed" ? null : shadowRoot;
		return shadowRoot;
	};

	const recordedText = new WeakMap();
	class StubCSSStyleSheet {
		replaceSync(text) {
			recordedText.set(this, text);
		}
		get cssRules() {
			return [{ cssText: recordedText.get(this) }];
		}
	}

	globalThis.Element = StubElement;
	globalThis.CSSStyleSheet = StubCSSStyleSheet;
	globalThis.CustomEvent = class CustomEvent {
		constructor(type, init = {}) {
			this.type = type;
			this.detail = init.detail;
			this.bubbles = Boolean(init.bubbles);
		}
	};
	globalThis.Event = class Event { constructor(type) { this.type = type; } };
	globalThis.UIEvent = globalThis.Event;
	globalThis.screen = { width: 0, height: 0 };
	globalThis.MutationObserver = class MutationObserver { observe() { } };
	globalThis.fetch = () => Promise.reject(new Error("the hook test makes no request"));
	globalThis.document = {
		addEventListener(type, listener) {
			documentListeners.set(type, listener);
		},
		removeEventListener() { },
		dispatchEvent() { return true; },
		querySelectorAll: () => [],
		documentElement: {},
		fonts: { add() { }, delete() { }, clear() { }, forEach() { } }
	};
}
