/*
 * Copyright 2010-2022 Gildas Lormeau
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

const DATA_URI_PREFIX = "data:";
const ABOUT_BLANK_URI = "about:blank";
const REGEXP_URL_HASH = /(#.+?)$/;
const BLOB_URI_PREFIX = "blob:";
const HTTP_URI_PREFIX = /^https?:\/\//;
const FILE_URI_PREFIX = /^file:\/\//;
const EMPTY_URL = /^https?:\/\/+\s*$/;
const NOT_EMPTY_URL = /^(https?:\/\/|file:\/\/|blob:).+/;
const PREFIX_DATA_URI_IMAGE_SVG = "data:image/svg+xml";
const UTF8_CHARSET = "utf-8";

let util, cssTree;

export {
	getProcessorHelperCommonClass,
	getUpdatedResourceContent,
	normalizeURL,
	matchCharsetEquals,
	getCharset,
	getUrlFunctions,
	getImportFunctions,
	isDataURL,
	replaceOriginalURLs,
	testIgnoredPath,
	testValidPath,
	testValidURL
};

function getProcessorHelperCommonClass(utilInstance, cssTreeInstance) {
	util = utilInstance;
	cssTree = cssTreeInstance;
	return ProcessorHelperCommon;
}

class ProcessorHelperCommon {
	setBackgroundImage(element, url, style) {
		element.style.setProperty("background-blend-mode", "normal", "important");
		element.style.setProperty("background-clip", "content-box", "important");
		element.style.setProperty("background-position", style && style["background-position"] ? style["background-position"] : "center", "important");
		element.style.setProperty("background-color", style && style["background-color"] ? style["background-color"] : "transparent", "important");
		element.style.setProperty("background-image", url, "important");
		element.style.setProperty("background-size", style && style["background-size"] ? style["background-size"] : "100% 100%", "important");
		element.style.setProperty("background-origin", "content-box", "important");
		element.style.setProperty("background-repeat", "no-repeat", "important");
	}

	async getStylesheetContent(resourceURL, options) {
		const content = await util.getContent(resourceURL, {
			maxResourceSize: options.maxResourceSize,
			maxResourceSizeEnabled: options.maxResourceSizeEnabled,
			validateTextContentType: true,
			frameId: options.frameId,
			charset: options.charset,
			resourceReferrer: options.resourceReferrer,
			baseURI: options.baseURI,
			blockMixedContent: options.blockMixedContent,
			expectedType: "stylesheet",
			acceptHeaders: options.acceptHeaders,
			networkTimeout: options.networkTimeout
		});
		if (!(matchCharsetEquals(content.data, content.charset) || matchCharsetEquals(content.data, options.charset))) {
			options = Object.assign({}, options, { charset: getCharset(content.data) });
			return util.getContent(resourceURL, {
				maxResourceSize: options.maxResourceSize,
				maxResourceSizeEnabled: options.maxResourceSizeEnabled,
				validateTextContentType: true,
				frameId: options.frameId,
				charset: options.charset,
				resourceReferrer: options.resourceReferrer,
				baseURI: options.baseURI,
				blockMixedContent: options.blockMixedContent,
				expectedType: "stylesheet",
				acceptHeaders: options.acceptHeaders,
				networkTimeout: options.networkTimeout
			});
		} else {
			return content;
		}
	}

	processShortcutIcons(doc) {
		let shortcutIcon = findShortcutIcon(Array.from(doc.querySelectorAll("link[href][rel=\"shortcut icon\"]")));
		if (!shortcutIcon) {
			shortcutIcon = findShortcutIcon(Array.from(doc.querySelectorAll("link[href][rel=\"icon\"]")));
		}
		if (!shortcutIcon) {
			shortcutIcon = findShortcutIcon(Array.from(doc.querySelectorAll("link[href][rel*=\"icon\"]")));
			if (shortcutIcon) {
				shortcutIcon.rel = "shortcut icon";
			}
		}
		if (shortcutIcon) {
			doc.querySelectorAll("link[href][rel*=\"icon\"]").forEach(linkElement => {
				if (linkElement != shortcutIcon) {
					linkElement.remove();
				}
			});
		}
	}

	removeSingleLineCssComments(stylesheet) {
		if (stylesheet.children) {
			const removedRules = [];
			for (let cssRule = stylesheet.children.head; cssRule; cssRule = cssRule.next) {
				const ruleData = cssRule.data;
				if (ruleData.type == "Raw" && ruleData.value && ruleData.value.trim().startsWith("//")) {
					removedRules.push(cssRule);
				}
			}
			removedRules.forEach(cssRule => stylesheet.children.remove(cssRule));
		}
	}

	replacePseudoClassDefined(stylesheet) {
		const removedSelectors = [];
		if (stylesheet.children) {
			for (let cssRule = stylesheet.children.head; cssRule; cssRule = cssRule.next) {
				const ruleData = cssRule.data;
				if (ruleData.type == "Rule" && ruleData.prelude && ruleData.prelude.children) {
					for (let selector = ruleData.prelude.children.head; selector; selector = selector.next) {
						replacePseudoDefinedSelector(selector, ruleData.prelude);
					}
				}
			}
		}
		if (removedSelectors.length) {
			removedSelectors.forEach(({ parentSelector, selector }) => {
				if (parentSelector.data.children.size == 0 || !selector.prev || selector.prev.data.type == "Combinator" || selector.prev.data.type == "WhiteSpace") {
					parentSelector.data.children.replace(selector, cssTree.parse("*", { context: "selector" }).children.head);
				} else {
					parentSelector.data.children.remove(selector);
				}
			});
		}

		function replacePseudoDefinedSelector(selector, parentSelector) {
			if (selector.data.children) {
				for (let childSelector = selector.data.children.head; childSelector; childSelector = childSelector.next) {
					replacePseudoDefinedSelector(childSelector, selector);
				}
			}
			if (selector.data.type == "PseudoClassSelector" && selector.data.name == "defined") {
				removedSelectors.push({ parentSelector, selector });
			}
		}
	}

	resolveStylesheetURLs(stylesheet, baseURI, workStylesheet) {
		const urls = getUrlFunctions(stylesheet);
		urls.map(urlNode => {
			const originalResourceURL = urlNode.value;
			let resourceURL = normalizeURL(originalResourceURL);
			if (!testIgnoredPath(resourceURL)) {
				workStylesheet.textContent = "tmp { content:\"" + resourceURL + "\"}";
				if (workStylesheet.sheet && workStylesheet.sheet.cssRules) {
					resourceURL = util.removeQuotes(workStylesheet.sheet.cssRules[0].style.getPropertyValue("content"));
				}
				if (!testIgnoredPath(resourceURL)) {
					if (!resourceURL || testValidPath(resourceURL)) {
						let resolvedURL;
						if (!originalResourceURL.startsWith("#")) {
							try {
								resolvedURL = util.resolveURL(resourceURL, baseURI);
							} catch (error) {
								// ignored
							}
						}
						if (testValidURL(resolvedURL)) {
							urlNode.value = resolvedURL;
						}
					} else {
						urlNode.value = util.EMPTY_RESOURCE;
					}
				}
			}
		});
	}

	async processXLinks(resourceElements, doc, baseURI, options, batchRequest) {
		let attributeName = "xlink:href";
		await Promise.all(Array.from(resourceElements).map(async resourceElement => {
			let originalResourceURL = resourceElement.getAttribute(attributeName);
			if (originalResourceURL == null) {
				attributeName = "href";
				originalResourceURL = resourceElement.getAttribute(attributeName);
			}
			if (options.saveOriginalURLs && !isDataURL(originalResourceURL)) {
				resourceElement.setAttribute("data-sf-original-href", originalResourceURL);
			}
			let resourceURL = normalizeURL(originalResourceURL);
			if (!options.blockImages) {
				if (testValidPath(resourceURL) && !testIgnoredPath(resourceURL)) {
					resourceElement.setAttribute(attributeName, util.EMPTY_RESOURCE);
					try {
						resourceURL = util.resolveURL(resourceURL, baseURI);
					} catch (error) {
						// ignored
					}
					if (testValidURL(resourceURL)) {
						const hashMatch = originalResourceURL.match(REGEXP_URL_HASH);
						if (originalResourceURL.startsWith(baseURI + "#")) {
							resourceElement.setAttribute(attributeName, hashMatch[0]);
						} else {
							const response = await batchRequest.addURL(resourceURL, { expectedType: "image" });
							const svgDoc = util.parseSVGContent(response.content);
							if (hashMatch && hashMatch[0]) {
								let symbolElement;
								try {
									symbolElement = svgDoc.querySelector(hashMatch[0]);
								} catch (error) {
									// ignored
								}
								if (symbolElement) {
									resourceElement.setAttribute(attributeName, hashMatch[0]);
									resourceElement.parentElement.insertBefore(symbolElement, resourceElement.parentElement.firstChild);
								}
							} else {
								const content = await batchRequest.addURL(resourceURL, { expectedType: "image" });
								resourceElement.setAttribute(attributeName, PREFIX_DATA_URI_IMAGE_SVG + "," + content);
							}
						}
					}
				} else if (resourceURL == options.url) {
					resourceElement.setAttribute(attributeName, originalResourceURL.substring(resourceURL.length));
				}
			} else {
				resourceElement.setAttribute(attributeName, util.EMPTY_RESOURCE);
			}
		}));
	}
}

function getUpdatedResourceContent(resourceURL, content, options) {
	if (options.rootDocument && options.updatedResources[resourceURL]) {
		options.updatedResources[resourceURL].retrieved = true;
		return options.updatedResources[resourceURL].content;
	} else {
		return content.data || "";
	}
}

function normalizeURL(url) {
	if (!url || url.startsWith(DATA_URI_PREFIX)) {
		return url;
	} else {
		return url.split("#")[0];
	}
}

function matchCharsetEquals(stylesheetContent = "", charset = UTF8_CHARSET) {
	const stylesheetCharset = getCharset(stylesheetContent);
	if (stylesheetCharset) {
		return stylesheetCharset == charset.toLowerCase();
	} else {
		return true;
	}
}

function getCharset(stylesheetContent = "") {
	const match = stylesheetContent.match(/^@charset\s+"([^"]*)";/i);
	if (match && match[1]) {
		return match[1].toLowerCase().trim();
	}
}

function getUrlFunctions(declarationList) {
	return cssTree.findAll(declarationList, node => node.type == "Url");
}

function getImportFunctions(declarationList) {
	return cssTree.findAll(declarationList, node => node.type == "Atrule" && node.name == "import");
}

function findShortcutIcon(shortcutIcons) {
	shortcutIcons = shortcutIcons.filter(linkElement => linkElement.href != util.EMPTY_RESOURCE);
	shortcutIcons.sort((linkElement1, linkElement2) => (parseInt(linkElement2.sizes, 10) || 16) - (parseInt(linkElement1.sizes, 10) || 16));
	return shortcutIcons[0];
}

function isDataURL(url) {
	return url && (url.startsWith(DATA_URI_PREFIX) || url.startsWith(BLOB_URI_PREFIX));
}

function replaceOriginalURLs(stylesheetContent) {
	return stylesheetContent.replace(/url\(-sf-url-original\\\(\\"(.*?)\\"\\\)\\ /g, "/* original URL: $1 */url(");
}

function testIgnoredPath(resourceURL) {
	return resourceURL && (resourceURL.startsWith(DATA_URI_PREFIX) || resourceURL == ABOUT_BLANK_URI);
}

function testValidPath(resourceURL) {
	return resourceURL && !resourceURL.match(EMPTY_URL);
}

function testValidURL(resourceURL) {
	return testValidPath(resourceURL) && (resourceURL.match(HTTP_URI_PREFIX) || resourceURL.match(FILE_URI_PREFIX) || resourceURL.startsWith(BLOB_URI_PREFIX)) && resourceURL.match(NOT_EMPTY_URL);
}