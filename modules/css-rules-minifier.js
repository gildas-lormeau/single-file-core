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
import * as cssTree from "./../vendor/css-tree.js";
import { computeSpecificity } from "./css-specificity.js";

const PSEUDO_ELEMENT_NAMES = ["after", "before", "first-letter", "first-line", "placeholder", "selection", "part", "marker", "grammar-error", "spelling-error", "cue", "cue-region"];

const DYNAMIC_STATE_PSEUDO_CLASSES = ["hover", "focus", "active", "focus-within", "focus-visible", "target", "visited", "link"];

const UNMATCHABLE_PSEUDO_CLASSES = [
	"user-invalid",
	"current", "past", "future",
	"playing", "paused", "seeking", "buffering", "stalled", "muted", "volume-locked"
];

export {
	process
};

function process(doc, stylesheets) {
	const stats = { processed: 0, discarded: 0 };
	let sourceOrderCounter = 0;
	doc.matchedElements = new Set();
	doc.matchedSelectors = new Map();
	doc.layerOrder = new Map();
	doc.layerDeclarationCounter = 0;
	doc.layerDeclarations = [];
	doc.layerOrderCache = new Map();
	doc.globalLayerOrder = null;
	try {
		stylesheets.forEach((stylesheetInfo, key) => {
			if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
				const cssRules = stylesheetInfo.stylesheet.children;
				if (cssRules) {
					collectLayerOrder(doc, cssRules, [], []);
				}
			}
		});
		stylesheets.forEach((stylesheetInfo, key) => {
			if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
				const cssRules = stylesheetInfo.stylesheet.children;
				if (cssRules) {
					sourceOrderCounter = processStylesheetRules(doc, cssRules, stylesheets, stats, [], sourceOrderCounter, [], []);
				}
			}
		});
		computeCascade(doc);
		stylesheets.forEach((stylesheetInfo, key) => {
			if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
				const cssRules = stylesheetInfo.stylesheet.children;
				if (cssRules) {
					cleanEmptyRules(cssRules, stats);
				}
			}
		});
	} finally {
		if (doc.matchedElements) {
			doc.matchedElements.forEach(element => delete element.matchingSelectors);
		}
		delete doc.matchedElements;
		delete doc.matchedSelectors;
		delete doc.layerOrder;
		delete doc.layerDeclarations;
		delete doc.globalLayerOrder;
		delete doc.layerOrderCache;
	}
	return stats;
}

function collectLayerOrder(doc, cssRules, layerStack = [], conditionalStack = []) {
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type === "Atrule" && ruleData.name === "layer") {
			if (ruleData.block) {
				const layerName = ruleData.prelude ? cssTree.generate(ruleData.prelude) : "";
				const fullLayerName = [...layerStack, layerName].filter(l => l !== "").join(".");
				if (fullLayerName) {
					doc.layerDeclarations.push({
						name: fullLayerName,
						order: doc.layerDeclarationCounter++,
						conditionalContext: conditionalStack.slice()
					});
				}
				collectLayerOrder(doc, ruleData.block.children, [...layerStack, layerName], conditionalStack);
			} else if (ruleData.prelude) {
				const layerNames = cssTree.generate(ruleData.prelude).split(",");
				layerNames.forEach(layerName => {
					const fullLayerName = [...layerStack, layerName].filter(l => l !== "").join(".");
					if (fullLayerName) {
						doc.layerDeclarations.push({
							name: fullLayerName,
							order: doc.layerDeclarationCounter++,
							conditionalContext: conditionalStack.slice()
						});
					}
				});
			}
		} else if (ruleData.type === "Atrule" && ruleData.block && ruleData.block.children) {
			const isConditional = ["media", "supports", "container"].includes(ruleData.name);
			const newConditionalStack = isConditional
				? [...conditionalStack, { name: ruleData.name, prelude: cssTree.generate(ruleData.prelude) }]
				: conditionalStack;
			collectLayerOrder(doc, ruleData.block.children, layerStack, newConditionalStack);
		} else if (ruleData.type === "Rule" && ruleData.block && ruleData.block.children) {
			collectLayerOrder(doc, ruleData.block.children, layerStack, conditionalStack);
		}
	}
}

function processStylesheetRules(doc, cssRules, stylesheets, stats, ancestorsSelectors = [], sourceOrderCounter = 0, layerStack = [], conditionalStack = []) {
	const removedRules = new Set();
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		stats.processed++;
		const ruleData = cssRule.data;
		if (ruleData.type === "Atrule" && ruleData.name === "import" && ruleData.prelude && ruleData.prelude.children && ruleData.prelude.children.head.data.importedChildren) {
			sourceOrderCounter = processStylesheetRules(doc, ruleData.prelude.children.head.data.importedChildren, stylesheets, stats, ancestorsSelectors, sourceOrderCounter, layerStack, conditionalStack);
		} else if (ruleData.type === "Atrule" && ruleData.name === "layer" && ruleData.block) {
			const layerName = ruleData.prelude ? cssTree.generate(ruleData.prelude) : "";
			const newLayerStack = [...layerStack, layerName];
			fixRawRules(ruleData);
			sourceOrderCounter = processStylesheetRules(doc, ruleData.block.children, stylesheets, stats, ancestorsSelectors, sourceOrderCounter, newLayerStack, conditionalStack);
			if (ruleData.block.children.size === 0) {
				stats.discarded++;
				removedRules.add(cssRule);
			}
		} else if (ruleData.type === "Atrule" && ruleData.name === "layer" && !ruleData.block) {
			stats.discarded++;
			removedRules.add(cssRule);
		} else if (ruleData.type === "Atrule" && ruleData.block && ruleData.name != "font-face" && ruleData.name != "keyframes") {
			const isConditional = ["media", "supports", "container"].includes(ruleData.name);
			const newConditionalStack = isConditional
				? [...conditionalStack, { name: ruleData.name, prelude: cssTree.generate(ruleData.prelude) }]
				: conditionalStack;
			fixRawRules(ruleData);
			sourceOrderCounter = processStylesheetRules(doc, ruleData.block.children, stylesheets, stats, ancestorsSelectors, sourceOrderCounter, layerStack, newConditionalStack);
			if (ruleData.block.children.size === 0) {
				stats.discarded++;
				removedRules.add(cssRule);
			}
		} else if (ruleData.type === "Rule" && ruleData.prelude.children) {
			ruleData.sourceOrder = sourceOrderCounter++;
			const selectorsText = ruleData.prelude.children.toArray().map(selector => cssTree.generate(selector));
			const removedSelectors = [];
			for (let selector = ruleData.prelude.children.head, selectorIndex = 0; selector; selector = selector.next, selectorIndex++) {
				let resolvedSelectorText = selectorsText[selectorIndex];
				if (ancestorsSelectors.length) {
					resolvedSelectorText = combineWithAncestors(selector.data, ancestorsSelectors);
				}
				const resolvedSelectorAST = cssTree.parse(resolvedSelectorText, { context: "selectorList" });
				let maxSpecificity = { a: 0, b: 0, c: 0 };
				cssTree.walk(resolvedSelectorAST, {
					visit: "Selector",
					enter(node) {
						const specificity = computeSpecificity(node);
						if (specificity.a > maxSpecificity.a ||
							(specificity.a === maxSpecificity.a && specificity.b > maxSpecificity.b) ||
							(specificity.a === maxSpecificity.a && specificity.b === maxSpecificity.b && specificity.c > maxSpecificity.c)) {
							maxSpecificity = specificity;
						}
					}
				});
				selector.specificity = maxSpecificity;
				selector.sourceOrder = ruleData.sourceOrder;
				selector.rule = ruleData;
				selector.layers = layerStack;
				selector.conditionalContext = conditionalStack;
				selector.hasPseudoElement = hasPseudoElement(selector.data);
				selector.hasDynamicState = hasDynamicStatePseudoClass(selector.data);
				if (!selector.hasPseudoElement && !selector.hasDynamicState) {
					const matchedElements = matchElements(doc, selector, resolvedSelectorText);
					if (!matchedElements || matchedElements.length === 0) {
						removedSelectors.push(selector);
					} else {
						matchedElements.forEach(element => {
							doc.matchedElements.add(element);
							if (!element.matchingSelectors) {
								element.matchingSelectors = [];
							}
							element.matchingSelectors.push(selector);
						});
					}
				}
			}
			removedSelectors.forEach(selector => ruleData.prelude.children.remove(selector));
			if (ruleData.prelude.children.size === 0) {
				stats.discarded++;
				removedRules.add(cssRule);
			} else if (ruleData.block && ruleData.block.children) {
				fixRawRules(ruleData);
				cleanDeclarations(ruleData.block);
				sourceOrderCounter = processStylesheetRules(doc, ruleData.block.children, stylesheets, stats, ancestorsSelectors.concat(ruleData.prelude), sourceOrderCounter, layerStack, conditionalStack);
			}
		}
	}
	removedRules.forEach(rule => cssRules.remove(rule));
	return sourceOrderCounter;
}

function hasPseudoElement(selectorNode) {
	let found = false;
	cssTree.walk(selectorNode, {
		visit: "PseudoElementSelector",
		enter() {
			found = true;
		}
	});
	if (!found) {
		cssTree.walk(selectorNode, {
			visit: "PseudoClassSelector",
			enter(node) {
				if (PSEUDO_ELEMENT_NAMES.includes(node.name)) {
					found = true;
				}
			}
		});
	}
	return found;
}

function hasDynamicStatePseudoClass(selectorNode) {
	let found = false;
	cssTree.walk(selectorNode, {
		visit: "PseudoClassSelector",
		enter(node) {
			if (DYNAMIC_STATE_PSEUDO_CLASSES.includes(node.name)) {
				found = true;
			}
		}
	});
	return found;
}

function computeCascade(doc) {
	const winningDeclarations = new Set();
	doc.matchedElements.forEach(element => computeElementCascadedStyles(element, winningDeclarations, doc));
	removeLosingDeclarations(doc, winningDeclarations);
}

function computeElementCascadedStyles(element, winningDeclarations, doc) {
	const cascadedStyles = new Map();
	if (!element.matchingSelectors) {
		return cascadedStyles;
	}
	const allDeclarations = [];
	element.matchingSelectors.forEach(selector => {
		const declarations = selector.rule.block && selector.rule.block.children;
		if (declarations) {
			for (let declaration = declarations.head; declaration; declaration = declaration.next) {
				if (declaration.data.type === "Declaration") {
					allDeclarations.push({
						property: declaration.data.property,
						declaration: declaration.data,
						declarationNode: declaration,
						selector: selector,
						important: declaration.data.important
					});
				}
			}
		}
	});
	const contextGroups = new Map();
	allDeclarations.forEach(item => {
		const contextKey = getContextKey(item.selector.conditionalContext);
		if (!contextGroups.has(contextKey)) {
			contextGroups.set(contextKey, []);
		}
		contextGroups.get(contextKey).push(item);
	});
	contextGroups.forEach(declarations => {
		declarations.sort((a, b) => compareDeclarations(a, b, doc, element));
		declarations.forEach(item => {
			cascadedStyles.set(item.property + ":" + getContextKey(item.selector.conditionalContext), {
				declaration: item.declaration,
				selector: item.selector,
				declarationNode: item.declarationNode,
				property: item.property
			});
		});
	});
	cascadedStyles.forEach(({ declarationNode }) => winningDeclarations.add(declarationNode));
}

function getContextKey(conditionalContext) {
	if (!conditionalContext || conditionalContext.length === 0) {
		return "";
	}
	return JSON.stringify(conditionalContext.map(context => ({
		name: context.name,
		prelude: context.prelude
	})));
}

function removeLosingDeclarations(doc, winningDeclarations) {
	const allDeclarationNodes = new Map();
	doc.matchedElements.forEach(element => {
		if (element.matchingSelectors) {
			element.matchingSelectors.forEach(selector => {
				const declarations = selector.rule.block && selector.rule.block.children;
				if (declarations) {
					for (let declaration = declarations.head; declaration; declaration = declaration.next) {
						if (declaration.data.type === "Declaration") {
							allDeclarationNodes.set(declaration, declarations);
						}
					}
				}
			});
		}
	});
	allDeclarationNodes.forEach((list, node) => {
		if (!winningDeclarations.has(node)) {
			list.remove(node);
		}
	});
}

function cleanEmptyRules(cssRules, stats) {
	const removedRules = new Set();
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type === "Rule") {
			if (!ruleData.block || !ruleData.block.children || ruleData.block.children.size === 0) {
				stats.discarded++;
				removedRules.add(cssRule);
			} else {
				cleanEmptyRules(ruleData.block.children, stats);
			}
		} else if (ruleData.type === "Atrule" && ruleData.block && ruleData.name !== "font-face" && ruleData.name !== "keyframes") {
			cleanEmptyRules(ruleData.block.children, stats);
			if (ruleData.block.children.size === 0) {
				stats.discarded++;
				removedRules.add(cssRule);
			}
		}
	}
	removedRules.forEach(rule => cssRules.remove(rule));
}

function compareDeclarations(declarationA, declarationB, doc, element) {
	const importantA = declarationA.important ? 1 : 0;
	const importantB = declarationB.important ? 1 : 0;
	if (importantA !== importantB) {
		return importantA - importantB;
	}
	const layerComparison = compareLayers(declarationA.selector.layers, declarationB.selector.layers, doc, element);
	if (layerComparison !== 0) {
		return importantA ? -layerComparison : layerComparison;
	}
	if (declarationA.selector.specificity.a !== declarationB.selector.specificity.a) {
		return declarationA.selector.specificity.a - declarationB.selector.specificity.a;
	}
	if (declarationA.selector.specificity.b !== declarationB.selector.specificity.b) {
		return declarationA.selector.specificity.b - declarationB.selector.specificity.b;
	}
	if (declarationA.selector.specificity.c !== declarationB.selector.specificity.c) {
		return declarationA.selector.specificity.c - declarationB.selector.specificity.c;
	}
	if (declarationA.selector.sourceOrder !== declarationB.selector.sourceOrder) {
		return declarationA.selector.sourceOrder - declarationB.selector.sourceOrder;
	}
	return 0;
}

function compareLayers(layersA, layersB, doc, element) {
	const isUnlayeredA = !layersA || layersA.length === 0 || layersA.every(l => l === "");
	const isUnlayeredB = !layersB || layersB.length === 0 || layersB.every(l => l === "");
	if (isUnlayeredA && isUnlayeredB) {
		return 0;
	}
	if (isUnlayeredA) {
		return 1;
	}
	if (isUnlayeredB) {
		return -1;
	}
	const fullLayerNameA = layersA.filter(layerName => layerName !== "").join(".");
	const fullLayerNameB = layersB.filter(layerName => layerName !== "").join(".");
	if (fullLayerNameA === fullLayerNameB) {
		return 0;
	}
	const minLength = Math.min(layersA.length, layersB.length);
	const effectiveMap = buildEffectiveLayerOrder(doc, element);
	for (let indexLayer = 0; indexLayer < minLength; indexLayer++) {
		if (layersA[indexLayer] !== layersB[indexLayer]) {
			const partialLayerA = layersA.slice(0, indexLayer + 1).filter(l => l !== "").join(".");
			const partialLayerB = layersB.slice(0, indexLayer + 1).filter(l => l !== "").join(".");
			const orderA = effectiveMap.get(partialLayerA);
			const orderB = effectiveMap.get(partialLayerB);
			if (orderA !== undefined && orderB !== undefined) {
				return orderA - orderB;
			}
			if (orderA !== undefined) {
				return -1;
			}
			if (orderB !== undefined) {
				return 1;
			}
			return 0;
		}
	}
	return layersA.length - layersB.length;
}

function buildEffectiveLayerOrder(doc, element) {
	if (element && doc.layerOrderCache && doc.layerOrderCache.has(element)) {
		return doc.layerOrderCache.get(element);
	}
	const applicable = [];
	for (let indexDeclaration = 0; indexDeclaration < doc.layerDeclarations.length; indexDeclaration++) {
		const declaration = doc.layerDeclarations[indexDeclaration];
		applicable.push(declaration.name);
	}
	const map = new Map();
	for (let indexApplicable = 0; indexApplicable < applicable.length; indexApplicable++) {
		const name = applicable[indexApplicable];
		if (!map.has(name)) map.set(name, map.size);
	}
	if (element && doc.layerOrderCache) {
		doc.layerOrderCache.set(element, map);
	} else {
		doc.globalLayerOrder = map;
	}
	return map;
}

function matchElements(doc, selector, resolvedSelectorText) {
	try {
		const selectorText = getFilteredSelector(selector, resolvedSelectorText);
		const cachedResult = doc.matchedSelectors.get(selectorText);
		if (cachedResult !== undefined) {
			return cachedResult;
		} else {
			const matchedElements = Array.from(doc.querySelectorAll(selectorText));
			doc.matchedSelectors.set(selectorText, matchedElements);
			return matchedElements;
		}
		// eslint-disable-next-line no-unused-vars
	} catch (_error) {
		return [];
	}
}

function getFilteredSelector(selector, selectorText) {
	const removedSelectors = [];
	let namespaceFound = false;
	selector = { data: cssTree.parse(cssTree.generate(selector.data), { context: "selector" }) };
	filterNamespace(selector);
	if (namespaceFound) {
		selectorText = cssTree.generate(selector.data);
	}
	filterPseudoClasses(selector);
	if (removedSelectors.length) {
		removedSelectors.forEach(({ parentSelector, selector }) => {
			if (parentSelector.data.children.size === 0 || !selector.prev || selector.prev.data.type === "Combinator" || selector.prev.data.type === "WhiteSpace") {
				parentSelector.data.children.replace(selector, cssTree.parse("*", { context: "selector" }).children.head);
			} else {
				parentSelector.data.children.remove(selector);
			}
		});
		selectorText = cssTree.generate(selector.data);
	}
	return selectorText;

	function filterPseudoClasses(selector, parentSelector) {
		if (selector.data.children) {
			for (let childSelector = selector.data.children.head; childSelector; childSelector = childSelector.next) {
				filterPseudoClasses(childSelector, selector);
			}
		}
		if ((selector.data.type === "PseudoClassSelector" && UNMATCHABLE_PSEUDO_CLASSES.includes(selector.data.name)) ||
			(selector.data.type === "PseudoElementSelector" && testVendorPseudo(selector))) {
			removedSelectors.push({ parentSelector, selector });
		}
	}

	function filterNamespace(selector) {
		if (selector.data.children) {
			for (let childSelector = selector.data.children.head; childSelector; childSelector = childSelector.next) {
				filterNamespace(childSelector);
			}
		}
		if (selector.data.type === "TypeSelector" && selector.data.name.includes("|")) {
			namespaceFound = true;
			selector.data.name = selector.data.name.substring(selector.data.name.lastIndexOf("|") + 1);
		}
	}

	function testVendorPseudo(selector) {
		const name = selector.data.name;
		return name.startsWith("-") || name.startsWith("\\-");
	}
}

function fixRawRules(ruleData) {
	const ruleChildren = [];
	if (ruleData.block && ruleData.block.children) {
		for (let cssRule = ruleData.block.children.head; cssRule; cssRule = cssRule.next) {
			if (cssRule.data.type === "Raw") {
				try {
					if (cssRule.data.value.indexOf("{") !== -1 && cssRule.data.value.indexOf("{") < cssRule.data.value.indexOf("}")) {
						const stylesheet = cssTree.parse(cssRule.data.value, { context: "stylesheet" });
						for (let stylesheetChild = stylesheet.children.head; stylesheetChild; stylesheetChild = stylesheetChild.next) {
							ruleChildren.push(stylesheetChild);
						}
					} else {
						ruleChildren.push(cssRule);
					}
					// eslint-disable-next-line no-unused-vars
				} catch (_error) {
					ruleChildren.push(cssRule);
				}
			} else {
				ruleChildren.push(cssRule);
			}
		}
	}
	ruleData.block.children.clear();
	ruleChildren.forEach(ruleChild => ruleData.block.children.appendData(ruleChild.data));
}

function cleanDeclarations(ruleData) {
	const propertyMap = new Map();
	const removedDeclarations = [];
	for (let ruleChild = ruleData.children.head; ruleChild; ruleChild = ruleChild.next) {
		if (ruleChild.data.type === "Declaration") {
			const prop = ruleChild.data.property;
			if (propertyMap.has(prop)) {
				removedDeclarations.push(propertyMap.get(prop));
			}
			propertyMap.set(prop, ruleChild);
		}
	}
	removedDeclarations.forEach(declaration => ruleData.children.remove(declaration));
}

function combineWithAncestors(selector, ancestorsSelectors) {
	const selectorText = cssTree.generate(selector);
	if (!ancestorsSelectors || !ancestorsSelectors.length) {
		return selectorText;
	}
	let contexts = [""];
	ancestorsSelectors.forEach(selectorList => {
		if (!selectorList || !selectorList.children || !selectorList.children.size) {
			return;
		}
		const parentSelectors = selectorList.children.toArray();
		const nextContexts = [];
		contexts.forEach(context => {
			parentSelectors.forEach(parentSelector => {
				const parentText = cssTree.generate(parentSelector);
				const combined = context ? combineSelectors(context, parentText) : parentText;
				if (!nextContexts.includes(combined)) {
					nextContexts.push(combined);
				}
			});
		});
		if (nextContexts.length) {
			contexts = nextContexts;
		}
	});
	const expandedSelectors = new Set();
	contexts.forEach(context => {
		const result = context ? combineSelectors(context, selectorText) : selectorText;
		expandedSelectors.add(result);
	});
	return Array.from(expandedSelectors).join(",");
}

function combineSelectors(parentSelectorText, childSelectorText) {
	const childAST = cssTree.parse(childSelectorText || "&", { context: "selector" });
	const parentAST = parentSelectorText ? cssTree.parse(parentSelectorText, { context: "selector" }) : null;
	let hasNesting = false;
	cssTree.walk(childAST, {
		visit: "NestingSelector",
		enter(_node, item, list) {
			hasNesting = true;
			if (!parentAST) {
				list.remove(item);
				return;
			}
			const nodes = parentAST.children.toArray().map(parentNode => cssTree.clone(parentNode));
			nodes.forEach(node => list.insertData(node, item));
			list.remove(item);
		}
	});
	if (hasNesting) {
		return cssTree.generate(childAST);
	}
	if (!parentAST) {
		return cssTree.generate(childAST);
	}
	const combinedAST = cssTree.parse(`${parentSelectorText} ${childSelectorText}`, { context: "selector" });
	return cssTree.generate(combinedAST);
}