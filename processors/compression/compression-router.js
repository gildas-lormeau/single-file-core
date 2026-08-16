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

export {
	router
};

async function router(content, { extract, display }) {
	const PAGES_PREFIX = "pages/";
	const PAGES_FILENAME = "sfz-pages.json";
	const ROUTE_PREFIX = "#sfz/";
	const { zip, document, location, history, CSS } = globalThis;
	const cache = new Map();
	const urlToPath = new Map();
	const scrollStates = new Map();
	const sessionKey = Math.random().toString(36).substring(2);
	let currentPath, currentEntryId, pendingFragment;
	let nextEntryId = 0;
	try {
		history.scrollRestoration = "manual";
	} catch {
		// ignored
	}
	zip.configure({ useWebWorkers: true });
	const zipReader = new zip.ZipReader(content.readUint8Array ? content : new zip.BlobReader(content));
	const entries = await zipReader.getEntries();
	const pagesEntry = entries.find(entry => entry.filename == PAGES_FILENAME);
	if (!pagesEntry) {
		throw new Error("Pages data not found");
	}
	const { pages } = JSON.parse(await pagesEntry.getData(new zip.TextWriter()));
	pages.forEach(page => {
		urlToPath.set(stripFragment(page.url), page.path);
		if (page.originalUrls) {
			page.originalUrls.forEach(url => urlToPath.set(stripFragment(url), page.path));
		}
	});
	attachListeners();
	currentEntryId = getEntryId();
	if (currentEntryId === null) {
		currentEntryId = assignEntryId();
	}
	return renderRoute(true);

	// document.open() removes the listeners of the document and of its window,
	// re-attaching identical function references is idempotent
	function attachListeners() {
		globalThis.addEventListener("click", interceptClick, true);
		globalThis.addEventListener("hashchange", onHashChange);
	}

	function onHashChange() {
		navigate().catch(error => globalThis.console.error(error));
	}

	function interceptClick(event) {
		let node = event.target;
		while (node && node.tagName != "A") {
			node = node.parentNode;
		}
		if (node && node.href) {
			const path = urlToPath.get(stripFragment(node.href));
			if (path !== undefined) {
				event.preventDefault();
				const fragment = getFragment(node.href);
				if (path == currentPath) {
					if (fragment) {
						location.hash = fragment;
					}
				} else {
					pendingFragment = fragment;
					location.hash = ROUTE_PREFIX + path;
				}
			}
		}
	}

	async function navigate() {
		scrollStates.set(currentEntryId, captureScrollState());
		const continuityScrolls = captureElementScrolls();
		const entryId = getEntryId();
		const rendered = await renderRoute();
		if (entryId !== null) {
			currentEntryId = entryId;
			const scrollState = scrollStates.get(entryId);
			if (scrollState) {
				applyElementScrolls(scrollState.elements);
				globalThis.scrollTo(scrollState.x, scrollState.y);
			}
		} else {
			currentEntryId = assignEntryId();
			if (rendered) {
				applyElementScrolls(continuityScrolls);
				if (pendingFragment) {
					scrollToFragment(pendingFragment);
				} else {
					globalThis.scrollTo(0, 0);
				}
			}
		}
		pendingFragment = undefined;
	}

	async function renderRoute(initial) {
		const hash = decodeURIComponent(location.hash);
		const routed = !hash || hash.startsWith(ROUTE_PREFIX);
		if (!routed && !initial) {
			return false;
		}
		const path = routed && hash ? hash.substring(ROUTE_PREFIX.length) : pages[0].path;
		if (path == currentPath || !pages.find(page => page.path == path)) {
			return false;
		}
		const docContent = await getPageContent(path);
		currentPath = path;
		await display(document, docContent, { inPlace: true });
		attachListeners();
		if (initial && !routed) {
			scrollToFragment(hash);
		}
		return true;
	}

	async function getPageContent(path) {
		if (!cache.has(path)) {
			const pageEntries = entries.filter(entry => path == "" ?
				!entry.filename.startsWith(PAGES_PREFIX) && entry.filename != PAGES_FILENAME :
				entry.filename.startsWith(path));
			const { docContent } = await extract(null, { entries: pageEntries, pagePath: path });
			cache.set(path, docContent);
		}
		return cache.get(path);
	}

	function getEntryId() {
		const state = history.state;
		if (state && state.sfzSession == sessionKey && typeof state.sfzEntry == "number") {
			return state.sfzEntry;
		}
		return null;
	}

	function assignEntryId() {
		const entryId = nextEntryId++;
		try {
			history.replaceState({ sfzSession: sessionKey, sfzEntry: entryId }, "");
		} catch {
			// ignored
		}
		return entryId;
	}

	function captureScrollState() {
		return { x: globalThis.scrollX, y: globalThis.scrollY, elements: captureElementScrolls() };
	}

	function captureElementScrolls() {
		const elementScrolls = [];
		document.querySelectorAll("*").forEach(element => {
			if (element.scrollTop || element.scrollLeft) {
				const path = getElementPath(element);
				if (path) {
					elementScrolls.push({ path, top: element.scrollTop, left: element.scrollLeft });
				}
			}
		});
		return elementScrolls;
	}

	function applyElementScrolls(elementScrolls) {
		elementScrolls.forEach(({ path, top, left }) => {
			let element;
			try {
				element = document.querySelector(path);
			} catch {
				// ignored
			}
			if (element) {
				element.scrollTop = top;
				element.scrollLeft = left;
			}
		});
	}

	function getElementPath(element) {
		const segments = [];
		while (element && element.parentElement) {
			if (element.id && CSS) {
				segments.unshift("#" + CSS.escape(element.id));
				return segments.join(">");
			}
			const parent = element.parentElement;
			segments.unshift(element.tagName + ":nth-child(" + (Array.from(parent.children).indexOf(element) + 1) + ")");
			element = parent;
		}
		return segments.join(">");
	}

	function scrollToFragment(fragment) {
		const name = decodeURIComponent(fragment.substring(1));
		let target = document.getElementById(name);
		if (!target && CSS) {
			target = document.querySelector("a[name=" + CSS.escape(name) + "]");
		}
		if (target) {
			target.scrollIntoView();
		}
	}

	function stripFragment(url) {
		const indexFragment = url.indexOf("#");
		return indexFragment == -1 ? url : url.substring(0, indexFragment);
	}

	function getFragment(url) {
		const indexFragment = url.indexOf("#");
		return indexFragment == -1 ? undefined : url.substring(indexFragment);
	}
}
