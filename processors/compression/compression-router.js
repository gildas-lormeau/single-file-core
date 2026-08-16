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
	const TARGET_ATTRIBUTE = "data-sfz-target";
	const TARGET_PSEUDO_CLASS = /:target(?![\w-])/g;
	const VISITED_ATTRIBUTE = "data-sfz-visited";
	const VISITED_PSEUDO_CLASS = /:visited(?![\w-])/g;
	const VISITED_DEFAULT_COLOR = "#551a8b";
	const PREFETCH_DELAY = 100;
	const { zip, document, location, history, CSS, setTimeout, clearTimeout } = globalThis;
	const cache = new Map();
	const urlToPath = new Map();
	const scrollStates = new Map();
	const visitedPaths = new Set();
	const sessionKey = Math.random().toString(36).substring(2);
	let currentPath, currentEntryId, targetStyleElement, prefetchTimeout;
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
		globalThis.addEventListener("auxclick", interceptClick, true);
		globalThis.addEventListener("mouseover", prefetchOnHover, true);
		globalThis.addEventListener("hashchange", onHashChange);
	}

	function onHashChange() {
		navigate().catch(error => globalThis.console.error(error));
	}

	function interceptClick(event) {
		if (event.type == "auxclick" && event.button != 1) {
			return;
		}
		const node = findAnchor(event.target);
		if (node && node.href) {
			const fragment = getFragment(node.href);
			let path = urlToPath.get(stripFragment(node.href));
			if (path === undefined && fragment && stripFragment(node.href) == stripFragment(location.href)) {
				path = currentPath;
			}
			if (path !== undefined) {
				event.preventDefault();
				// modified and middle clicks open the archive deep link in a new
				// tab instead of letting the browser open the live site URL
				if (event.type == "auxclick" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
					globalThis.open(stripFragment(location.href) + ROUTE_PREFIX + path + (fragment || ""));
				} else {
					// the fragment stays encoded inside the route hash so that
					// reloading or sharing the URL comes back to the same page
					const previousHash = location.hash;
					location.hash = ROUTE_PREFIX + path + (fragment || "");
					if (location.hash == previousHash && fragment) {
						clearTarget();
						scrollToFragment(fragment);
					}
				}
			}
		}
	}

	async function navigate() {
		clearTarget();
		scrollStates.set(currentEntryId, captureScrollState());
		const continuityScrolls = captureElementScrolls();
		const entryId = getEntryId();
		const { routed, path, fragment } = parseRoute();
		const willRender = routed && path != currentPath && Boolean(pages.find(page => page.path == path));
		// the whole render and scroll sequence runs inside the view transition
		// so that the crossfade ends on the final scroll position
		if (willRender && document.startViewTransition && !prefersReducedMotion()) {
			await document.startViewTransition(update).updateCallbackDone;
		} else {
			await update();
		}

		async function update() {
			const rendered = await renderRoute();
			if (rendered) {
				focusContent();
			}
			applyScrollState(rendered);
		}

		function applyScrollState(rendered) {
			if (entryId !== null) {
				currentEntryId = entryId;
				const scrollState = scrollStates.get(entryId);
				if (scrollState) {
					applyElementScrolls(scrollState.elements);
					globalThis.scrollTo(scrollState.x, scrollState.y);
				}
				if (fragment) {
					const target = findFragmentTarget(fragment);
					if (target) {
						markTarget(target);
					}
				}
			} else {
				currentEntryId = assignEntryId();
				if (rendered) {
					applyElementScrolls(continuityScrolls);
				}
				if (fragment) {
					scrollToFragment(fragment);
				} else if (rendered) {
					globalThis.scrollTo(0, 0);
				}
			}
		}
	}

	async function renderRoute(initial) {
		const { routed, path, fragment } = parseRoute();
		if (!routed && !initial) {
			return false;
		}
		if (path == currentPath || !pages.find(page => page.path == path)) {
			return false;
		}
		const docContent = await getPageContent(path);
		currentPath = path;
		await display(document, docContent, { inPlace: true });
		attachListeners();
		visitedPaths.add(path);
		markVisitedLinks();
		if (initial) {
			if (fragment) {
				scrollToFragment(fragment);
			} else if (!routed && location.hash) {
				scrollToFragment(location.hash);
			}
		}
		return true;
	}

	function parseRoute() {
		const hash = location.hash;
		const routed = !hash || hash.startsWith(ROUTE_PREFIX);
		let path = pages[0].path;
		let fragment;
		if (routed && hash) {
			const route = hash.substring(ROUTE_PREFIX.length);
			const indexFragment = route.indexOf("#");
			path = decodeURIComponent(indexFragment == -1 ? route : route.substring(0, indexFragment));
			fragment = indexFragment == -1 ? undefined : route.substring(indexFragment);
		}
		return { routed, path, fragment };
	}

	// the cache stores promises so that a click during a hover prefetch awaits
	// the extraction in flight instead of starting a second one
	function getPageContent(path) {
		if (!cache.has(path)) {
			const contentPromise = extractPageContent(path);
			contentPromise.catch(() => cache.delete(path));
			cache.set(path, contentPromise);
		}
		return cache.get(path);
	}

	async function extractPageContent(path) {
		const pageEntries = entries.filter(entry => path == "" ?
			!entry.filename.startsWith(PAGES_PREFIX) && entry.filename != PAGES_FILENAME :
			entry.filename.startsWith(path));
		const { docContent } = await extract(null, { entries: pageEntries, pagePath: path });
		return docContent;
	}

	function prefetchOnHover(event) {
		const node = findAnchor(event.target);
		if (node && node.href) {
			const path = urlToPath.get(stripFragment(node.href));
			if (path !== undefined && path != currentPath && !cache.has(path)) {
				clearTimeout(prefetchTimeout);
				prefetchTimeout = setTimeout(() => getPageContent(path).catch(() => { }), PREFETCH_DELAY);
			}
		}
	}

	function findAnchor(node) {
		while (node && node.tagName != "A") {
			node = node.parentNode;
		}
		return node;
	}

	function prefersReducedMotion() {
		return Boolean(globalThis.matchMedia && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches);
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

	// the fragment is scrolled to from script because the real fragment is the
	// route hash, which also means :target never matches in rendered pages; the
	// :target rules of the page are cloned against a marker attribute instead
	function scrollToFragment(fragment) {
		const target = findFragmentTarget(fragment);
		if (target) {
			markTarget(target);
			target.scrollIntoView();
		}
	}

	function findFragmentTarget(fragment) {
		const name = decodeURIComponent(fragment.substring(1));
		let target = document.getElementById(name);
		if (!target && CSS) {
			target = document.querySelector("a[name=" + CSS.escape(name) + "]");
		}
		return target;
	}

	function markTarget(element) {
		const cssText = getPseudoRules(TARGET_PSEUDO_CLASS, TARGET_ATTRIBUTE);
		if (cssText) {
			element.setAttribute(TARGET_ATTRIBUTE, "");
			targetStyleElement = document.createElement("style");
			targetStyleElement.textContent = cssText;
			document.head.appendChild(targetStyleElement);
		}
	}

	// :visited itself is privacy-gated, so visited routes are stamped with an
	// attribute styled by the page's own :visited rules over a default color
	function markVisitedLinks() {
		const styleElement = document.createElement("style");
		styleElement.textContent = "a[" + VISITED_ATTRIBUTE + "]{color:" + VISITED_DEFAULT_COLOR + "}" +
			getPseudoRules(VISITED_PSEUDO_CLASS, VISITED_ATTRIBUTE);
		document.head.appendChild(styleElement);
		document.querySelectorAll("a[href]").forEach(anchorElement => {
			const path = urlToPath.get(stripFragment(anchorElement.href));
			if (path !== undefined && visitedPaths.has(path)) {
				anchorElement.setAttribute(VISITED_ATTRIBUTE, "");
			}
		});
	}

	function clearTarget() {
		if (targetStyleElement) {
			const markedElement = document.querySelector("[" + TARGET_ATTRIBUTE + "]");
			if (markedElement) {
				markedElement.removeAttribute(TARGET_ATTRIBUTE);
			}
			targetStyleElement.remove();
			targetStyleElement = undefined;
		}
	}

	function getPseudoRules(pseudoRegExp, attributeName) {
		let cssText = "";
		Array.from(document.styleSheets).forEach(styleSheet => {
			try {
				cssText += getPseudoRulesText(styleSheet.cssRules, pseudoRegExp, attributeName);
			} catch {
				// ignored
			}
		});
		return cssText;
	}

	function getPseudoRulesText(cssRules, pseudoRegExp, attributeName) {
		let cssText = "";
		Array.from(cssRules).forEach(cssRule => {
			if (cssRule.cssRules && cssRule.cssRules.length) {
				const innerCssText = getPseudoRulesText(cssRule.cssRules, pseudoRegExp, attributeName);
				if (innerCssText) {
					cssText += cssRule.cssText.substring(0, cssRule.cssText.indexOf("{") + 1) + innerCssText + "}";
				}
			} else if (cssRule.selectorText) {
				const selectorText = cssRule.selectorText.replace(pseudoRegExp, "[" + attributeName + "]");
				if (selectorText != cssRule.selectorText) {
					cssText += selectorText + "{" + cssRule.style.cssText + "}";
				}
			}
		});
		return cssText;
	}

	function focusContent() {
		const headingElement = document.querySelector("h1") || document.body;
		if (headingElement) {
			headingElement.setAttribute("tabindex", "-1");
			headingElement.focus({ preventScroll: true });
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
