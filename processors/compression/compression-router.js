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

/* global globalThis */

export {
	router
};

async function router(content, { extract, display }) {
	const PAGES_PREFIX = "pages/";
	const PAGES_FILENAME = "sfz-pages.json";
	const ROUTE_PREFIX = "#sfz/";
	const { zip, document, location } = globalThis;
	const cache = new Map();
	const urlToPath = new Map();
	let currentPath;
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
	return renderRoute();

	// document.open() removes the listeners of the document and of its window,
	// re-attaching identical function references is idempotent
	function attachListeners() {
		globalThis.addEventListener("click", interceptClick, true);
		globalThis.addEventListener("hashchange", onHashChange);
	}

	function onHashChange() {
		if (location.hash.startsWith(ROUTE_PREFIX) || !location.hash) {
			renderRoute().catch(error => globalThis.console.error(error));
		}
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
				location.hash = ROUTE_PREFIX + path;
			}
		}
	}

	async function renderRoute() {
		const hash = decodeURIComponent(location.hash);
		const path = hash.startsWith(ROUTE_PREFIX) ? hash.substring(ROUTE_PREFIX.length) : pages[0].path;
		if (path == currentPath || !pages.find(page => page.path == path)) {
			return;
		}
		const docContent = await getPageContent(path);
		currentPath = path;
		await display(document, docContent);
		attachListeners();
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

	function stripFragment(url) {
		const indexFragment = url.indexOf("#");
		return indexFragment == -1 ? url : url.substring(0, indexFragment);
	}
}
