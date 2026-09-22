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

import * as cssTree from "./../../vendor/css-tree.js";
import { serialize as serializeSrcset } from "./../../vendor/html-srcset-parser.js";

const JSON = globalThis.JSON;
const FontFace = globalThis.FontFace;
const Set = globalThis.Set;
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;
const Image = globalThis.Image;

const ABOUT_BLANK_URI = "about:blank";
const UTF8_CHARSET = "utf-8";
const DATA_URI_PREFIX = "data:";
const DEFAULT_FONT_WEIGHT = 400;
const FONT_KEY_FAMILY_INDEX = 0;
const FONT_KEY_WEIGHT_INDEX = 1;
const FONT_KEY_STYLE_INDEX = 2;
const FONT_KEY_STRETCH_INDEX = 4;
const NESTED_AT_RULE_NAMES = ["media", "supports", "layer", "container"];
const PREFIX_DATA_URI_IMAGE_SVG = "data:image/svg+xml";
const PREFIXES_FORBIDDEN_DATA_URI = ["data:text/"];
const SCRIPT_TAG_FOUND = /<script/gi;
const NOSCRIPT_TAG_FOUND = /<noscript/gi;
const CANVAS_TAG_FOUND = /<canvas/gi;
const SINGLE_FILE_VARIABLE_NAME_PREFIX = "--sf-img-";
const SINGLE_FILE_VARIABLE_MAX_SIZE = 512 * 1024;
const EMPTY_URL_SOURCE = /^url\(["']?data:[^,]*,?["']?\)/;
const LOCAL_SOURCE = "local(";
const FONT_MAX_LOAD_DELAY = 5000;
const DUPLICATE_STYLESHEET_ATTRIBUTE_NAME = "data-sf-duplicate-stylesheet-ref";
const LAYER_KEYWORD = "layer";
const SUPPORTS_KEYWORD = "supports";
const LINK_FETCH_ATTRIBUTE_NAMES = ["rel", "href", "type", "media", "as", "crossorigin", "integrity",
	"referrerpolicy", "hreflang", "sizes", "imagesrcset", "imagesizes", "fetchpriority"];

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
	testValidURL,
	resizeImage,
	toDataURI
} from "./processor-helper-common.js";
import { getFontWeight } from "./../helper.js";

export {
	getProcessorHelperClass,
	cssTree
};

function getProcessorHelperClass(utilInstance) {
	util = utilInstance;
	const ProcessorHelperCommon = getProcessorHelperCommonClass(util, cssTree);

	return class ProcessorHelper extends ProcessorHelperCommon {
		async resolveStylesheets(element, stylesheetInfo, stylesheets, baseURI, options, workStyleElement) {
			if (element.tagName.toUpperCase() == "LINK" && element.charset) {
				options.charset = element.charset;
			}
			await this.resolveStylesheetElement(element, stylesheetInfo, stylesheets, baseURI, options, workStyleElement);
		}

		async resolveStylesheetElement(element, stylesheetInfo, stylesheets, baseURI, options, workStyleElement) {
			let stylesheet;
			stylesheets.set(element, stylesheetInfo);
			if (!options.inlineStylesheetsRefs.has(element)) {
				if (!options.blockStylesheets || (options.keepPrintStyleSheets && stylesheetInfo.mediaText == "print")) {
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
					options.inlineStylesheets.forEach(({ content, styleElement }, index) => {
						if (content === element.textContent) {
							options.inlineStylesheets.set(index, {
								styleElement,
								content: this.generateStylesheetContent(stylesheet, options)
							});
						}
					});
					stylesheetInfo.stylesheet = stylesheet;
				} else {
					stylesheets.delete(element);
				}
			}
		}

		replaceStylesheets(doc, stylesheets, options) {
			const styleElements = Array.from(doc.querySelectorAll("style"));
			styleElements.forEach(element => {
				const stylesheetInfo = stylesheets.get(element);
				if (stylesheetInfo && !options.inlineStylesheetsRefs.has(element)) {
					element.textContent = this.generateStylesheetContent(stylesheetInfo.stylesheet, options);
					options.inlineStylesheets.forEach(({ styleElement }, index) => {
						if (styleElement === element) {
							options.inlineStylesheets.set(index, {
								styleElement,
								content: element.textContent
							});
						}
					});
				}
			});
			styleElements.forEach(element => {
				const stylesheetInfo = stylesheets.get(element);
				if (stylesheetInfo) {
					stylesheets.delete(element);
					const stylesheetRefIndex = options.inlineStylesheetsRefs.get(element);
					if (stylesheetRefIndex !== undefined) {
						if (options.groupDuplicateStylesheets) {
							if (!doc.querySelector("style[" + DUPLICATE_STYLESHEET_ATTRIBUTE_NAME + "=\"" + stylesheetRefIndex + "\"]")) {
								const styleElement = doc.createElement("style");
								styleElement.textContent = options.inlineStylesheets.get(stylesheetRefIndex).content;
								styleElement.setAttribute("media", "not all");
								styleElement.setAttribute(DUPLICATE_STYLESHEET_ATTRIBUTE_NAME, stylesheetRefIndex);
								doc.head.appendChild(styleElement);
							}
							element.textContent = "/* */";
							element.setAttribute("onload", "this.textContent=document.querySelector('style[" + DUPLICATE_STYLESHEET_ATTRIBUTE_NAME + "=\"" + stylesheetRefIndex + "\"]')?.textContent;this.removeAttribute('onload')");
						} else {
							element.textContent = options.inlineStylesheets.get(stylesheetRefIndex).content;
						}
					}
					if (stylesheetInfo.mediaText) {
						element.media = stylesheetInfo.mediaText;
					}
				} else {
					element.remove();
				}
			});
			if (options.groupDuplicateStylesheets && doc.querySelector("style[" + DUPLICATE_STYLESHEET_ATTRIBUTE_NAME + "]")) {
				const scriptElement = doc.createElement("script");
				scriptElement.textContent = "document.currentScript.remove();addEventListener(\"load\",()=>document.querySelectorAll(\"style[" + DUPLICATE_STYLESHEET_ATTRIBUTE_NAME + "]\").forEach(e=>e.remove()))";
				doc.body.appendChild(scriptElement);
			}
			doc.querySelectorAll("link[rel*=stylesheet]").forEach(linkElement => {
				const stylesheetInfo = stylesheets.get(linkElement);
				if (stylesheetInfo) {
					stylesheets.delete(linkElement);
					const styleElement = doc.createElement("style");
					Array.from(linkElement.attributes).forEach(({ name, value }) => {
						if (!LINK_FETCH_ATTRIBUTE_NAMES.includes(name.toLowerCase())) {
							styleElement.setAttribute(name, value);
						}
					});
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
							// eslint-disable-next-line no-unused-vars
						} catch (error) {
							// ignored
						}
						if (testValidURL(resourceURL) && !importedStyleSheets.has(resourceURL)) {
							options.inline = true;
							const content = await this.getStylesheetContent(resourceURL, options);
							resourceURL = content.resourceURL;
							content.data = getUpdatedResourceContent(resourceURL, options) || content.data;
							if (content.data && content.data.match(/^<!doctype /i)) {
								content.data = "";
							}
							const importedLayerName = getImportedLayerName(node);
							if (importedLayerName !== null) {
								content.data = this.wrapLayer(content.data, importedLayerName);
							}
							const mediaQueryListNode = cssTree.find(node, node => node.type == "MediaQueryList");
							if (mediaQueryListNode) {
								content.data = this.wrapMediaQuery(content.data, cssTree.generate(mediaQueryListNode));
							}
							const importedSupportsCondition = getImportedSupportsCondition(node);
							if (importedSupportsCondition) {
								content.data = "@supports " + importedSupportsCondition + " { " + content.data + " }";
							}
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
				content.data = getUpdatedResourceContent(content.resourceURL, options) || content.data;
				if (content.data && content.data.match(/^<!doctype /i)) {
					content.data = "";
				}
				let stylesheet = cssTree.parse(content.data, { context: "stylesheet", parseCustomProperty: true });
				const importFound = await this.resolveImportURLs(stylesheet, resourceURL, options, workStylesheet);
				if (importFound) {
					stylesheet = cssTree.parse(cssTree.generate(stylesheet), { context: "stylesheet", parseCustomProperty: true });
				}
				return stylesheet;
			}
		}

		async processFrame(frameElement, pageData, options) {
			let sandbox = "allow-popups allow-top-navigation-by-user-activation";
			if (pageData.content.match(NOSCRIPT_TAG_FOUND) || pageData.content.match(CANVAS_TAG_FOUND) || pageData.content.match(SCRIPT_TAG_FOUND) || options.saveRawPage) {
				sandbox += " allow-scripts allow-modals allow-popups allow-downloads allow-pointer-lock allow-presentation";
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

		async processFont(resourceURL, urlNode, originalResourceURL, baseURI, options, resources, batchRequest) {
			let { content } = await batchRequest.addURL(resourceURL, {
				asBinary: true,
				expectedType: "font",
				baseURI,
				blockMixedContent: options.blockMixedContent
			});
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

		async processStyle(ruleData, options, resources, batchRequest) {
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
								resources.cssVariables.set(indexResource, { content, url: originalResourceURL });
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

		async processAttribute(doc, resourceElements, attributeName, baseURI, options, expectedType, resources, removeElementIfMissing, batchRequest, styles, processDuplicates) {
			await Promise.all(Array.from(resourceElements).map(async resourceElement => {
				let resourceURL = resourceElement.getAttribute(attributeName);
				if (resourceURL != null) {
					resourceURL = normalizeURL(resourceURL);
					let originURL = resourceElement.dataset.singleFileOriginURL;
					if (options.saveOriginalURLs && !isDataURL(resourceURL)) {
						resourceElement.setAttribute("data-sf-original-" + attributeName, resourceURL);
					}
					delete resourceElement.dataset.singleFileOriginURL;
					if (!expectedType || !options["block" + expectedType.charAt(0).toUpperCase() + expectedType.substring(1) + "s"]) {
						if (!testIgnoredPath(resourceURL)) {
							this.setAttributeEmpty(resourceElement, attributeName, expectedType);
							if (testValidPath(resourceURL)) {
								try {
									resourceURL = util.resolveURL(resourceURL, baseURI);
									// eslint-disable-next-line no-unused-vars
								} catch (error) {
									// ignored
								}
								if (testValidURL(resourceURL)) {
									const declaredContentType = ["OBJECT", "EMBED"].includes(resourceElement.tagName.toUpperCase()) ? resourceElement.getAttribute("type") : "";
									const groupDuplicates = options.groupDuplicateImages && resourceElement.tagName.toUpperCase() == "IMG" && attributeName == "src";
									let { content, indexResource, duplicate } = await batchRequest.addURL(
										resourceURL,
										{ asBinary: true, expectedType, contentType: declaredContentType, groupDuplicates });
									if (originURL) {
										if (this.testEmptyResource(content)) {
											try {
												originURL = util.resolveURL(originURL, baseURI);
												// eslint-disable-next-line no-unused-vars
											} catch (error) {
												// ignored
											}
											try {
												resourceURL = originURL;
												content = (await util.getContent(resourceURL, {
													asBinary: true,
													inline: true,
													expectedType,
													contentType: declaredContentType,
													maxResourceSize: options.maxResourceSize,
													maxResourceSizeEnabled: options.maxResourceSizeEnabled,
													frameId: options.windowId,
													resourceReferrer: options.resourceReferrer,
													acceptHeaders: options.acceptHeaders,
													networkTimeout: options.networkTimeout
												})).data;
												// eslint-disable-next-line no-unused-vars
											} catch (error) {
												// ignored
											}
										}
									}
									if (options.imageReductionFactor > 1 && expectedType == "image") {
										content = await resizeImage(doc, content, options);
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
														resources.cssVariables.set(indexResource, { content, url: originURL });
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
						this.setAttributeEmpty(resourceElement, attributeName, expectedType);
					}
				}
			}));
		}

		async processImageSrcset(resourceURL, srcsetValue, resources, batchRequest) {
			const { content } = await batchRequest.addURL(resourceURL, { asBinary: true, expectedType: "image" });
			const forbiddenPrefixFound = PREFIXES_FORBIDDEN_DATA_URI.filter(prefixDataURI => content.startsWith(prefixDataURI)).length;
			if (forbiddenPrefixFound) {
				return "";
			}
			return serializeSrcset([Object.assign({}, srcsetValue, { url: content })]);
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
					const backgroundSize = (imageData.objectFit == "content" || imageData.objectFit == "cover" || imageData.objectFit == "contain") && imageData.objectFit;
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

		wrapLayer(stylesheetContent, layerName) {
			return "@layer " + (layerName ? layerName + " " : "") + "{ " + stylesheetContent + " }";
		}

		getAdditionalPageData() {
			return {};
		}

		async processScript(element, resourceURL, options, charset, batchRequest) {
			let content = getUpdatedResourceContent(resourceURL, options);
			if (content) {
				content = await toDataURI(content, "text/javascript", charset);
			} else {
				const result = await batchRequest.addURL(resourceURL, {
					asBinary: true,
					inline: true,
					charset: charset != UTF8_CHARSET && charset,
					maxResourceSize: options.maxResourceSize,
					maxResourceSizeEnabled: options.maxResourceSizeEnabled,
					frameId: options.windowId,
					resourceReferrer: options.resourceReferrer,
					baseURI: options.baseURI,
					blockMixedContent: options.blockMixedContent,
					expectedType: "script",
					acceptHeaders: options.acceptHeaders,
					networkTimeout: options.networkTimeout
				});
				content = result.content;
			}
			element.setAttribute("src", content);
		}

		async processWorklet(scriptElement, resourceURL, workletOptions, options, charset, batchRequest) {
			let { content } = await batchRequest.addURL(resourceURL, {
				asBinary: true,
				charset: charset != UTF8_CHARSET && charset,
				maxResourceSize: options.maxResourceSize,
				maxResourceSizeEnabled: options.maxResourceSizeEnabled,
				frameId: options.windowId,
				resourceReferrer: options.resourceReferrer,
				baseURI: options.baseURI,
				blockMixedContent: options.blockMixedContent,
				expectedType: "script",
				acceptHeaders: options.acceptHeaders,
				networkTimeout: options.networkTimeout
			});
			if (workletOptions) {
				scriptElement.textContent += `  CSS.paintWorklet.addModule("${content}", ${JSON.stringify(workletOptions)});\n`;
			} else {
				scriptElement.textContent += `  CSS.paintWorklet.addModule("${content}");\n`;
			}
		}

		setMetaCSP(metaElement) {
			metaElement.content = "default-src 'none'; font-src 'self' data:; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self' data:; script-src 'unsafe-inline' data:; object-src 'self' data:; frame-src 'self' data:; form-action 'none'; base-uri 'none';";
		}

		removeUnusedStylesheets(doc) {
			doc.querySelectorAll("link[rel*=stylesheet][rel*=alternate][title]").forEach(element => element.remove());
		}

		groupDuplicateFonts(stylesheets, fonts, options) {
			if (options.usedFonts && options.usedFonts.length) {
				const fontFaces = [];
				stylesheets.forEach(stylesheetInfo => {
					if (stylesheetInfo.stylesheet && stylesheetInfo.stylesheet.children) {
						getFontFaces(stylesheetInfo.stylesheet.children, "", fontFaces);
					}
				});
				const families = new Map();
				fontFaces.forEach(fontFace => {
					const fontKey = JSON.parse(this.getFontKey(fontFace.ruleData));
					const familyKey = fontFace.scope + JSON.stringify([fontKey[FONT_KEY_FAMILY_INDEX],
						fontKey[FONT_KEY_STYLE_INDEX], fontKey[FONT_KEY_STRETCH_INDEX]]);
					let family = families.get(familyKey);
					if (!family) {
						family = { name: fontKey[FONT_KEY_FAMILY_INDEX], groups: new Map(), mergeable: true };
						families.set(familyKey, family);
					}
					const source = this.getPropertyValue(fontFace.ruleData, "src");
					const range = this.getFontWeightRange(fontFace.ruleData);
					if (source && source.includes(DATA_URI_PREFIX) && range) {
						fontKey[FONT_KEY_WEIGHT_INDEX] = null;
						const groupKey = JSON.stringify(fontKey) + " " + source;
						const group = family.groups.get(groupKey);
						if (group) {
							group.push({ fontFace, range });
						} else {
							family.groups.set(groupKey, [{ fontFace, range }]);
						}
					} else {
						family.mergeable = false;
					}
				});
				families.forEach(family => this.mergeFontFaceWeights(family, options.usedFonts));
			}
		}

		// Every group of the family has to be merged or none of it: two groups that differ only in
		// unicode-range are one composite face, and merging one of them alone would leave a weight
		// matched by two faces that are no longer a composite, which CSS Fonts 4 §5.2 resolves in a way
		// that "can differ between multiple user agents". Requiring every group to span the same set of
		// weights is what keeps the merged faces a composite, and it also blocks the case where some
		// other face of the family sits inside the interval, since that face is a group of its own.
		mergeFontFaceWeights(family, usedFonts) {
			const groups = Array.from(family.groups.values());
			const weightKey = group => group.map(({ range }) => range.join("-")).sort().join(",");
			if (family.mergeable && groups.some(group => group.length > 1) &&
				groups.every(group => weightKey(group) == weightKey(groups[0]))) {
				const ranges = groups[0].map(({ range }) => range);
				const minWeight = Math.min(...ranges.map(([min]) => min));
				const maxWeight = Math.max(...ranges.map(([, max]) => max));
				const declared = weight => ranges.some(([min, max]) => weight >= min && weight <= max);
				const usedWeightInRange = usedFonts.some(([usedFamily, usedWeight]) => {
					const weight = Number(usedWeight);
					return usedFamily == family.name && weight > minWeight && weight < maxWeight && !declared(weight);
				});
				if (!usedWeightInRange) {
					groups.forEach(group => {
						const kept = group[group.length - 1];
						this.setFontWeightRange(kept.fontFace.ruleData, minWeight, maxWeight);
						group.forEach(({ fontFace }) => {
							if (fontFace != kept.fontFace) {
								fontFace.cssRules.remove(fontFace.cssRule);
							}
						});
					});
				}
			}
		}

		getFontWeightRange(ruleData) {
			const value = this.getPropertyValue(ruleData, "font-weight");
			if (value === undefined) {
				return [DEFAULT_FONT_WEIGHT, DEFAULT_FONT_WEIGHT];
			}
			const weights = value.trim().split(/\s+/).map(weight => Number(getFontWeight(util.removeQuotes(weight))));
			if (weights.length <= 2 && weights.every(weight => Number.isFinite(weight))) {
				return [Math.min(...weights), Math.max(...weights)];
			}
		}

		setFontWeightRange(ruleData, minWeight, maxWeight) {
			const value = cssTree.parse(minWeight == maxWeight ? String(minWeight) : minWeight + " " + maxWeight, { context: "value" });
			const declaration = ruleData.block.children.filter(node => node.property == "font-weight").tail;
			if (declaration) {
				declaration.data.value = value;
			} else {
				ruleData.block.children.appendData({ type: "Declaration", property: "font-weight", important: false, value });
			}
		}

		async processFontFaceRule(ruleData, fontInfo, fontDeclarations, fontTests, stats) {
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
								if (error.name == "NetworkError") {
									source.valid = true;
								} else {
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
												// eslint-disable-next-line no-unused-vars
											} catch (error) {
												// ignored
											}
										}
									} else {
										source.valid = true;
									}
								}
							}
						} else {
							source.valid = true;
						}
						fontTests.set(source.src, source.valid);
					}
				}));
				const findSourceByFormat = (fontFormat, testValidity) => util.findLast(fontInfo, source => !source.src.match(EMPTY_URL_SOURCE) && source.format == fontFormat && (!testValidity || source.valid));
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
				if (!fontInfo.length) {
					return false;
				}
				fontInfo.reverse();
				try {
					srcDeclaration.data.value = cssTree.parse(fontInfo.map(fontSource => fontSource.src).join(","), { context: "value", parseCustomProperty: true });
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					// ignored
				}
			}
			return true;
		}
	};
}

function getImportedLayerName(importNode) {
	const layerNode = cssTree.find(importNode, node => node.type == "Layer");
	if (layerNode) {
		return layerNode.name;
	}
	const prelude = importNode.prelude;
	if (prelude && prelude.children) {
		for (let child = prelude.children.head; child; child = child.next) {
			if (child.data.type == "Identifier" && child.data.name.toLowerCase() == LAYER_KEYWORD) {
				return "";
			}
		}
	}
	return null;
}

function getImportedSupportsCondition(importNode) {
	const supportsNode = cssTree.find(importNode, node => node.type == "Function" && node.name.toLowerCase() == SUPPORTS_KEYWORD);
	if (supportsNode && supportsNode.children && supportsNode.children.head) {
		const conditionNode = supportsNode.children.head.data;
		const condition = cssTree.generate(conditionNode);
		return conditionNode.type == "Declaration" ? "(" + condition + ")" : condition;
	}
	return null;
}

function getFontFaces(cssRules, scope, fontFaces) {
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type == "Atrule" && ruleData.name == "import" && ruleData.prelude && ruleData.prelude.children &&
			ruleData.prelude.children.head.data.importedChildren) {
			getFontFaces(ruleData.prelude.children.head.data.importedChildren,
				scope + "|import " + cssTree.generate(ruleData.prelude), fontFaces);
		} else if (ruleData.type == "Atrule" && NESTED_AT_RULE_NAMES.includes(ruleData.name) && ruleData.block && ruleData.block.children) {
			getFontFaces(ruleData.block.children,
				scope + "|" + ruleData.name + " " + (ruleData.prelude ? cssTree.generate(ruleData.prelude) : ""), fontFaces);
		} else if (ruleData.type == "Atrule" && ruleData.name == "font-face" && ruleData.block && ruleData.block.children) {
			fontFaces.push({ ruleData, cssRule, cssRules, scope });
		}
	}
}