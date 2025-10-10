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

import * as cssTree from "./../vendor/css-tree.js";

const MEDIA_ALL = "all";
const IGNORED_PSEUDO_ELEMENTS = ["after", "before", "first-letter", "first-line", "placeholder", "selection", "part", "marker"];
const SINGLE_FILE_HIDDEN_CLASS_NAME = "sf-hidden";
const DISPLAY_STYLE = "display";
const REGEXP_VENDOR_IDENTIFIER = /-(ms|webkit|moz|o)-/;
const DEBUG = false;

class MatchedRules {
	constructor(doc, stylesheets, styles) {
		this.doc = doc;
		this.mediaAllInfo = createRuleContext(MEDIA_ALL);
		const matchedElementsCache = new Map();
		let sheetIndex = 0;
		const workStyleSheet = doc.createElement("style");
		doc.body.appendChild(workStyleSheet);
		const workStyleElement = doc.createElement("span");
		doc.body.appendChild(workStyleElement);
		stylesheets.forEach((stylesheetInfo, key) => {
			if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
				const cssRules = stylesheetInfo.stylesheet.children;
				if (cssRules) {
					if (stylesheetInfo.mediaText && stylesheetInfo.mediaText != MEDIA_ALL) {
						const ruleContext = createRuleContext(stylesheetInfo.mediaText);
						this.mediaAllInfo.medias.set("style-" + sheetIndex + "-" + stylesheetInfo.mediaText, ruleContext);
						getMatchedElementsRules(doc, cssRules, stylesheets, ruleContext, sheetIndex, styles, matchedElementsCache, workStyleSheet);
					} else {
						getMatchedElementsRules(doc, cssRules, stylesheets, this.mediaAllInfo, sheetIndex, styles, matchedElementsCache, workStyleSheet);
					}
				}
			}
			sheetIndex++;
		});
		let startTime;
		if (DEBUG) {
			startTime = Date.now();
			log("  -- STARTED sortRules");
		}
		sortRules(this.mediaAllInfo);
		if (DEBUG) {
			log("  -- ENDED sortRules", Date.now() - startTime);
			startTime = Date.now();
			log("  -- STARTED computeCascade");
		}
		computeCascade(this.mediaAllInfo, [], this.mediaAllInfo, workStyleSheet, workStyleElement);
		workStyleSheet.remove();
		workStyleElement.remove();
		if (DEBUG) {
			log("  -- ENDED computeCascade", Date.now() - startTime);
		}
	}

	getMediaAllInfo() {
		return this.mediaAllInfo;
	}
}

export {
	getMediaAllInfo
};

function getMediaAllInfo(doc, stylesheets, styles) {
	return new MatchedRules(doc, stylesheets, styles).getMediaAllInfo();
}

function createRuleContext(media) {
	const ruleContext = {
		media: media,
		elements: new Map(),
		medias: new Map(),
		supports: new Map(),
		containers: new Map(),
		rules: new Map(),
		pseudoRules: new Map(),
		layers: new Map(),
		layerOrder: []
	};
	if (media == MEDIA_ALL) {
		ruleContext.matchedStyles = new Map();
	}
	return ruleContext;
}

function getMatchedElementsRules(doc, cssRules, stylesheets, ruleContext, sheetIndex, styles, matchedElementsCache, workStylesheet, indexes = {
	mediaIndex: 0, ruleIndex: 0, anonymousLayerIndex: 0, supportsIndex: 0, containerIndex: 0
}) {
	let startTime;
	if (DEBUG && cssRules.length > 1) {
		startTime = Date.now();
		log("  -- STARTED getMatchedElementsRules", " index =", sheetIndex, "rules.length =", cssRules.length);
	}
	cssRules.forEach(ruleData => {
		if (ruleData.type == "Atrule" && ruleData.name == "import" && ruleData.prelude && ruleData.prelude.children && ruleData.prelude.children.head.data.importedChildren) {
			getMatchedElementsRules(doc, ruleData.prelude.children.head.data.importedChildren, stylesheets, ruleContext, sheetIndex, styles, matchedElementsCache, workStylesheet, indexes);
		} else if (ruleData.type == "Atrule" && ruleData.name == "layer") {
			const parentLayerContext = indexes.layerContext;
			const targetLayerContainer = parentLayerContext && parentLayerContext.layerInfo
				? parentLayerContext.layerInfo
				: ruleContext;

			if (ruleData.prelude) {
				const layerNames = [];
				if (ruleData.prelude.children) {
					ruleData.prelude.children.forEach(child => {
						if (child.type === "LayerList" && child.children) {
							child.children.forEach(layer => {
								if (layer.type === "Layer" && layer.name) {
									layerNames.push(layer.name);
								}
							});
						} else if (child.type === "Layer" && child.name) {
							layerNames.push(child.name);
						}
					});
				}
				if (layerNames.length > 0 && (!ruleData.block || !ruleData.block.children || layerNames.length == 1)) {
					layerNames.forEach(layerName => {
						if (!targetLayerContainer.layers.has(layerName)) {
							const layerOrder = targetLayerContainer.layerOrder.length;
							targetLayerContainer.layers.set(layerName, {
								order: layerOrder,
								rules: new Map(),
								pseudoRules: new Map(),
								layers: new Map(),
								layerOrder: []
							});
							targetLayerContainer.layerOrder.push(layerName);
						}
					});
					if (ruleData.block && ruleData.block.children) {
						const layerInfo = targetLayerContainer.layers.get(layerNames[0]);
						const previousAnonymousCount = indexes.anonymousLayerIndex;
						indexes.layerContext = { layerName: layerNames[0], layerInfo };
						indexes.anonymousLayerIndex = 0;
						getMatchedElementsRules(doc, ruleData.block.children, stylesheets, ruleContext, sheetIndex, styles, matchedElementsCache, workStylesheet, indexes);
						indexes.anonymousLayerIndex = previousAnonymousCount;
						if (parentLayerContext) {
							indexes.layerContext = parentLayerContext;
						} else {
							delete indexes.layerContext;
						}
					}
				}
			} else if (ruleData.block && ruleData.block.children) {
				const previousAnonymousCount = indexes.anonymousLayerIndex;
				indexes.anonymousLayerIndex++;
				const anonymousLayerName = "anonymous-" + sheetIndex + "-" + previousAnonymousCount;
				const anonymousLayerOrder = targetLayerContainer.layerOrder.length;
				const anonymousLayer = {
					order: anonymousLayerOrder,
					rules: new Map(),
					pseudoRules: new Map(),
					isAnonymous: true,
					layers: new Map(),
					layerOrder: []
				};
				targetLayerContainer.layers.set(anonymousLayerName, anonymousLayer);
				targetLayerContainer.layerOrder.push(anonymousLayerName);
				indexes.layerContext = { layerName: anonymousLayerName, layerInfo: anonymousLayer };
				const previousAnonymousCountForNested = indexes.anonymousLayerIndex;
				indexes.anonymousLayerIndex = 0;
				getMatchedElementsRules(doc, ruleData.block.children, stylesheets, ruleContext, sheetIndex, styles, matchedElementsCache, workStylesheet, indexes);
				indexes.anonymousLayerIndex = previousAnonymousCountForNested;
				if (parentLayerContext) {
					indexes.layerContext = parentLayerContext;
				} else {
					delete indexes.layerContext;
				}
			}
		} else if (ruleData.block && ruleData.block.children && ruleData.prelude && ruleData.prelude.children) {
			if (ruleData.type == "Atrule" && ruleData.name == "media") {
				const mediaText = cssTree.generate(ruleData.prelude);
				const ruleMediaInfo = createRuleContext(mediaText);
				ruleContext.medias.set("rule-" + sheetIndex + "-" + indexes.mediaIndex + "-" + mediaText, ruleMediaInfo);
				getMatchedElementsRules(doc, ruleData.block.children, stylesheets, ruleMediaInfo, sheetIndex, styles, matchedElementsCache, workStylesheet);
				indexes.mediaIndex++;
			} else if (ruleData.type == "Atrule" && ruleData.name == "supports") {
				const supportsText = cssTree.generate(ruleData.prelude);
				const ruleSupportsInfo = createRuleContext(supportsText);
				ruleContext.supports.set("rule-" + sheetIndex + "-" + indexes.supportsIndex + "-" + supportsText, ruleSupportsInfo);
				getMatchedElementsRules(doc, ruleData.block.children, stylesheets, ruleSupportsInfo, sheetIndex, styles, matchedElementsCache, workStylesheet);
				indexes.supportsIndex++;
			} else if (ruleData.type == "Atrule" && ruleData.name == "container") {
				const containerText = cssTree.generate(ruleData.prelude);
				const ruleContainerInfo = createRuleContext(containerText);
				ruleContext.containers.set("rule-" + sheetIndex + "-" + indexes.containerIndex + "-" + containerText, ruleContainerInfo);
				getMatchedElementsRules(doc, ruleData.block.children, stylesheets, ruleContainerInfo, sheetIndex, styles, matchedElementsCache, workStylesheet);
				indexes.containerIndex++;
			} else if (ruleData.type == "Rule") {
				processRule(doc, ruleData, null, ruleContext, sheetIndex, styles, matchedElementsCache, workStylesheet, indexes);
			}
		}
	});
	if (DEBUG && cssRules.length > 1) {
		log("  -- ENDED   getMatchedElementsRules", "delay =", Date.now() - startTime);
	}
}

function processRule(doc, ruleData, parentRuleData, ruleContext, sheetIndex, styles, matchedElementsCache, workStylesheet, indexes) {
	const selectors = ruleData.prelude.children.toArray();
	const selectorsText = ruleData.prelude.children.toArray().map(selector => cssTree.generate(selector));
	let hasNestedRules = false;
	if (ruleData.block && ruleData.block.children) {
		for (let child = ruleData.block.children.head; child; child = child.next) {
			if (child.data.type == "Raw") {
				try {
					if (child.data.value.indexOf("{") < child.data.value.indexOf("}")) {
						child.data = cssTree.parse("& " + child.data.value, { context: "rule" });
					}
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					// ignored
				}
			}
			if (child.data.type == "Rule") {
				hasNestedRules = true;
				break;
			}
		}
	}
	const layerContext = indexes.layerContext || null;
	let layerName = null;
	let layerOrder = null;
	let isAnonymousLayer = false;
	if (layerContext && layerContext.layerName) {
		layerName = layerContext.layerName;
		const layerInfo = layerContext.layerInfo;
		if (layerInfo) {
			layerOrder = layerInfo.order;
			isAnonymousLayer = layerInfo.isAnonymous || false;
		}
	}
	const ruleInfo = {
		ruleData,
		ruleContext,
		ruleIndex: indexes.ruleIndex,
		sheetIndex,
		matchedSelectors: new Set(),
		declarations: new Set(),
		selectors,
		selectorsText,
		parentRuleData,
		hasNestedRules,
		expandedSelectorText: null,
		layerName,
		layerOrder,
		isAnonymousLayer,
		layerContext
	};
	indexes.ruleIndex++;
	if (hasNestedRules && !layerName) {
		ruleContext.rules.set(ruleData, ruleInfo);
	}
	if (!invalidSelector(selectorsText.join(","), workStylesheet) || selectorsText.find(selectorText => selectorText.includes("|"))) {
		for (let selector = ruleData.prelude.children.head, selectorIndex = 0; selector; selector = selector.next, selectorIndex++) {
			let selectorText = selectorsText[selectorIndex];
			let selectorForSpecificity = selector;
			if (parentRuleData) {
				const parentRuleInfo = ruleContext.rules.get(parentRuleData);
				const parentSelectorText = parentRuleInfo && parentRuleInfo.expandedSelectorText
					? parentRuleInfo.expandedSelectorText
					: cssTree.generate(parentRuleData.prelude.children.head.data);

				const expandedSelectorText = combineSelectors(parentSelectorText, selectorText);
				selectorText = expandedSelectorText;
				ruleInfo.expandedSelectorText = expandedSelectorText;
				const expandedAST = cssTree.parse(expandedSelectorText, { context: "selector" });
				selectorForSpecificity = { data: expandedAST };
			}

			const selectorInfo = { selector: selectorForSpecificity, selectorText, ruleInfo };
			getMatchedElementsSelector(doc, selectorInfo, styles, matchedElementsCache);
		}
	}
	if (ruleData.block && ruleData.block.children) {
		for (let child = ruleData.block.children.head; child; child = child.next) {
			if (child.data.type == "Rule") {
				processRule(doc, child.data, ruleData, ruleContext, sheetIndex, styles, matchedElementsCache, workStylesheet, indexes);
			}
		}
	}
}

function invalidSelector(selectorText, workStylesheet) {
	workStylesheet.textContent = selectorText + "{}";
	return workStylesheet.sheet ? !workStylesheet.sheet.cssRules.length : workStylesheet.sheet;
}

function getMatchedElementsSelector(doc, selectorInfo, styles, matchedElementsCache) {
	const filteredSelectorText = getFilteredSelector(selectorInfo.selector, selectorInfo.selectorText);
	const selectorText = filteredSelectorText != selectorInfo.selectorText ? filteredSelectorText : selectorInfo.selectorText;
	const cachedMatchedElements = matchedElementsCache.get(selectorText);
	let matchedElements = cachedMatchedElements;
	if (!matchedElements) {
		try {
			matchedElements = doc.querySelectorAll(selectorText);
			if (selectorText != "." + SINGLE_FILE_HIDDEN_CLASS_NAME) {
				matchedElements = Array.from(doc.querySelectorAll(selectorText)).filter(matchedElement =>
					!matchedElement.classList.contains(SINGLE_FILE_HIDDEN_CLASS_NAME) &&
					(matchedElement.style.getPropertyValue(DISPLAY_STYLE) != "none" || matchedElement.style.getPropertyPriority("display") != "important")
				);
			}
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			// ignored				
		}
	}
	if (matchedElements) {
		if (!cachedMatchedElements) {
			matchedElementsCache.set(selectorText, matchedElements);
		}
		if (matchedElements.length) {
			if (filteredSelectorText == selectorInfo.selectorText) {
				matchedElements.forEach(element => addRule(element, selectorInfo, styles));
			} else {
				const targetContainer = selectorInfo.ruleInfo.layerName && selectorInfo.ruleInfo.layerContext
					? selectorInfo.ruleInfo.layerContext.layerInfo
					: selectorInfo.ruleInfo.ruleContext;
				let pseudoSelectors = targetContainer.pseudoRules.get(selectorInfo.ruleInfo.ruleData);
				if (!pseudoSelectors) {
					pseudoSelectors = new Set();
					targetContainer.pseudoRules.set(selectorInfo.ruleInfo.ruleData, pseudoSelectors);
				}
				pseudoSelectors.add(selectorInfo.selectorText);
			}
		}
	}
}

function getFilteredSelector(selector, selectorText) {
	const removedSelectors = [];
	let namespaceFound;
	selector = { data: cssTree.parse(cssTree.generate(selector.data), { context: "selector" }) };
	filterNamespace(selector);
	if (namespaceFound) {
		selectorText = cssTree.generate(selector.data).trim();
	}
	filterPseudoClasses(selector);
	if (removedSelectors.length) {
		removedSelectors.forEach(({ parentSelector, selector }) => {
			if (parentSelector.data.children.size == 0 || !selector.prev || selector.prev.data.type == "Combinator" || selector.prev.data.type == "WhiteSpace") {
				parentSelector.data.children.replace(selector, cssTree.parse("*", { context: "selector" }).children.head);
			} else {
				parentSelector.data.children.remove(selector);
			}
		});
		selectorText = cssTree.generate(selector.data).trim();
	}
	return selectorText;

	function filterPseudoClasses(selector, parentSelector) {
		if (selector.data.children) {
			for (let childSelector = selector.data.children.head; childSelector; childSelector = childSelector.next) {
				filterPseudoClasses(childSelector, selector);
			}
		}
		if ((selector.data.type == "PseudoClassSelector") ||
			(selector.data.type == "PseudoElementSelector" && (testVendorPseudo(selector) || IGNORED_PSEUDO_ELEMENTS.includes(selector.data.name)))) {
			removedSelectors.push({ parentSelector, selector });
		}
	}

	function filterNamespace(selector) {
		if (selector.data.children) {
			for (let childSelector = selector.data.children.head; childSelector; childSelector = childSelector.next) {
				filterNamespace(childSelector);
			}
		}
		if (selector.data.type == "TypeSelector" && selector.data.name.includes("|")) {
			namespaceFound = true;
			selector.data.name = selector.data.name.substring(selector.data.name.lastIndexOf("|") + 1);
		}
	}

	function testVendorPseudo(selector) {
		const name = selector.data.name;
		return name.startsWith("-") || name.startsWith("\\-");
	}
}

function addRule(element, selectorInfo, styles) {
	const ruleContext = selectorInfo.ruleInfo.ruleContext;
	const elementStyle = styles.get(element);
	let elementInfo = ruleContext.elements.get(element);
	if (!elementInfo) {
		elementInfo = [];
		if (elementStyle) {
			elementInfo.push({ styleInfo: { styleData: elementStyle, declarations: new Set() } });
		}
		ruleContext.elements.set(element, elementInfo);
	}
	const specificity = computeSpecificity(selectorInfo.selector.data);
	specificity.ruleIndex = selectorInfo.ruleInfo.ruleIndex;
	specificity.sheetIndex = selectorInfo.ruleInfo.sheetIndex;
	specificity.layerOrder = selectorInfo.ruleInfo.layerOrder;
	selectorInfo.specificity = specificity;
	elementInfo.push(selectorInfo);
}

function computeCascade(ruleContext, parentRuleContext, mediaAllInfo, workStylesheet, workStyleElement) {
	ruleContext.elements.forEach((elementInfo/*, element*/) =>
		getDeclarationsInfo(elementInfo, workStylesheet, workStyleElement/*, element*/).forEach((declarationsInfo, property) => {
			if (declarationsInfo.selectorInfo.ruleInfo || ruleContext == mediaAllInfo) {
				let info;
				if (declarationsInfo.selectorInfo.ruleInfo) {
					info = declarationsInfo.selectorInfo.ruleInfo;
					const ruleData = info.ruleData;
					const ascendantMedia = [ruleContext, ...parentRuleContext].find(media => media.rules.get(ruleData)) || ruleContext;
					if (info.layerName) {
						if (info.layerContext && info.layerContext.layerInfo) {
							info.layerContext.layerInfo.rules.set(ruleData, info);
						}
					} else {
						ascendantMedia.rules.set(ruleData, info);
					}
					if (ruleData) {
						info.matchedSelectors.add(declarationsInfo.selectorInfo.selectorText);
					}
				} else {
					info = declarationsInfo.selectorInfo.styleInfo;
					const styleData = info.styleData;
					const matchedStyleInfo = mediaAllInfo.matchedStyles.get(styleData);
					if (!matchedStyleInfo) {
						mediaAllInfo.matchedStyles.set(styleData, info);
					}
				}
				if (!info.declarations.has(property) && property.type === "Declaration") {
					info.declarations.add(property);
				}
			}
		}));
	delete ruleContext.elements;
	const sortedRules = new Map([...ruleContext.rules.entries()].sort((a, b) => a[1].ruleIndex - b[1].ruleIndex));
	ruleContext.rules = sortedRules;
	const rulesToRemove = [];
	ruleContext.rules.forEach((ruleInfo, ruleData) => {
		if (ruleInfo.hasNestedRules) {
			const hasDirectDeclarations = ruleInfo.declarations.size > 0;
			let hasWinningNestedChildren = false;
			if (ruleData.block && ruleData.block.children) {
				for (let child = ruleData.block.children.head; child; child = child.next) {
					if (child.data.type === "Rule" && ruleContext.rules.has(child.data)) {
						hasWinningNestedChildren = true;
						break;
					}
				}
			}
			if (!hasDirectDeclarations && !hasWinningNestedChildren) {
				rulesToRemove.push(ruleData);
			}
		}
	});
	rulesToRemove.forEach(ruleData => ruleContext.rules.delete(ruleData));
	ruleContext.layers.forEach(layerInfo => cleanupLayer(layerInfo));
	ruleContext.medias.forEach(childMediaInfo => computeCascade(childMediaInfo, [ruleContext, ...parentRuleContext], mediaAllInfo, workStylesheet, workStyleElement));
	ruleContext.supports.forEach(childSupportsInfo => computeCascade(childSupportsInfo, [ruleContext, ...parentRuleContext], mediaAllInfo, workStylesheet, workStyleElement));
	ruleContext.containers.forEach(childContainerInfo => computeCascade(childContainerInfo, [ruleContext, ...parentRuleContext], mediaAllInfo, workStylesheet, workStyleElement));
}

function cleanupLayer(layerInfo) {
	function checkLayerForRule(layer, childData) {
		for (const [, r] of layer.rules) {
			if (r.ruleData === childData) {
				return true;
			}
		}
		if (layer.layers) {
			for (const nestedLayer of layer.layers.values()) {
				if (checkLayerForRule(nestedLayer, childData)) {
					return true;
				}
			}
		}
		return false;
	}
	if (layerInfo.layers) {
		layerInfo.layers.forEach(nestedLayer => {
			cleanupLayer(nestedLayer);
		});
	}
	const layerRulesToRemove = [];
	layerInfo.rules.forEach((ruleInfo, ruleData) => {
		const hasDeclarations = ruleInfo.declarations.size > 0;
		if (!hasDeclarations && !ruleInfo.hasNestedRules) {
			layerRulesToRemove.push(ruleData);
		} else if (ruleInfo.hasNestedRules) {
			let hasWinningNestedChildren = false;
			if (ruleInfo.ruleData.block && ruleInfo.ruleData.block.children) {
				for (let child = ruleInfo.ruleData.block.children.head; child; child = child.next) {
					if (child.data.type === "Rule") {
						if (checkLayerForRule(layerInfo, child.data)) {
							hasWinningNestedChildren = true;
							break;
						}
					}
				}
			}

			if (!hasDeclarations && !hasWinningNestedChildren) {
				layerRulesToRemove.push(ruleData);
			}
		}
	});
	layerRulesToRemove.forEach(ruleData => layerInfo.rules.delete(ruleData));
}

function getDeclarationsInfo(elementInfo, workStylesheet, workStyleElement/*, element*/) {
	const declarationsInfo = new Map();
	const processedProperties = new Set();
	const propertyToDeclaration = new Map();
	const revertProperties = new Set();
	elementInfo.forEach(selectorInfo => {
		let declarations;
		if (selectorInfo.styleInfo) {
			declarations = selectorInfo.styleInfo.styleData.children;
		} else {
			declarations = selectorInfo.ruleInfo.ruleData.block.children;
		}
		for (let declaration = declarations.head; declaration; declaration = declaration.next) {
			const declarationData = declaration.data;
			if (declarationData.type === "Declaration" && declarationData.value) {
				const isRevertValue = declarationData.value.type === "Value" &&
					declarationData.value.children &&
					declarationData.value.children.first &&
					declarationData.value.children.first.type === "Identifier" &&
					(declarationData.value.children.first.name === "revert" ||
						declarationData.value.children.first.name === "revert-layer");
				if (isRevertValue) {
					revertProperties.add(declarationData.property);
				}
			}
		}
	});
	elementInfo.forEach(selectorInfo => {
		let declarations;
		if (selectorInfo.styleInfo) {
			declarations = selectorInfo.styleInfo.styleData.children;
		} else {
			declarations = selectorInfo.ruleInfo.ruleData.block.children;
		}
		processDeclarations(declarationsInfo, declarations, selectorInfo, processedProperties, workStylesheet, workStyleElement, propertyToDeclaration, revertProperties);
	});
	return declarationsInfo;
}

function processDeclarations(declarationsInfo, declarations, selectorInfo, processedProperties, _workStylesheet, workStyleElement, propertyToDeclaration, revertProperties) {
	for (let declaration = declarations.tail; declaration; declaration = declaration.prev) {
		const declarationData = declaration.data;
		const declarationText = cssTree.generate(declarationData);
		const currentLayerOrder = selectorInfo.ruleInfo ? selectorInfo.ruleInfo.layerOrder : null;
		const isRevertProperty = declarationData.type === "Declaration" && revertProperties.has(declarationData.property);
		const shouldProcess = declarationData.type == "Declaration" &&
			!invalidDeclaration(declarationText, workStyleElement) &&
			(declarationText.match(REGEXP_VENDOR_IDENTIFIER) ||
				!processedProperties.has(declarationData.property) ||
				declarationData.important ||
				currentLayerOrder !== null ||
				isRevertProperty);
		if (shouldProcess) {
			if (isRevertProperty) {
				declarationsInfo.set(declarationData, { selectorInfo, important: declarationData.important });
			} else {
				const existingDeclarationData = propertyToDeclaration.get(declarationData.property);
				const declarationInfo = existingDeclarationData ? declarationsInfo.get(existingDeclarationData) : undefined;
				const existingLayerOrder = declarationInfo && declarationInfo.selectorInfo.ruleInfo ? declarationInfo.selectorInfo.ruleInfo.layerOrder : null;
				let shouldReplace = false;
				if (!declarationInfo) {
					shouldReplace = true;
				} else if (declarationData.important && !declarationInfo.important) {
					shouldReplace = true;
				} else if (declarationData.important && declarationInfo.important) {
					if (currentLayerOrder === null && existingLayerOrder !== null) {
						shouldReplace = false;
					} else if (currentLayerOrder !== null && existingLayerOrder === null) {
						shouldReplace = true;
					} else if (currentLayerOrder !== null && existingLayerOrder !== null) {
						shouldReplace = currentLayerOrder < existingLayerOrder;
					}
				} else if (!declarationData.important && !declarationInfo.important) {
					if (currentLayerOrder === null && existingLayerOrder !== null) {
						shouldReplace = true;
					} else if (currentLayerOrder !== null && existingLayerOrder === null) {
						shouldReplace = false;
					} else if (currentLayerOrder !== null && existingLayerOrder !== null) {
						shouldReplace = currentLayerOrder > existingLayerOrder;
					}
				}
				if (shouldReplace) {
					if (existingDeclarationData) {
						declarationsInfo.delete(existingDeclarationData);
					}
					declarationsInfo.set(declarationData, { selectorInfo, important: declarationData.important });
					propertyToDeclaration.set(declarationData.property, declarationData);
					if (!declarationText.match(REGEXP_VENDOR_IDENTIFIER)) {
						processedProperties.add(declarationData.property);
					}
				}
			}
		} else if (declarationData.type == "Rule") {
			const declarationInfo = declarationsInfo.get(declarationData);
			if (!declarationInfo) {
				declarationsInfo.set(declarationData, { selectorInfo });
			}
		}
	}
}

function invalidDeclaration(declarationText, workStyleElement) {
	let invalidDeclaration;
	workStyleElement.style = declarationText;
	if (!workStyleElement.style.length) {
		if (!declarationText.match(REGEXP_VENDOR_IDENTIFIER)) {
			invalidDeclaration = true;
		}
	}
	return invalidDeclaration;
}

function sortRules(media) {
	media.elements.forEach(elementRules => elementRules.sort((ruleInfo1, ruleInfo2) =>
		ruleInfo1.styleInfo && !ruleInfo2.styleInfo ? -1 :
			!ruleInfo1.styleInfo && ruleInfo2.styleInfo ? 1 :
				compareSpecificity(ruleInfo1.specificity, ruleInfo2.specificity)));
	media.medias.forEach(sortRules);
	media.supports.forEach(sortRules);
	media.containers.forEach(sortRules);
}

function computeSpecificity(selector, specificity = { a: 0, b: 0, c: 0 }) {
	if (selector.type == "IdSelector") {
		specificity.a++;
	}
	if (selector.type == "ClassSelector" || selector.type == "AttributeSelector" || (selector.type == "PseudoClassSelector" && selector.name != "not")) {
		specificity.b++;
	}
	if ((selector.type == "TypeSelector" && selector.name != "*") || selector.type == "PseudoElementSelector") {
		specificity.c++;
	}
	if (selector.children) {
		selector.children.forEach(selector => computeSpecificity(selector, specificity));
	}
	return specificity;
}

function compareSpecificity(specificity1, specificity2) {
	if (specificity1.a > specificity2.a) {
		return -1;
	} else if (specificity1.a < specificity2.a) {
		return 1;
	} else if (specificity1.b > specificity2.b) {
		return -1;
	} else if (specificity1.b < specificity2.b) {
		return 1;
	} else if (specificity1.c > specificity2.c) {
		return -1;
	} else if (specificity1.c < specificity2.c) {
		return 1;
	} else if (specificity1.sheetIndex > specificity2.sheetIndex) {
		return -1;
	} else if (specificity1.sheetIndex < specificity2.sheetIndex) {
		return 1;
	} else if (specificity1.ruleIndex > specificity2.ruleIndex) {
		return -1;
	} else if (specificity1.ruleIndex < specificity2.ruleIndex) {
		return 1;
	} else {
		return -1;
	}
}

function combineSelectors(parentSelectorText, childSelectorText) {
	const parentAST = cssTree.parse(parentSelectorText, { context: "selector" });
	const childAST = cssTree.parse(childSelectorText, { context: "selector" });
	let hasNestingSelector = false;
	cssTree.walk(childAST, {
		visit: "NestingSelector",
		enter() {
			hasNestingSelector = true;
		}
	});
	if (hasNestingSelector) {
		cssTree.walk(childAST, {
			visit: "NestingSelector",
			enter(_node, item, list) {
				parentAST.children.forEach(parentNode => {
					list.insertData(cssTree.clone(parentNode), item);
				});
				list.remove(item);
			}
		});
		return cssTree.generate(childAST);
	} else {
		const combinedAST = cssTree.parse(parentSelectorText + " " + childSelectorText, { context: "selector" });
		return cssTree.generate(combinedAST);
	}
}

function log(...args) {
	console.log("S-File <css-mat>", ...args); // eslint-disable-line no-console
}