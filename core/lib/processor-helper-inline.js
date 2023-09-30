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

/* global globalThis */

import * as cssTree from "./../../vendor/css-tree.js";
import {
	normalizeFontFamily,
	getFontWeight
} from "./../helper.js";

const JSON = globalThis.JSON;
const FontFace = globalThis.FontFace;
const Set = globalThis.Set;
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;
const Image = globalThis.Image;

const ABOUT_BLANK_URI = "about:blank";
const UTF8_CHARSET = "utf-8";
const PREFIX_DATA_URI_IMAGE_SVG = "data:image/svg+xml";
const PREFIXES_FORBIDDEN_DATA_URI = ["data:text/"];
const SCRIPT_TAG_FOUND = /<script/gi;
const NOSCRIPT_TAG_FOUND = /<noscript/gi;
const CANVAS_TAG_FOUND = /<canvas/gi;
const SINGLE_FILE_VARIABLE_NAME_PREFIX = "--sf-img-";
const SINGLE_FILE_VARIABLE_MAX_SIZE = 512 * 1024;

const REGEXP_URL_SIMPLE_QUOTES_FN = /url\s*\(\s*'(.*?)'\s*\)/i;
const REGEXP_URL_DOUBLE_QUOTES_FN = /url\s*\(\s*"(.*?)"\s*\)/i;
const REGEXP_URL_NO_QUOTES_FN = /url\s*\(\s*(.*?)\s*\)/i;
const REGEXP_URL_FUNCTION = /(url|local|-sf-url-original)\(.*?\)\s*(,|$)/g;
const REGEXP_SIMPLE_QUOTES_STRING = /^'(.*?)'$/;
const REGEXP_DOUBLE_QUOTES_STRING = /^"(.*?)"$/;
const REGEXP_URL_FUNCTION_WOFF = /^url\(\s*["']?data:font\/(woff2?)/;
const REGEXP_URL_FUNCTION_WOFF_ALT = /^url\(\s*["']?data:application\/x-font-(woff)/;
const REGEXP_FONT_FORMAT = /\.([^.?#]+)((\?|#).*?)?$/;
const REGEXP_FONT_FORMAT_VALUE = /format\((.*?)\)\s*,?$/;
const REGEXP_FONT_SRC = /(.*?)\s*,?$/;
const EMPTY_URL_SOURCE = /^url\(["']?data:[^,]*,?["']?\)/;
const LOCAL_SOURCE = "local(";
const MEDIA_ALL = "all";
const FONT_STRETCHES = {
	"ultra-condensed": "50%",
	"extra-condensed": "62.5%",
	"condensed": "75%",
	"semi-condensed": "87.5%",
	"normal": "100%",
	"semi-expanded": "112.5%",
	"expanded": "125%",
	"extra-expanded": "150%",
	"ultra-expanded": "200%"
};
const FONT_MAX_LOAD_DELAY = 5000;

let util;

import {
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
} from "./processor-helper-common.js";

export {
	getProcessorHelperClass,
	cssTree
};

function getProcessorHelperClass(utilInstance) {
	util = utilInstance;
	const ProcessorHelperCommon = getProcessorHelperCommonClass(util, cssTree);

	return class ProcessorHelper extends ProcessorHelperCommon {
		async processPageResources(doc, baseURI, options, resources, styles, batchRequest) {
			const processAttributeArgs = [
				["link[href][rel*=\"icon\"]", "href", false, true],
				["object[type=\"image/svg+xml\"], object[type=\"image/svg-xml\"], object[data*=\".svg\"]", "data"],
				["img[src], input[src][type=image]", "src", true],
				["embed[src*=\".svg\"]", "src"],
				["video[poster]", "poster"],
				["*[background]", "background"],
				["image", "xlink:href"],
				["image", "href"]
			];
			if (options.blockImages) {
				doc.querySelectorAll("svg").forEach(element => element.remove());
			}
			let resourcePromises = processAttributeArgs.map(([selector, attributeName, processDuplicates, removeElementIfMissing]) =>
				this.processAttribute(doc.querySelectorAll(selector), attributeName, baseURI, options, "image", resources, styles, batchRequest, processDuplicates, removeElementIfMissing)
			);
			resourcePromises = resourcePromises.concat([
				this.processXLinks(doc.querySelectorAll("use"), doc, baseURI, options, batchRequest),
				this.processSrcset(doc.querySelectorAll("img[srcset], source[srcset]"), baseURI, options, batchRequest)
			]);
			resourcePromises.push(this.processAttribute(doc.querySelectorAll("object[data*=\".pdf\"]"), "data", baseURI, options, null, resources, styles, batchRequest));
			resourcePromises.push(this.processAttribute(doc.querySelectorAll("embed[src*=\".pdf\"]"), "src", baseURI, options, null, resources, styles, batchRequest));
			resourcePromises.push(this.processAttribute(doc.querySelectorAll("audio[src], audio > source[src]"), "src", baseURI, options, "audio", resources, styles, batchRequest));
			resourcePromises.push(this.processAttribute(doc.querySelectorAll("video[src], video > source[src]"), "src", baseURI, options, "video", resources, styles, batchRequest));
			resourcePromises.push(this.processAttribute(doc.querySelectorAll("model[src]"), "src", baseURI, options, null, resources, styles, batchRequest));
			await Promise.all(resourcePromises);
			if (options.saveFavicon) {
				this.processShortcutIcons(doc);
			}
		}

		async processLinkElement(element, stylesheetInfo, stylesheets, baseURI, options, workStyleElement) {
			if (element.tagName.toUpperCase() == "LINK" && element.charset) {
				options.charset = element.charset;
			}
			await this.processStylesheetElement(element, stylesheetInfo, stylesheets, baseURI, options, workStyleElement);
		}

		async processStylesheetElement(element, stylesheetInfo, stylesheets, baseURI, options, workStyleElement) {
			let stylesheet;
			stylesheets.set(element, stylesheetInfo);
			if (!options.blockStylesheets) {
				if (element.tagName.toUpperCase() == "LINK") {
					stylesheet = await this.resolveLinkStylesheetURLs(element.href, baseURI, options, workStyleElement);
				} else {
					stylesheet = cssTree.parse(element.textContent, { context: "stylesheet", parseCustomProperty: true });
					const importFound = await this.resolveImportURLs(stylesheet, baseURI, options, workStyleElement);
					if (importFound) {
						stylesheet = cssTree.parse(cssTree.generate(stylesheet), { context: "stylesheet", parseCustomProperty: true });
					}
				}
			}
			if (stylesheet && stylesheet.children) {
				if (options.compressCSS) {
					this.removeSingleLineCssComments(stylesheet);
				}
				this.replacePseudoClassDefined(stylesheet);
				stylesheetInfo.stylesheet = stylesheet;
			} else {
				stylesheets.delete(element);
			}
		}

		replaceStylesheets(doc, stylesheets, resources, options) {
			doc.querySelectorAll("style").forEach(styleElement => {
				const stylesheetInfo = stylesheets.get(styleElement);
				if (stylesheetInfo) {
					stylesheets.delete(styleElement);
					styleElement.textContent = this.generateStylesheetContent(stylesheetInfo.stylesheet, options);
					if (stylesheetInfo.mediaText) {
						styleElement.media = stylesheetInfo.mediaText;
					}
				} else {
					styleElement.remove();
				}
			});
			doc.querySelectorAll("link[rel*=stylesheet]").forEach(linkElement => {
				const stylesheetInfo = stylesheets.get(linkElement);
				if (stylesheetInfo) {
					stylesheets.delete(linkElement);
					const styleElement = doc.createElement("style");
					if (stylesheetInfo.mediaText) {
						styleElement.media = stylesheetInfo.mediaText;
					}
					styleElement.textContent = this.generateStylesheetContent(stylesheetInfo.stylesheet, options);
					linkElement.parentElement.replaceChild(styleElement, linkElement);
				} else {
					linkElement.remove();
				}
			});
		}

		async resolveImportURLs(stylesheet, baseURI, options, workStylesheet, importedStyleSheets = new Set()) {
			let importFound;
			this.resolveStylesheetURLs(stylesheet, baseURI, workStylesheet);
			const imports = getImportFunctions(stylesheet);
			await Promise.all(imports.map(async node => {
				const urlNode = cssTree.find(node, node => node.type == "Url") || cssTree.find(node, node => node.type == "String");
				if (urlNode) {
					let resourceURL = normalizeURL(urlNode.value);
					if (!testIgnoredPath(resourceURL) && testValidPath(resourceURL)) {
						urlNode.value = util.EMPTY_RESOURCE;
						try {
							resourceURL = util.resolveURL(resourceURL, baseURI);
						} catch (error) {
							// ignored
						}
						if (testValidURL(resourceURL) && !importedStyleSheets.has(resourceURL)) {
							options.inline = true;
							const content = await this.getStylesheetContent(resourceURL, options);
							resourceURL = content.resourceURL;
							content.data = getUpdatedResourceContent(resourceURL, content, options);
							if (content.data && content.data.match(/^<!doctype /i)) {
								content.data = "";
							}
							const mediaQueryListNode = cssTree.find(node, node => node.type == "MediaQueryList");
							if (mediaQueryListNode) {
								content.data = this.wrapMediaQuery(content.data, cssTree.generate(mediaQueryListNode));
							}

							content.data = content.data.replace(/:defined/gi, "*");

							const importedStylesheet = cssTree.parse(content.data, { context: "stylesheet", parseCustomProperty: true });
							const ancestorStyleSheets = new Set(importedStyleSheets);
							ancestorStyleSheets.add(resourceURL);
							await this.resolveImportURLs(importedStylesheet, resourceURL, options, workStylesheet, ancestorStyleSheets);
							for (let keyName of Object.keys(importedStylesheet)) {
								node[keyName] = importedStylesheet[keyName];
							}
							importFound = true;
						}
					}
				}
			}));
			return importFound;
		}

		async resolveLinkStylesheetURLs(resourceURL, baseURI, options, workStylesheet) {
			resourceURL = normalizeURL(resourceURL);
			if (resourceURL && resourceURL != baseURI && resourceURL != ABOUT_BLANK_URI) {
				const content = await util.getContent(resourceURL, {
					inline: true,
					maxResourceSize: options.maxResourceSize,
					maxResourceSizeEnabled: options.maxResourceSizeEnabled,
					charset: options.charset,
					frameId: options.frameId,
					resourceReferrer: options.resourceReferrer,
					validateTextContentType: true,
					baseURI: baseURI,
					blockMixedContent: options.blockMixedContent,
					expectedType: "stylesheet",
					acceptHeaders: options.acceptHeaders,
					networkTimeout: options.networkTimeout
				});
				if (!(matchCharsetEquals(content.data, content.charset) || matchCharsetEquals(content.data, options.charset))) {
					options = Object.assign({}, options, { charset: getCharset(content.data) });
					return this.resolveLinkStylesheetURLs(resourceURL, baseURI, options, workStylesheet);
				}
				resourceURL = content.resourceURL;
				content.data = getUpdatedResourceContent(content.resourceURL, content, options);
				if (content.data && content.data.match(/^<!doctype /i)) {
					content.data = "";
				}

				content.data = content.data.replace(/:defined/gi, "*");

				let stylesheet = cssTree.parse(content.data, { context: "stylesheet", parseCustomProperty: true });
				const importFound = await this.resolveImportURLs(stylesheet, resourceURL, options, workStylesheet);
				if (importFound) {
					stylesheet = cssTree.parse(cssTree.generate(stylesheet), { context: "stylesheet", parseCustomProperty: true });
				}
				return stylesheet;
			}
		}

		async processFrame(frameElement, pageData) {
			let sandbox = "allow-popups allow-top-navigation allow-top-navigation-by-user-activation";
			if (pageData.content.match(NOSCRIPT_TAG_FOUND) || pageData.content.match(CANVAS_TAG_FOUND) || pageData.content.match(SCRIPT_TAG_FOUND)) {
				sandbox += " allow-scripts allow-same-origin";
			}
			frameElement.setAttribute("sandbox", sandbox);
			if (frameElement.tagName.toUpperCase() == "OBJECT") {
				frameElement.setAttribute("data", "data:text/html," + pageData.content);
			} else {
				if (frameElement.tagName.toUpperCase() == "FRAME") {
					frameElement.setAttribute("src", "data:text/html," + pageData.content.replace(/%/g, "%25").replace(/#/g, "%23"));
				} else {
					frameElement.setAttribute("srcdoc", pageData.content);
					frameElement.removeAttribute("src");
				}
			}
		}

		async processStylesheet(cssRules, baseURI, options, resources, batchRequest) {
			const promises = [];
			const removedRules = [];
			for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
				const ruleData = cssRule.data;
				if (ruleData.type == "Atrule" && ruleData.name == "charset") {
					removedRules.push(cssRule);
				} else if (ruleData.block && ruleData.block.children) {
					if (ruleData.type == "Rule") {
						promises.push(this.processStyle(ruleData, options, resources, batchRequest));
					} else if (ruleData.type == "Atrule" && (ruleData.name == "media" || ruleData.name == "supports")) {
						promises.push(this.processStylesheet(ruleData.block.children, baseURI, options, resources, batchRequest));
					} else if (ruleData.type == "Atrule" && ruleData.name == "font-face") {
						promises.push(processFontFaceRule(ruleData));
					}
				}
			}
			removedRules.forEach(cssRule => cssRules.remove(cssRule));
			await Promise.all(promises);

			async function processFontFaceRule(ruleData) {
				const urls = getUrlFunctions(ruleData);
				await Promise.all(urls.map(async urlNode => {
					const originalResourceURL = urlNode.value;
					if (!options.blockFonts) {
						const resourceURL = normalizeURL(originalResourceURL);
						if (!testIgnoredPath(resourceURL) && testValidURL(resourceURL)) {
							let { content } = await batchRequest.addURL(resourceURL, { asBinary: true, expectedType: "font", baseURI, blockMixedContent: options.blockMixedContent });
							let resourceURLs = resources.fonts.get(urlNode);
							if (!resourceURLs) {
								resourceURLs = [];
								resources.fonts.set(urlNode, resourceURLs);
							}
							resourceURLs.push(resourceURL);
							if (!isDataURL(resourceURL) && options.saveOriginalURLs) {
								urlNode.value = "-sf-url-original(" + JSON.stringify(originalResourceURL) + ") " + content;
							} else {
								urlNode.value = content;
							}
						}
					} else {
						urlNode.value = util.EMPTY_RESOURCE;
					}
				}));
			}
		}

		async processStyle(ruleData, options, { cssVariables }, batchRequest) {
			const urls = getUrlFunctions(ruleData);
			await Promise.all(urls.map(async urlNode => {
				const originalResourceURL = urlNode.value;
				if (!options.blockImages) {
					const resourceURL = normalizeURL(originalResourceURL);
					if (!testIgnoredPath(resourceURL) && testValidURL(resourceURL)) {
						let { content, indexResource, duplicate } = await batchRequest.addURL(resourceURL, { asBinary: true, expectedType: "image", groupDuplicates: options.groupDuplicateImages });
						if (!originalResourceURL.startsWith("#")) {
							const maxSizeDuplicateImages = options.maxSizeDuplicateImages || SINGLE_FILE_VARIABLE_MAX_SIZE;
							if (duplicate && options.groupDuplicateImages && util.getContentSize(content) < maxSizeDuplicateImages) {
								const varNode = cssTree.parse("var(" + SINGLE_FILE_VARIABLE_NAME_PREFIX + indexResource + ")", { context: "value" });
								for (let keyName of Object.keys(varNode.children.head.data)) {
									urlNode[keyName] = varNode.children.head.data[keyName];
								}
								cssVariables.set(indexResource, { content, url: originalResourceURL });
							} else {
								if (!isDataURL(resourceURL) && options.saveOriginalURLs) {
									urlNode.value = "-sf-url-original(" + JSON.stringify(originalResourceURL) + ") " + content;
								} else {
									urlNode.value = content;
								}
							}
						}
					}
				} else {
					urlNode.value = util.EMPTY_RESOURCE;
				}
			}));
		}

		async processAttribute(resourceElements, attributeName, baseURI, options, expectedType, { cssVariables }, styles, batchRequest, processDuplicates, removeElementIfMissing) {
			await Promise.all(Array.from(resourceElements).map(async resourceElement => {
				let resourceURL = resourceElement.getAttribute(attributeName);
				if (resourceURL != null) {
					resourceURL = normalizeURL(resourceURL);
					let originURL = resourceElement.dataset.singleFileOriginURL;
					if (options.saveOriginalURLs && !isDataURL(resourceURL)) {
						resourceElement.setAttribute("data-sf-original-" + attributeName, resourceURL);
					}
					delete resourceElement.dataset.singleFileOriginURL;
					if (!options["block" + expectedType.charAt(0).toUpperCase() + expectedType.substring(1) + "s"]) {
						if (!testIgnoredPath(resourceURL)) {
							setAttributeEmpty(resourceElement, attributeName, expectedType);
							if (testValidPath(resourceURL)) {
								try {
									resourceURL = util.resolveURL(resourceURL, baseURI);
								} catch (error) {
									// ignored
								}
								if (testValidURL(resourceURL)) {
									let { content, indexResource, duplicate } = await batchRequest.addURL(
										resourceURL,
										{ asBinary: true, expectedType, groupDuplicates: options.groupDuplicateImages && resourceElement.tagName.toUpperCase() == "IMG" && attributeName == "src" });
									if (originURL) {
										if (this.testEmptyResource(content)) {
											try {
												originURL = util.resolveURL(originURL, baseURI);
											} catch (error) {
												// ignored
											}
											try {
												resourceURL = originURL;
												content = (await util.getContent(resourceURL, {
													asBinary: true,
													inline: true,
													expectedType,
													maxResourceSize: options.maxResourceSize,
													maxResourceSizeEnabled: options.maxResourceSizeEnabled,
													frameId: options.windowId,
													resourceReferrer: options.resourceReferrer,
													acceptHeaders: options.acceptHeaders,
													networkTimeout: options.networkTimeout
												})).data;
											} catch (error) {
												// ignored
											}
										}
									}
									if (removeElementIfMissing && this.testEmptyResource(content)) {
										resourceElement.remove();
									} else if (!this.testEmptyResource(content)) {
										let forbiddenPrefixFound = PREFIXES_FORBIDDEN_DATA_URI.filter(prefixDataURI => content.startsWith(prefixDataURI)).length;
										if (expectedType == "image") {
											if (forbiddenPrefixFound && Image) {
												forbiddenPrefixFound = await new Promise((resolve) => {
													const image = new Image();
													const timeoutId = setTimeout(() => resolve(true), 100);
													image.src = content;
													image.onload = () => cleanupAndResolve();
													image.onerror = () => cleanupAndResolve(true);

													function cleanupAndResolve(value) {
														clearTimeout(timeoutId);
														resolve(value);
													}
												});
											}
											if (!forbiddenPrefixFound) {
												const isSVG = content.startsWith(PREFIX_DATA_URI_IMAGE_SVG);
												const maxSizeDuplicateImages = options.maxSizeDuplicateImages || SINGLE_FILE_VARIABLE_MAX_SIZE;
												if (processDuplicates && duplicate && !isSVG && util.getContentSize(content) < maxSizeDuplicateImages) {
													if (this.replaceImageSource(resourceElement, SINGLE_FILE_VARIABLE_NAME_PREFIX + indexResource, options)) {
														cssVariables.set(indexResource, { content, url: originURL });
														const declarationList = cssTree.parse(resourceElement.getAttribute("style"), { context: "declarationList", parseCustomProperty: true });
														styles.set(resourceElement, declarationList);
													} else {
														resourceElement.setAttribute(attributeName, content);
													}
												} else {
													resourceElement.setAttribute(attributeName, content);
												}
											}
										} else {
											resourceElement.setAttribute(attributeName, content);
										}
									}
								}
							}
						}
					} else {
						setAttributeEmpty(resourceElement, attributeName, expectedType);
					}
				}
			}));

			function setAttributeEmpty(resourceElement, attributeName, expectedType) {
				if (expectedType == "video" || expectedType == "audio") {
					resourceElement.removeAttribute(attributeName);
				} else {
					resourceElement.setAttribute(attributeName, util.EMPTY_RESOURCE);
				}
			}
		}

		async processSrcset(resourceElements, baseURI, options, batchRequest) {
			await Promise.all(Array.from(resourceElements).map(async resourceElement => {
				const originSrcset = resourceElement.getAttribute("srcset");
				const srcset = util.parseSrcset(originSrcset);
				if (options.saveOriginalURLs && !isDataURL(originSrcset)) {
					resourceElement.setAttribute("data-sf-original-srcset", originSrcset);
				}
				if (!options.blockImages) {
					const srcsetValues = await Promise.all(srcset.map(async srcsetValue => {
						let resourceURL = normalizeURL(srcsetValue.url);
						if (!testIgnoredPath(resourceURL)) {
							if (testValidPath(resourceURL)) {
								try {
									resourceURL = util.resolveURL(resourceURL, baseURI);
								} catch (error) {
									// ignored
								}
								if (testValidURL(resourceURL)) {
									const { content } = await batchRequest.addURL(resourceURL, { asBinary: true, expectedType: "image" });
									const forbiddenPrefixFound = PREFIXES_FORBIDDEN_DATA_URI.filter(prefixDataURI => content.startsWith(prefixDataURI)).length;
									if (forbiddenPrefixFound) {
										return "";
									}
									return content + (srcsetValue.w ? " " + srcsetValue.w + "w" : srcsetValue.d ? " " + srcsetValue.d + "x" : "");
								} else {
									return "";
								}
							} else {
								return "";
							}
						} else {
							return resourceURL + (srcsetValue.w ? " " + srcsetValue.w + "w" : srcsetValue.d ? " " + srcsetValue.d + "x" : "");
						}
					}));
					resourceElement.setAttribute("srcset", srcsetValues.join(", "));
				} else {
					resourceElement.setAttribute("srcset", "");
				}
			}));
		}

		testEmptyResource(resource) {
			return resource == util.EMPTY_RESOURCE;
		}

		generateStylesheetContent(stylesheet, options) {
			let stylesheetContent = cssTree.generate(stylesheet);
			if (options.compressCSS) {
				stylesheetContent = util.compressCSS(stylesheetContent);
			}
			if (options.saveOriginalURLs) {
				stylesheetContent = replaceOriginalURLs(stylesheetContent);
			}
			return stylesheetContent;
		}

		replaceImageSource(imgElement, variableName, options) {
			const attributeValue = imgElement.getAttribute(util.IMAGE_ATTRIBUTE_NAME);
			if (attributeValue) {
				const imageData = options.images[Number(imgElement.getAttribute(util.IMAGE_ATTRIBUTE_NAME))];
				if (imageData && imageData.replaceable) {
					imgElement.setAttribute("src", `${PREFIX_DATA_URI_IMAGE_SVG},<svg xmlns="http://www.w3.org/2000/svg" width="${imageData.size.pxWidth}" height="${imageData.size.pxHeight}"><rect fill-opacity="0"/></svg>`);
					const backgroundStyle = {};
					const backgroundSize = (imageData.objectFit == "content" || imageData.objectFit == "cover") && imageData.objectFit;
					if (backgroundSize) {
						backgroundStyle["background-size"] = imageData.objectFit;
					}
					if (imageData.objectPosition) {
						backgroundStyle["background-position"] = imageData.objectPosition;
					}
					if (imageData.backgroundColor) {
						backgroundStyle["background-color"] = imageData.backgroundColor;
					}
					this.setBackgroundImage(imgElement, "var(" + variableName + ")", backgroundStyle);
					imgElement.removeAttribute(util.IMAGE_ATTRIBUTE_NAME);
					return true;
				}
			}
		}

		wrapMediaQuery(stylesheetContent, mediaQuery) {
			if (mediaQuery) {
				return "@media " + mediaQuery + "{ " + stylesheetContent + " }";
			} else {
				return stylesheetContent;
			}
		}

		getAdditionalPageData() {
			return { };
		}

		removeAlternativeFonts(doc, stylesheets, fonts, fontTests) {
			return removeAlternativeFonts(doc, stylesheets, fonts, fontTests);
		}

		async processScript(element, resourceURL) {
			const content = await util.getContent(resourceURL, {
				asBinary: true,
				inline: true,
				charset: this.charset != UTF8_CHARSET && this.charset,
				maxResourceSize: this.options.maxResourceSize,
				maxResourceSizeEnabled: this.options.maxResourceSizeEnabled,
				frameId: this.options.windowId,
				resourceReferrer: this.options.resourceReferrer,
				baseURI: this.options.baseURI,
				blockMixedContent: this.options.blockMixedContent,
				expectedType: "script",
				acceptHeaders: this.options.acceptHeaders,
				networkTimeout: this.options.networkTimeout
			});
			content.data = getUpdatedResourceContent(resourceURL, content, this.options);
			element.setAttribute("src", content.data);
		}

		setMetaCSP(metaElement) {
			metaElement.content = "default-src 'none'; font-src 'self' data:; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self' data:; script-src 'unsafe-inline' data:; object-src 'self' data:; frame-src 'self' data:;";
		}

		removeUnusedStylesheets(doc) {
			doc.querySelectorAll("link[rel*=stylesheet][rel*=alternate][title]").forEach(element => element.remove());
		}
	};
}

async function removeAlternativeFonts(doc, stylesheets, fontDeclarations, fontTests) {
	const fontsDetails = {
		fonts: new Map(),
		medias: new Map(),
		supports: new Map()
	};
	const stats = { rules: { processed: 0, discarded: 0 }, fonts: { processed: 0, discarded: 0 } };
	let sheetIndex = 0;
	stylesheets.forEach(stylesheetInfo => {
		const cssRules = stylesheetInfo.stylesheet.children;
		if (cssRules) {
			stats.rules.processed += cssRules.size;
			stats.rules.discarded += cssRules.size;
			if (stylesheetInfo.mediaText && stylesheetInfo.mediaText != MEDIA_ALL) {
				const mediaFontsDetails = createFontsDetailsInfo();
				fontsDetails.medias.set("media-" + sheetIndex + "-" + stylesheetInfo.mediaText, mediaFontsDetails);
				getFontsDetails(doc, cssRules, sheetIndex, mediaFontsDetails);
			} else {
				getFontsDetails(doc, cssRules, sheetIndex, fontsDetails);
			}
		}
		sheetIndex++;
	});
	processFontDetails(fontsDetails);
	await Promise.all([...stylesheets].map(async ([, stylesheetInfo], sheetIndex) => {
		const cssRules = stylesheetInfo.stylesheet.children;
		const media = stylesheetInfo.mediaText;
		if (cssRules) {
			if (media && media != MEDIA_ALL) {
				await processFontFaceRules(cssRules, sheetIndex, fontsDetails.medias.get("media-" + sheetIndex + "-" + media), fontDeclarations, fontTests, stats);
			} else {
				await processFontFaceRules(cssRules, sheetIndex, fontsDetails, fontDeclarations, fontTests, stats);
			}
			stats.rules.discarded -= cssRules.size;
		}
	}));
	return stats;
}

function getFontsDetails(doc, cssRules, sheetIndex, mediaFontsDetails) {
	let mediaIndex = 0, supportsIndex = 0;
	cssRules.forEach(ruleData => {
		if (ruleData.type == "Atrule" && ruleData.name == "media" && ruleData.block && ruleData.block.children && ruleData.prelude) {
			const mediaText = cssTree.generate(ruleData.prelude);
			const fontsDetails = createFontsDetailsInfo();
			mediaFontsDetails.medias.set("media-" + sheetIndex + "-" + mediaIndex + "-" + mediaText, fontsDetails);
			mediaIndex++;
			getFontsDetails(doc, ruleData.block.children, sheetIndex, fontsDetails);
		} else if (ruleData.type == "Atrule" && ruleData.name == "supports" && ruleData.block && ruleData.block.children && ruleData.prelude) {
			const supportsText = cssTree.generate(ruleData.prelude);
			const fontsDetails = createFontsDetailsInfo();
			mediaFontsDetails.supports.set("supports-" + sheetIndex + "-" + supportsIndex + "-" + supportsText, fontsDetails);
			supportsIndex++;
			getFontsDetails(doc, ruleData.block.children, sheetIndex, fontsDetails);
		} else if (ruleData.type == "Atrule" && ruleData.name == "font-face" && ruleData.block && ruleData.block.children) {
			const fontKey = getFontKey(ruleData);
			let fontInfo = mediaFontsDetails.fonts.get(fontKey);
			if (!fontInfo) {
				fontInfo = [];
				mediaFontsDetails.fonts.set(fontKey, fontInfo);
			}
			const src = getPropertyValue(ruleData, "src");
			if (src) {
				const fontSources = src.match(REGEXP_URL_FUNCTION);
				if (fontSources) {
					fontSources.forEach(source => fontInfo.unshift(source));
				}
			}
		}
	});
}

function processFontDetails(fontsDetails) {
	fontsDetails.fonts.forEach((fontInfo, fontKey) => {
		fontsDetails.fonts.set(fontKey, fontInfo.map(fontSource => {
			const fontFormatMatch = fontSource.match(REGEXP_FONT_FORMAT_VALUE);
			let fontFormat;
			const fontUrl = getURL(fontSource);
			if (fontFormatMatch && fontFormatMatch[1]) {
				fontFormat = fontFormatMatch[1].replace(REGEXP_SIMPLE_QUOTES_STRING, "$1").replace(REGEXP_DOUBLE_QUOTES_STRING, "$1").toLowerCase();
			}
			if (!fontFormat) {
				const fontFormatMatch = fontSource.match(REGEXP_URL_FUNCTION_WOFF);
				if (fontFormatMatch && fontFormatMatch[1]) {
					fontFormat = fontFormatMatch[1];
				} else {
					const fontFormatMatch = fontSource.match(REGEXP_URL_FUNCTION_WOFF_ALT);
					if (fontFormatMatch && fontFormatMatch[1]) {
						fontFormat = fontFormatMatch[1];
					}
				}
			}
			if (!fontFormat && fontUrl) {
				const fontFormatMatch = fontUrl.match(REGEXP_FONT_FORMAT);
				if (fontFormatMatch && fontFormatMatch[1]) {
					fontFormat = fontFormatMatch[1];
				}
			}
			return { src: fontSource.match(REGEXP_FONT_SRC)[1], fontUrl, format: fontFormat };
		}));
	});
	fontsDetails.medias.forEach(mediaFontsDetails => processFontDetails(mediaFontsDetails));
	fontsDetails.supports.forEach(supportsFontsDetails => processFontDetails(supportsFontsDetails));
}

async function processFontFaceRules(cssRules, sheetIndex, fontsDetails, fontDeclarations, fontTests, stats) {
	const removedRules = [];
	let mediaIndex = 0, supportsIndex = 0;
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type == "Atrule" && ruleData.name == "media" && ruleData.block && ruleData.block.children && ruleData.prelude) {
			const mediaText = cssTree.generate(ruleData.prelude);
			await processFontFaceRules(ruleData.block.children, sheetIndex, fontsDetails.medias.get("media-" + sheetIndex + "-" + mediaIndex + "-" + mediaText), fontDeclarations, fontTests, stats);
			mediaIndex++;
		} else if (ruleData.type == "Atrule" && ruleData.name == "supports" && ruleData.block && ruleData.block.children && ruleData.prelude) {
			const supportsText = cssTree.generate(ruleData.prelude);
			await processFontFaceRules(ruleData.block.children, sheetIndex, fontsDetails.supports.get("supports-" + sheetIndex + "-" + supportsIndex + "-" + supportsText), fontDeclarations, fontTests, stats);
			supportsIndex++;
		} else if (ruleData.type == "Atrule" && ruleData.name == "font-face") {
			const key = getFontKey(ruleData);
			const fontInfo = fontsDetails.fonts.get(key);
			if (fontInfo) {
				const processed = await processFontFaceRule(ruleData, fontInfo, fontDeclarations, fontTests, stats);
				if (processed) {
					fontsDetails.fonts.delete(key);
				}
			} else {
				removedRules.push(cssRule);
			}
		}
	}
	removedRules.forEach(cssRule => cssRules.remove(cssRule));
}

async function processFontFaceRule(ruleData, fontInfo, fontDeclarations, fontTests, stats) {
	const removedNodes = [];
	for (let node = ruleData.block.children.head; node; node = node.next) {
		if (node.data.property == "src") {
			removedNodes.push(node);
		}
	}
	removedNodes.pop();
	removedNodes.forEach(node => ruleData.block.children.remove(node));
	const srcDeclaration = ruleData.block.children.filter(node => node.property == "src").tail;
	if (srcDeclaration) {
		await Promise.all(fontInfo.map(async source => {
			if (fontTests.has(source.src)) {
				source.valid = fontTests.get(source.src);
			} else {
				if (FontFace && source.fontUrl) {
					const fontFace = new FontFace("test-font", source.src);
					try {
						let timeout;
						await Promise.race([
							fontFace.load().then(() => fontFace.loaded).then(() => { source.valid = true; globalThis.clearTimeout(timeout); }),
							new Promise(resolve => timeout = globalThis.setTimeout(() => { source.valid = true; resolve(); }, FONT_MAX_LOAD_DELAY))
						]);
					} catch (error) {
						const urlNodes = cssTree.findAll(srcDeclaration.data, node => node.type == "Url");
						const declarationFontURLs = Array.from(fontDeclarations).find(([node]) => urlNodes.includes(node) && node.value == source.fontUrl);
						if (declarationFontURLs && declarationFontURLs[1].length) {
							const fontURL = declarationFontURLs[1][0];
							if (fontURL) {
								const fontFace = new FontFace("test-font", "url(" + fontURL + ")");
								try {
									let timeout;
									await Promise.race([
										fontFace.load().then(() => fontFace.loaded).then(() => { source.valid = true; globalThis.clearTimeout(timeout); }),
										new Promise(resolve => timeout = globalThis.setTimeout(() => { source.valid = true; resolve(); }, FONT_MAX_LOAD_DELAY))
									]);
								} catch (error) {
									// ignored
								}
							}
						} else {
							source.valid = true;
						}
					}
				} else {
					source.valid = true;
				}
				fontTests.set(source.src, source.valid);
			}
		}));
		const findSourceByFormat = (fontFormat, testValidity) => fontInfo.find(source => !source.src.match(EMPTY_URL_SOURCE) && source.format == fontFormat && (!testValidity || source.valid));
		const filterSources = fontSource => fontInfo.filter(source => source == fontSource || source.src.startsWith(LOCAL_SOURCE));
		stats.fonts.processed += fontInfo.length;
		stats.fonts.discarded += fontInfo.length;
		const woffFontFound =
			findSourceByFormat("woff2-variations", true) || findSourceByFormat("woff2", true) || findSourceByFormat("woff", true);
		if (woffFontFound) {
			fontInfo = filterSources(woffFontFound);
		} else {
			const ttfFontFound =
				findSourceByFormat("truetype-variations", true) || findSourceByFormat("truetype", true);
			if (ttfFontFound) {
				fontInfo = filterSources(ttfFontFound);
			} else {
				const otfFontFound =
					findSourceByFormat("opentype") || findSourceByFormat("embedded-opentype");
				if (otfFontFound) {
					fontInfo = filterSources(otfFontFound);
				} else {
					fontInfo = fontInfo.filter(source => !source.src.match(EMPTY_URL_SOURCE) && (source.valid) || source.src.startsWith(LOCAL_SOURCE));
				}
			}
		}
		stats.fonts.discarded -= fontInfo.length;
		fontInfo.reverse();
		try {
			srcDeclaration.data.value = cssTree.parse(fontInfo.map(fontSource => fontSource.src).join(","), { context: "value", parseCustomProperty: true });
		}
		catch (error) {
			// ignored
		}
		return true;
	} else {
		return false;
	}
}

function getPropertyValue(ruleData, propertyName) {
	let property;
	if (ruleData.block.children) {
		property = ruleData.block.children.filter(node => {
			try {
				return node.property == propertyName && !cssTree.generate(node.value).match(/\\9$/);
			} catch (error) {
				return node.property == propertyName;
			}
		}).tail;
	}
	if (property) {
		try {
			return cssTree.generate(property.data.value);
		} catch (error) {
			// ignored
		}
	}
}

function getFontKey(ruleData) {
	return JSON.stringify([
		normalizeFontFamily(getPropertyValue(ruleData, "font-family")),
		getFontWeight(getPropertyValue(ruleData, "font-weight") || "400"),
		getPropertyValue(ruleData, "font-style") || "normal",
		getPropertyValue(ruleData, "unicode-range"),
		getFontStretch(getPropertyValue(ruleData, "font-stretch")),
		getPropertyValue(ruleData, "font-variant") || "normal",
		getPropertyValue(ruleData, "font-feature-settings"),
		getPropertyValue(ruleData, "font-variation-settings")
	]);
}

function getFontStretch(stretch) {
	return FONT_STRETCHES[stretch] || stretch;
}

function createFontsDetailsInfo() {
	return {
		fonts: new Map(),
		medias: new Map(),
		supports: new Map()
	};
}

function getURL(urlFunction) {
	urlFunction = urlFunction.replace(/url\(-sf-url-original\\\(\\"(.*?)\\"\\\)\\ /g, "");
	const urlMatch = urlFunction.match(REGEXP_URL_SIMPLE_QUOTES_FN) ||
		urlFunction.match(REGEXP_URL_DOUBLE_QUOTES_FN) ||
		urlFunction.match(REGEXP_URL_NO_QUOTES_FN);
	return urlMatch && urlMatch[1];
}