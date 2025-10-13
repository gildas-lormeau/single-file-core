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

const PSEUDO_ELEMENT_NAMES = ["after", "before", "first-letter", "first-line", "placeholder", "selection", "part", "marker", "grammar-error", "spelling-error", "cue", "cue-region", "backdrop", "column", "scroll-marker", "scroll-marker-group", "details-content", "checkmark", "file-selector-button", "picker-icon", "target-text"];

const DYNAMIC_STATE_PSEUDO_CLASSES = ["hover", "focus", "active", "focus-within", "focus-visible", "target", "visited", "link", "target-current"];

const UNMATCHABLE_PSEUDO_CLASSES = [
	"user-invalid",
	"current", "past", "future",
	"playing", "paused", "seeking", "buffering", "stalled", "muted", "volume-locked"
];

const CONDITIONAL_AT_RULE_NAMES = ["media", "supports", "container"];

export {
	process
};

function process(doc, stylesheets) {
	const docContext = {
		doc,
		stats: { processed: 0, discarded: 0 },
		matchedElements: new Set(),
		matchedSelectors: new Map(),
		matchingSelectors: new Map(),
		layerDeclarationCounter: 0,
		layerDeclarations: [],
		layerOrder: new Map(),
		selectorData: new Map(),
		selectorTexts: new Map(),
		rulesSourceCounter: 0,
	};
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			const cssRules = stylesheetInfo.stylesheet.children;
			if (cssRules) {
				collectLayerOrder(cssRules, { layerStack: [], conditionalStack: [] }, docContext);
			}
		}
	});
	buildEffectiveLayerOrder(docContext);
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			const cssRules = stylesheetInfo.stylesheet.children;
			if (cssRules) {
				processStylesheetRules(cssRules, stylesheets, { ancestorsSelectors: [], layerStack: [], conditionalStack: [] }, docContext);
			}
		}
	});
	computeCascade(docContext);
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			const cssRules = stylesheetInfo.stylesheet.children;
			if (cssRules) {
				cleanEmptyRules(cssRules, docContext);
			}
		}
	});
	return docContext.stats;
}

function collectLayerOrder(cssRules, layerContext, docContext) {
	const { layerStack, conditionalStack } = layerContext;
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type === "Atrule" && ruleData.name === "layer") {
			if (ruleData.block) {
				const layerName = ruleData.prelude ? cssTree.generate(ruleData.prelude) : "";
				const fullLayerName = [...layerStack, layerName].filter(l => l !== "").join(".");
				if (fullLayerName) {
					docContext.layerDeclarations.push({
						name: fullLayerName,
						order: docContext.layerDeclarationCounter++,
						conditionalContext: conditionalStack.slice()
					});
				}
				collectLayerOrder(ruleData.block.children, { layerStack: [...layerStack, layerName], conditionalStack }, docContext);
			} else if (ruleData.prelude) {
				const layerNames = cssTree.generate(ruleData.prelude).split(",");
				layerNames.forEach(layerName => {
					const fullLayerName = [...layerStack, layerName].filter(l => l !== "").join(".");
					if (fullLayerName) {
						docContext.layerDeclarations.push({
							name: fullLayerName,
							order: docContext.layerDeclarationCounter++,
							conditionalContext: conditionalStack.slice()
						});
					}
				});
			}
		} else if (ruleData.type === "Atrule" && ruleData.block && ruleData.block.children) {
			const isConditional = CONDITIONAL_AT_RULE_NAMES.includes(ruleData.name);
			const newConditionalStack = isConditional
				? [...conditionalStack, { name: ruleData.name, prelude: cssTree.generate(ruleData.prelude) }]
				: conditionalStack;
			collectLayerOrder(ruleData.block.children, { layerStack, conditionalStack: newConditionalStack }, docContext);
		} else if (ruleData.type === "Rule" && ruleData.block && ruleData.block.children) {
			collectLayerOrder(ruleData.block.children, layerContext, docContext);
		}
	}
}

function processStylesheetRules(cssRules, stylesheets, processingContext, docContext) {
	const { ancestorsSelectors, layerStack, conditionalStack } = processingContext;
	const removedRules = new Set();
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		docContext.stats.processed++;
		const ruleData = cssRule.data;
		if (ruleData.type === "Atrule" && ruleData.name === "import" && ruleData.prelude && ruleData.prelude.children && ruleData.prelude.children.head.data.importedChildren) {
			processStylesheetRules(ruleData.prelude.children.head.data.importedChildren, stylesheets, processingContext, docContext);
		} else if (ruleData.type === "Atrule" && ruleData.name === "layer" && ruleData.block) {
			const layerName = ruleData.prelude ? cssTree.generate(ruleData.prelude) : "";
			const newProcessingContext = { ...processingContext, layerStack: [...processingContext.layerStack, layerName] };
			fixRawRules(ruleData);
			processStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
			if (ruleData.block.children.size === 0) {
				docContext.stats.discarded++;
				removedRules.add(cssRule);
			}
		} else if (ruleData.type === "Atrule" && ruleData.name === "layer" && !ruleData.block) {
			docContext.stats.discarded++;
			removedRules.add(cssRule);
		} else if (ruleData.type === "Atrule" && ruleData.block && ruleData.name != "font-face" && ruleData.name != "keyframes") {
			const isConditional = ["media", "supports", "container"].includes(ruleData.name);
			const newConditionalStack = isConditional
				? [...conditionalStack, { name: ruleData.name, prelude: cssTree.generate(ruleData.prelude) }]
				: conditionalStack;
			const newProcessingContext = { ...processingContext, conditionalStack: newConditionalStack };
			fixRawRules(ruleData);
			processStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
			if (ruleData.block.children.size === 0) {
				docContext.stats.discarded++;
				removedRules.add(cssRule);
			}
		} else if (ruleData.type === "Rule" && ruleData.prelude.children) {
			ruleData.sourceOrder = docContext.rulesSourceCounter++;
			const selectorsText = ruleData.prelude.children.toArray().map(selector => getSelectorText(selector, docContext));
			const removedSelectors = [];
			for (let selector = ruleData.prelude.children.head, selectorIndex = 0; selector; selector = selector.next, selectorIndex++) {
				let resolvedSelectorText = selectorsText[selectorIndex];
				if (ancestorsSelectors.length) {
					resolvedSelectorText = combineWithAncestors(selector.data, ancestorsSelectors, docContext);
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
				docContext.selectorData.set(selector, {
					specificity: maxSpecificity,
					sourceOrder: ruleData.sourceOrder,
					rule: ruleData,
					layers: layerStack,
					conditionalContext: conditionalStack,
					hasPseudoElement: hasPseudoElement(selector.data),
					hasDynamicState: hasDynamicStatePseudoClass(selector.data)
				});
				if (!docContext.selectorData.get(selector).hasPseudoElement && !docContext.selectorData.get(selector).hasDynamicState) {
					const matchedElements = matchElements(selector, resolvedSelectorText, docContext);
					if (!matchedElements || matchedElements.length === 0) {
						removedSelectors.push(selector);
					} else {
						matchedElements.forEach(element => {
							docContext.matchedElements.add(element);
							let matchingSelectors = docContext.matchingSelectors.get(element);
							if (!matchingSelectors) {
								matchingSelectors = [];
								docContext.matchingSelectors.set(element, matchingSelectors);
								element.matchingSelectors = matchingSelectors;
							}
							matchingSelectors.push(selector);
						});
					}
				}
			}
			removedSelectors.forEach(selector => ruleData.prelude.children.remove(selector));
			if (ruleData.prelude.children.size === 0) {
				docContext.stats.discarded++;
				removedRules.add(cssRule);
			} else if (ruleData.block && ruleData.block.children) {
				fixRawRules(ruleData);
				cleanDeclarations(ruleData.block);
				const newProcessingContext = { ...processingContext, ancestorsSelectors: [...processingContext.ancestorsSelectors, ruleData.prelude] };
				processStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
			}
		}
	}
	removedRules.forEach(rule => cssRules.remove(rule));
}

function getSelectorText(selectorAST, docContext) {
	if (!docContext.selectorTexts.has(selectorAST)) {
		docContext.selectorTexts.set(selectorAST, cssTree.generate(selectorAST));
	}
	return docContext.selectorTexts.get(selectorAST);
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

function computeCascade(docContext) {
	const winningDeclarations = new Set();
	docContext.matchedElements.forEach(element => computeElementCascadedStyles(element, winningDeclarations, docContext));
	removeLosingDeclarations(winningDeclarations, docContext);
}

function computeElementCascadedStyles(element, winningDeclarations, docContext) {
	const cascadedStyles = new Map();
	const matchingSelectors = docContext.matchingSelectors.get(element);
	const allDeclarations = [];
	matchingSelectors.forEach(selector => {
		const rule = docContext.selectorData.get(selector).rule;
		const declarations = rule.block && rule.block.children;
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
		const conditionalContext = docContext.selectorData.get(item.selector).conditionalContext;
		const contextKey = getContextKey(conditionalContext);
		if (!contextGroups.has(contextKey)) {
			contextGroups.set(contextKey, []);
		}
		contextGroups.get(contextKey).push(item);
	});
	contextGroups.forEach(declarations => {
		declarations.sort((declarationA, declarationB) => compareDeclarations(declarationA, declarationB, element, docContext));
		declarations.forEach(item => {
			const conditionalContext = docContext.selectorData.get(item.selector).conditionalContext;
			cascadedStyles.set(item.property + ":" + getContextKey(conditionalContext), {
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

function removeLosingDeclarations(winningDeclarations, docContext) {
	const allDeclarationNodes = new Map();
	docContext.matchedElements.forEach(element => {
		const matchingSelectors = docContext.matchingSelectors.get(element);
		if (matchingSelectors) {
			matchingSelectors.forEach(selector => {
				const rule = docContext.selectorData.get(selector).rule;
				const declarations = rule.block && rule.block.children;
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

function cleanEmptyRules(cssRules, docContext) {
	const removedRules = new Set();
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type === "Rule") {
			if (!ruleData.block || !ruleData.block.children || ruleData.block.children.size === 0) {
				docContext.stats.discarded++;
				removedRules.add(cssRule);
			} else {
				cleanEmptyRules(ruleData.block.children, docContext);
			}
		} else if (ruleData.type === "Atrule" && ruleData.block && ruleData.name !== "font-face" && ruleData.name !== "keyframes") {
			cleanEmptyRules(ruleData.block.children, docContext);
			if (ruleData.block.children.size === 0) {
				docContext.stats.discarded++;
				removedRules.add(cssRule);
			}
		}
	}
	removedRules.forEach(rule => cssRules.remove(rule));
}

function compareDeclarations(declarationA, declarationB, element, docContext) {
	const importantA = declarationA.important ? 1 : 0;
	const importantB = declarationB.important ? 1 : 0;
	if (importantA !== importantB) {
		return importantA - importantB;
	}
	const selectorDataA = docContext.selectorData.get(declarationA.selector);
	const selectorDataB = docContext.selectorData.get(declarationB.selector);
	const layerComparison = compareLayers(selectorDataA.layers, selectorDataB.layers, element, docContext);
	if (layerComparison !== 0) {
		return importantA ? -layerComparison : layerComparison;
	}
	if (selectorDataA.specificity.a !== selectorDataB.specificity.a) {
		return selectorDataA.specificity.a - selectorDataB.specificity.a;
	}
	if (selectorDataA.specificity.b !== selectorDataB.specificity.b) {
		return selectorDataA.specificity.b - selectorDataB.specificity.b;
	}
	if (selectorDataA.specificity.c !== selectorDataB.specificity.c) {
		return selectorDataA.specificity.c - selectorDataB.specificity.c;
	}
	if (selectorDataA.sourceOrder !== selectorDataB.sourceOrder) {
		return selectorDataA.sourceOrder - selectorDataB.sourceOrder;
	}
	return 0;
}

function compareLayers(layersA, layersB, element, docContext) {
	const isUnlayeredA = !layersA || layersA.length === 0 || layersA.every(layerName => layerName === "");
	const isUnlayeredB = !layersB || layersB.length === 0 || layersB.every(layerName => layerName === "");
	if (isUnlayeredA && isUnlayeredB) {
		return 0;
	}
	if (isUnlayeredA) {
		return 1;
	}
	if (isUnlayeredB) {
		return -1;
	}
	const fullLayerNameA = getFullLayerName(layersA);
	const fullLayerNameB = getFullLayerName(layersB);
	if (fullLayerNameA === fullLayerNameB) {
		return 0;
	}
	const minLength = Math.min(layersA.length, layersB.length);
	const effectiveMap = docContext.layerOrder;
	for (let indexLayer = 0; indexLayer < minLength; indexLayer++) {
		if (layersA[indexLayer] !== layersB[indexLayer]) {
			const partialLayerA = getFullLayerName(layersA.slice(0, indexLayer + 1));
			const partialLayerB = getFullLayerName(layersB.slice(0, indexLayer + 1));
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

function getFullLayerName(layers) {
	return layers.filter(layerName => layerName !== "").join(".");
}

function buildEffectiveLayerOrder(docContext) {
	const applicable = [];
	for (let indexDeclaration = 0; indexDeclaration < docContext.layerDeclarations.length; indexDeclaration++) {
		const declaration = docContext.layerDeclarations[indexDeclaration];
		applicable.push(declaration.name);
	}
	for (let indexApplicable = 0; indexApplicable < applicable.length; indexApplicable++) {
		const name = applicable[indexApplicable];
		if (!docContext.layerOrder.has(name)) docContext.layerOrder.set(name, docContext.layerOrder.size);
	}
}

function matchElements(selector, resolvedSelectorText, docContext) {
	try {
		const selectorText = getFilteredSelector(selector, resolvedSelectorText, docContext);
		const cachedResult = docContext.matchedSelectors.get(selectorText);
		if (cachedResult !== undefined) {
			return cachedResult;
		} else {
			const matchedElements = Array.from(docContext.doc.querySelectorAll(selectorText));
			docContext.matchedSelectors.set(selectorText, matchedElements);
			return matchedElements;
		}
		// eslint-disable-next-line no-unused-vars
	} catch (_error) {
		return [];
	}
}

function getFilteredSelector(selector, selectorText, docContext) {
	const removedSelectors = [];
	let namespaceFound = false;
	selector = { data: cssTree.parse(getSelectorText(selector.data, docContext), { context: "selector" }) };
	filterNamespace(selector);
	if (namespaceFound) {
		selectorText = getSelectorText(selector.data, docContext);
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
			const isImportant = ruleChild.data.important;
			if (propertyMap.has(prop)) {
				const existing = propertyMap.get(prop);
				if (existing.isImportant === isImportant) {
					removedDeclarations.push(existing.node);
					propertyMap.set(prop, { node: ruleChild, isImportant });
				} else if (isImportant && !existing.isImportant) {
					removedDeclarations.push(existing.node);
					propertyMap.set(prop, { node: ruleChild, isImportant });
				} else {
					removedDeclarations.push(ruleChild);
				}
			} else {
				propertyMap.set(prop, { node: ruleChild, isImportant });
			}
		}
	}
	removedDeclarations.forEach(declaration => ruleData.children.remove(declaration));
}

function combineWithAncestors(selector, ancestorsSelectors, docContext) {
	const selectorText = getSelectorText(selector, docContext);
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
				const parentText = getSelectorText(parentSelector, docContext);
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