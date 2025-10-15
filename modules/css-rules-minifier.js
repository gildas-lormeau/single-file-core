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
import { computeMaxSpecificity } from "./css-specificity.js";
import { parsePrelude } from "./css-scope-prelude-parser.js";
import { sanitizeSelector } from "./css-selector-sanitizer.js";

const DEBUG = false;

const PSEUDO_ELEMENT_NAMES = ["after", "before", "first-letter", "first-line", "placeholder", "selection", "part", "marker", "grammar-error", "spelling-error", "cue", "cue-region", "backdrop", "column", "scroll-marker", "scroll-marker-group", "details-content", "checkmark", "file-selector-button", "picker-icon", "target-text"];

const DYNAMIC_STATE_PSEUDO_CLASSES = ["hover", "focus", "active", "focus-within", "focus-visible", "target", "visited", "link", "target-current"];

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
		scopeRoots: new Map(),
		scopeSpecificities: new Map(),
		rulesCounter: 0,
	};
	collectLayerOrder(stylesheets, docContext);
	buildEffectiveLayerOrder(docContext);
	minifyRules(stylesheets, docContext);
	computeCascade(docContext);
	cleanEmptyRules(stylesheets, docContext);
	return docContext.stats;
}

function collectLayerOrder(stylesheets, docContext) {
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			const cssRules = stylesheetInfo.stylesheet.children;
			if (cssRules) {
				collectStylesheetLayerOrder(cssRules, { layerStack: [], conditionalStack: [] }, docContext);
			}
		}
	});
}

function computeCascade(docContext) {
	const winningDeclarations = new Set();
	docContext.matchedElements.forEach(element => computeCascadedStylesForElement(element, winningDeclarations, docContext));
	removeLosingDeclarations(winningDeclarations, docContext);
}

function minifyRules(stylesheets, docContext) {
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			const cssRules = stylesheetInfo.stylesheet.children;
			if (cssRules) {
				minifyStylesheetRules(cssRules, stylesheets, { ancestorsSelectors: [], layerStack: [], conditionalStack: [] }, docContext);
			}
		}
	});
}

function cleanEmptyRules(stylesheets, docContext) {
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			const cssRules = stylesheetInfo.stylesheet.children;
			if (cssRules) {
				cleanStylesheetEmptyRules(cssRules, docContext);
			}
		}
	});
}

function collectStylesheetLayerOrder(cssRules, layerContext, docContext) {
	const { layerStack, conditionalStack } = layerContext;
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type === "Atrule" && ruleData.name === "layer") {
			collectStylesheetLayerRule(ruleData, layerStack, conditionalStack, docContext);
		} else if (ruleData.type === "Atrule" && ruleData.block && ruleData.block.children) {
			const newConditionalStack = buildConditionalStack(conditionalStack, ruleData);
			collectStylesheetLayerOrder(ruleData.block.children, { layerStack, conditionalStack: newConditionalStack }, docContext);
		} else if (ruleData.type === "Rule" && ruleData.block && ruleData.block.children) {
			collectStylesheetLayerOrder(ruleData.block.children, layerContext, docContext);
		}
	}
}

function collectStylesheetLayerRule(ruleData, layerStack, conditionalStack, docContext) {
	if (ruleData.block) {
		const layerName = ruleData.prelude ? cssTree.generate(ruleData.prelude) : "";
		registerLayerDeclaration(layerStack, layerName, conditionalStack, docContext);
		collectStylesheetLayerOrder(ruleData.block.children, { layerStack: [...layerStack, layerName], conditionalStack }, docContext);
	} else if (ruleData.prelude) {
		const layerNames = cssTree.generate(ruleData.prelude).split(",");
		layerNames.forEach(layerName => registerLayerDeclaration(layerStack, layerName, conditionalStack, docContext));
	}
}

function minifyStylesheetRules(cssRules, stylesheets, processingContext, docContext) {
	const removedRules = new Set();
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		docContext.stats.processed++;
		const ruleData = cssRule.data;
		if (ruleData.type === "Atrule" && ruleData.name === "import" && ruleData.prelude && ruleData.prelude.children && ruleData.prelude.children.head.data.importedChildren) {
			minifyStylesheetRules(ruleData.prelude.children.head.data.importedChildren, stylesheets, processingContext, docContext);
		} else if (ruleData.type === "Atrule" && ruleData.name === "layer" && ruleData.block) {
			minifyLayerRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
		} else if (ruleData.type === "Atrule" && ruleData.name === "scope" && ruleData.block) {
			minifyScopeRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
		} else if (ruleData.type === "Atrule" && ruleData.block && ruleData.name !== "font-face" && ruleData.name !== "keyframes" && !ruleData.name.startsWith("-")) {
			minifyAtRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
		} else if (ruleData.type === "Rule" && ruleData.prelude.children) {
			minifyStylesheetRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
		}
	}
	removedRules.forEach(cssRule => cssRules.remove(cssRule));
}

function minifyLayerRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	const layerName = ruleData.prelude ? cssTree.generate(ruleData.prelude) : "";
	const newProcessingContext = { ...processingContext, layerStack: [...processingContext.layerStack, layerName] };
	expandRawRules(ruleData);
	minifyStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
	if (ruleData.block.children.size === 0) {
		docContext.stats.discarded++;
		removedRules.add(cssRule);
	}
}

function minifyScopeRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	const parsedPrelude = parsePrelude(ruleData.prelude);
	const includeLists = parsedPrelude.include.map(item => item.text);
	const excludeLists = parsedPrelude.exclude.map(item => item.text);
	const newConditionalStack = buildConditionalStack(processingContext.conditionalStack, ruleData);
	const newProcessingContext = {
		...processingContext,
		conditionalStack: newConditionalStack,
		scopeIncludeLists: [...(processingContext.scopeIncludeLists || []), includeLists],
		scopeExclusionLists: [...(processingContext.scopeExclusionLists || []), excludeLists],
		scopeNestingLevel: (processingContext.scopeNestingLevel || 0) + 1
	};
	expandRawRules(ruleData);
	minifyStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
	if (ruleData.block.children.size === 0) {
		docContext.stats.discarded++;
		removedRules.add(cssRule);
	}
}

function minifyAtRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	const newConditionalStack = buildConditionalStack(processingContext.conditionalStack, ruleData);
	const newProcessingContext = { ...processingContext, conditionalStack: newConditionalStack };
	expandRawRules(ruleData);
	minifyStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
	if (ruleData.block.children.size === 0) {
		docContext.stats.discarded++;
		removedRules.add(cssRule);
	}
}

function minifyStylesheetRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	ruleData.order = docContext.rulesCounter++;
	const removedSelectors = processSelectors(ruleData, processingContext, docContext);
	const wasDiscarded = removeUnmatchedSelectors(ruleData, removedSelectors, removedRules, cssRule, docContext);
	if (!wasDiscarded && ruleData.block && ruleData.block.children) {
		processNestedRules(ruleData, stylesheets, processingContext, docContext);
	}
}

function registerLayerDeclaration(layerStack, layerName, conditionalStack, docContext) {
	const fullLayerName = getFullLayerName([...layerStack, layerName]);
	if (fullLayerName) {
		docContext.layerDeclarations.push({
			name: fullLayerName,
			order: docContext.layerDeclarationCounter++,
			conditionalContext: conditionalStack.slice()
		});
	}
}

function processSelectors(ruleData, processingContext, docContext) {
	const removedSelectors = [];
	const {
		ancestorsSelectors,
		layerStack,
		conditionalStack,
		scopeIncludeLists,
		scopeExclusionLists,
		scopeNestingLevel
	} = processingContext;
	for (let selector = ruleData.prelude.children.head, selectorIndex = 0; selector; selector = selector.next, selectorIndex++) {
		const startsWithCombinator = selectorStartsWithCombinator(selector.data);
		docContext.selectorData.set(selector, {
			specificity: computeMaxSpecificity(selector.data, ancestorsSelectors),
			order: ruleData.order,
			rule: ruleData,
			layers: layerStack,
			conditionalContext: conditionalStack,
			hasPseudoElement: hasPseudoElement(selector.data),
			hasDynamicState: hasDynamicStatePseudoClass(selector.data),
			scopeIncludeLists,
			scopeExclusionLists,
			scopeNestingLevel,
			scopeRelative: !startsWithCombinator && !selectorContainsNestingOrScope(selector.data)
		});
		const selectorData = docContext.selectorData.get(selector);
		if (!selectorData.hasPseudoElement &&
			!selectorData.hasDynamicState &&
			(!startsWithCombinator || !ancestorsSelectors || !ancestorsSelectors.length)) {
			const matchedElements = matchElements(selector, docContext, ancestorsSelectors);
			if (matchedElements.length) {
				updateMatchingSelectors(matchedElements, selector, docContext);
			} else {
				removedSelectors.push(selector);
			}
		}
	}
	return removedSelectors;
}

function selectorStartsWithCombinator(selector) {
	if (!hasChildren(selector)) return false;
	const firstChild = selector.children.head.data;
	return firstChild && firstChild.type === "Combinator";
}

function selectorContainsNestingOrScope(selector) {
	let found = false;
	cssTree.walk(selector, {
		enter(node) {
			if (node.type === "NestingSelector") found = true;
			if (node.type === "PseudoClassSelector" && node.name === "scope") found = true;
		}
	});
	return found;
}

function updateMatchingSelectors(matchedElements, selector, docContext) {
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

function removeUnmatchedSelectors(ruleData, removedSelectors, removedRules, cssRule, docContext) {
	if (removedSelectors && removedSelectors.length) {
		removedSelectors.forEach(selector => ruleData.prelude.children.remove(selector));
	}
	if (ruleData.prelude.children.size === 0) {
		docContext.stats.discarded++;
		removedRules.add(cssRule);
		return true;
	}
	return false;
}

function processNestedRules(ruleData, stylesheets, processingContext, docContext) {
	expandRawRules(ruleData);
	cleanDeclarations(ruleData.block);
	const newProcessingContext = { ...processingContext, ancestorsSelectors: [...processingContext.ancestorsSelectors, ruleData.prelude] };
	minifyStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
}

function buildConditionalStack(conditionalStack, ruleData) {
	const isConditional = CONDITIONAL_AT_RULE_NAMES.includes(ruleData.name);
	return isConditional
		? [...conditionalStack, { name: ruleData.name, prelude: cssTree.generate(ruleData.prelude) }]
		: conditionalStack;
}

function getSelectorText(selector, docContext) {
	if (!docContext.selectorTexts.has(selector)) {
		docContext.selectorTexts.set(selector, cssTree.generate(selector));
	}
	return docContext.selectorTexts.get(selector);
}

function hasPseudoElement(selectorNode) {
	let found = false;
	cssTree.walk(selectorNode, {
		enter(node) {
			if (node.type === "PseudoElementSelector") {
				found = true;
				return this.break;
			}
			if (node.type === "PseudoClassSelector" && PSEUDO_ELEMENT_NAMES.includes(node.name)) {
				found = true;
				return this.break;
			}
		}
	});
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

function computeCascadedStylesForElement(element, winningDeclarations, docContext) {
	const cascadedStyles = new Map();
	const allDeclarations = collectDeclarationItemsForElement(element, docContext);
	const contextGroups = new Map();
	allDeclarations.forEach(item => {
		const conditionalContext = docContext.selectorData.get(item.selector).conditionalContext;
		const contextKey = createContextKey(conditionalContext);
		if (!contextGroups.has(contextKey)) {
			contextGroups.set(contextKey, []);
		}
		contextGroups.get(contextKey).push(item);
	});
	contextGroups.forEach(declarations => {
		declarations.sort((declarationA, declarationB) => compareDeclarations(declarationA, declarationB, docContext));
		declarations.forEach(item => {
			const conditionalContext = docContext.selectorData.get(item.selector).conditionalContext;
			cascadedStyles.set(item.property + ":" + createContextKey(conditionalContext), {
				declaration: item.declaration,
				selector: item.selector,
				declarationNode: item.declarationNode,
				property: item.property
			});
		});
	});
	cascadedStyles.forEach(({ declarationNode }) => winningDeclarations.add(declarationNode));
}

function collectDeclarationItemsForElement(element, docContext) {
	const matchingSelectors = docContext.matchingSelectors.get(element) || [];
	const allDeclarations = [];
	matchingSelectors.forEach(selector => {
		const cssRule = docContext.selectorData.get(selector).rule;
		const declarations = cssRule.block && cssRule.block.children;
		if (declarations) {
			for (let declaration = declarations.head; declaration; declaration = declaration.next) {
				if (declaration.data.type === "Declaration") {
					const declarationData = createDeclarationItem(declaration, selector, element, docContext);
					allDeclarations.push(declarationData);
				}
			}
		}
	});
	return allDeclarations;
}

function createContextKey(conditionalContext) {
	if (!conditionalContext || conditionalContext.length === 0) {
		return "";
	}
	return conditionalContext.map(context => `${context.name}:${context.prelude}`).join("|");
}

function removeLosingDeclarations(winningDeclarations, docContext) {
	const allDeclarationNodes = new Map();
	const protectedDeclarations = new Set();
	docContext.matchedElements.forEach(element => {
		const matchingSelectors = docContext.matchingSelectors.get(element);
		if (matchingSelectors) {
			matchingSelectors.forEach(selector => {
				const cssRule = docContext.selectorData.get(selector).rule;
				const declarations = cssRule.block && cssRule.block.children;
				if (declarations) {
					for (let declaration = declarations.head; declaration; declaration = declaration.next) {
						if (declaration.data.type === "Declaration") {
							allDeclarationNodes.set(declaration, declarations);
							if (declaration.data.property && declaration.data.property.startsWith("--")) {
								protectedDeclarations.add(declaration);
							}
						}
					}
				}
			});
		}
	});
	allDeclarationNodes.forEach((list, node) => {
		if (!winningDeclarations.has(node) && !protectedDeclarations.has(node)) {
			list.remove(node);
		}
	});
}

function cleanStylesheetEmptyRules(cssRules, docContext) {
	const removedRules = new Set();
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type === "Rule") {
			if (!ruleData.block || !ruleData.block.children || ruleData.block.children.size === 0) {
				docContext.stats.discarded++;
				removedRules.add(cssRule);
			} else {
				cleanStylesheetEmptyRules(ruleData.block.children, docContext);
			}
		} else if (ruleData.type === "Atrule" && ruleData.block && ruleData.name !== "font-face" && ruleData.name !== "keyframes") {
			cleanStylesheetEmptyRules(ruleData.block.children, docContext);
			if (ruleData.block.children.size === 0) {
				docContext.stats.discarded++;
				removedRules.add(cssRule);
			}
		}
	}
	removedRules.forEach(cssRule => cssRules.remove(cssRule));
}

function compareDeclarations(declarationA, declarationB, docContext) {
	const importantA = declarationA.important ? 1 : 0;
	const importantB = declarationB.important ? 1 : 0;
	if (importantA !== importantB) {
		return importantA - importantB;
	}
	const selectorDataA = docContext.selectorData.get(declarationA.selector);
	const selectorDataB = docContext.selectorData.get(declarationB.selector);
	const layerComparison = compareLayers(selectorDataA.layers, selectorDataB.layers, docContext);
	if (layerComparison !== 0) {
		return importantA ? -layerComparison : layerComparison;
	}
	const specificityA = declarationA.effectiveSpecificity || selectorDataA.specificity;
	const specificityB = declarationB.effectiveSpecificity || selectorDataB.specificity;
	if (specificityA.a !== specificityB.a) {
		return specificityA.a - specificityB.a;
	}
	if (specificityA.b !== specificityB.b) {
		return specificityA.b - specificityB.b;
	}
	if (specificityA.c !== specificityB.c) {
		return specificityA.c - specificityB.c;
	}
	if (selectorDataA.order !== selectorDataB.order) {
		return selectorDataA.order - selectorDataB.order;
	}
	return 0;
}

function compareLayers(layersA, layersB, docContext) {
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

function buildEffectiveLayerOrder(docContext) {
	const layerNames = [];
	for (let indexDeclaration = 0; indexDeclaration < docContext.layerDeclarations.length; indexDeclaration++) {
		const declaration = docContext.layerDeclarations[indexDeclaration];
		layerNames.push(declaration.name);
	}
	for (let indexLayerName = 0; indexLayerName < layerNames.length; indexLayerName++) {
		const name = layerNames[indexLayerName];
		if (!docContext.layerOrder.has(name)) {
			docContext.layerOrder.set(name, docContext.layerOrder.size);
		}
	}
}

function matchElements(selector, docContext, ancestorsSelectors) {
	let selectorText;
	if (ancestorsSelectors && ancestorsSelectors.length) {
		selectorText = combineWithAncestors(selector.data, ancestorsSelectors, docContext);
		const combinedAst = parseCss(selectorText, "selectorList");
		selectorText = sanitizeSelector({ data: combinedAst }, docContext, ancestorsSelectors);
	}
	if (!selectorText) {
		selectorText = sanitizeSelector(selector, docContext, ancestorsSelectors);
	}
	const selectorData = docContext.selectorData.get(selector);
	const hasScope = selectorData && ((selectorData.scopeIncludeLists && selectorData.scopeIncludeLists.length) || selectorData.scopeNestingLevel > 0);
	const cacheKey = createMatchCacheKey(hasScope, selectorData, selectorText);
	const cached = docContext.matchedSelectors.get(cacheKey);
	if (cached) {
		return cached;
	} else {
		if (hasScope) {
			return collectScopedMatches(cacheKey, selector, docContext);
		} else {
			try {
				const nodes = Array.from(docContext.doc.querySelectorAll(selectorText));
				docContext.matchedSelectors.set(cacheKey, nodes);
				return nodes;
			} catch (error) {
				if (DEBUG) {
					// eslint-disable-next-line no-console
					console.warn("matchElements: querySelectorAll threw for selector:", selectorText, error);
				}
				docContext.matchedSelectors.set(cacheKey, []);
				return [];
			}
		}
	}
}

function createMatchCacheKey(hasScope, selectorData, selectorText) {
	if (hasScope) {
		const include = selectorData.scopeIncludeLists || [];
		const exclude = selectorData.scopeExclusionLists || [];
		const relative = selectorData.scopeRelative ? 1 : 0;
		const nesting = selectorData.scopeNestingLevel || 0;
		return [selectorText, JSON.stringify(include), JSON.stringify(exclude), String(relative), String(nesting)].join("|");
	} else {
		return selectorText;
	}
}

function collectScopedMatches(cacheKey, selector, docContext) {
	const selectorData = docContext.selectorData.get(selector);
	const includeLists = selectorData.scopeIncludeLists && selectorData.scopeIncludeLists.length ? selectorData.scopeIncludeLists[selectorData.scopeIncludeLists.length - 1] : [];
	const excludeLists = selectorData.scopeExclusionLists && selectorData.scopeExclusionLists.length ? selectorData.scopeExclusionLists[selectorData.scopeExclusionLists.length - 1] : [];
	const matchedSet = new Set();
	const includes = includeLists.length ? includeLists : [":root"];
	for (const includeSelector of includes) {
		const rootsForInclude = getScopeRoots(includeSelector, docContext);
		for (const rootForInclude of rootsForInclude) {
			const rootNodes = queryNodesForRoot(rootForInclude, normalizeForRoot(selector));
			if (rootNodes.length && excludeLists && excludeLists.length) {
				const excludeNodes = new Set();
				for (const excludeSelector of excludeLists) {
					const rootsForExclude = getScopeRoots(excludeSelector, docContext);
					rootsForExclude.forEach(rootForExclude => excludeNodes.add(rootForExclude));
				}
				const filteredNodes = rootNodes.filter(filteredNode =>
					!Array.from(excludeNodes).some(excludedNode => excludedNode.contains(filteredNode)));
				filteredNodes.forEach(filteredNode => matchedSet.add(filteredNode));
			} else {
				rootNodes.forEach(n => matchedSet.add(n));
			}
		}
	}
	const matchedElements = Array.from(matchedSet);
	docContext.matchedSelectors.set(cacheKey, matchedElements);
	return matchedElements;
}

function normalizeForRoot(selector) {
	const selectorData = cssTree.clone(selector.data);
	cssTree.walk(selectorData, {
		visit: "NestingSelector",
		enter(_node, item, list) {
			const scopeNode = { type: "PseudoClassSelector", name: "scope" };
			list.insertData(scopeNode, item);
			list.remove(item);
		}
	});
	for (let selectorChild = selectorData.children.head; selectorChild; selectorChild = selectorChild.next) {
		const childData = selectorChild.data;
		if (childData && childData.children && childData.children.head) {
			const headData = childData.children.head.data;
			if (headData && headData.type === "Combinator") {
				const scopeNode = { type: "PseudoClassSelector", name: "scope" };
				childData.children.insertData(scopeNode, childData.children.head);
			}
		}
	}
	return cssTree.generate(selectorData);
}

function queryNodesForRoot(root, selector) {
	try {
		const nodes = Array.from(root.querySelectorAll(selector));
		try {
			if (root.matches && root.matches(selector)) {
				if (nodes.indexOf(root) === -1) nodes.unshift(root);
			}
		} catch (error) {
			if (DEBUG) {
				// eslint-disable-next-line no-console
				console.warn("queryNodesForRoot: root.matches threw for selector:", selector, error);
			}
		}
		return nodes;
	} catch (error) {
		if (DEBUG) {
			// eslint-disable-next-line no-console
			console.warn("queryNodesForRoot: querySelectorAll threw for selector:", selector, error);
		}
		return [];
	}
}

function createDeclarationItem(declaration, selector, element, docContext) {
	const declarationNodeData = declaration && declaration.data;
	const declarationData = {
		property: declarationNodeData ? declarationNodeData.property : undefined,
		declaration: declarationNodeData,
		declarationNode: declaration,
		selector: selector,
		important: declarationNodeData ? declarationNodeData.important : false
	};
	const selectorData = docContext.selectorData.get(selector) || {};
	declarationData.effectiveSpecificity = computeEffectiveSpecificity(selectorData, element, docContext);
	return declarationData;
}

function cleanDeclarations(block) {
	const propertyMap = new Map();
	const removedDeclarations = [];
	for (let ruleChild = block.children.head; ruleChild; ruleChild = ruleChild.next) {
		if (ruleChild.data.type === "Declaration") {
			const property = ruleChild.data.property;
			const isImportant = ruleChild.data.important;
			if (propertyMap.has(property)) {
				const existing = propertyMap.get(property);
				if (existing.isImportant === isImportant) {
					removedDeclarations.push(existing.node);
					propertyMap.set(property, { node: ruleChild, isImportant });
				} else if (isImportant && !existing.isImportant) {
					removedDeclarations.push(existing.node);
					propertyMap.set(property, { node: ruleChild, isImportant });
				} else {
					removedDeclarations.push(ruleChild);
				}
			} else {
				propertyMap.set(property, { node: ruleChild, isImportant });
			}
		}
	}
	removedDeclarations.forEach(declaration => block.children.remove(declaration));
}

function expandRawRules(ruleData) {
	const ruleChildren = [];
	if (ruleData.block && ruleData.block.children) {
		for (let cssRule = ruleData.block.children.head; cssRule; cssRule = cssRule.next) {
			if (cssRule.data.type === "Raw") {
				if (cssRule.data.value.indexOf("{") !== -1 && cssRule.data.value.indexOf("{") < cssRule.data.value.indexOf("}")) {
					const stylesheet = parseCss(cssRule.data.value, "stylesheet");
					for (let stylesheetChild = stylesheet.children.head; stylesheetChild; stylesheetChild = stylesheetChild.next) {
						ruleChildren.push(stylesheetChild);
					}
				} else {
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

function combineWithAncestors(selector, ancestorsSelectors, docContext) {
	const selectorText = getSelectorText(selector, docContext);
	if (!ancestorsSelectors || !ancestorsSelectors.length) {
		return selectorText;
	}
	let contexts = [""];
	ancestorsSelectors.forEach(selectorList => {
		if (!hasChildren(selectorList)) {
			return;
		}
		const parentSelectors = selectorList.children.toArray();
		const nextContexts = [];
		contexts.forEach(context => parentSelectors.forEach(parentSelector => {
			const parentText = getSelectorText(parentSelector, docContext);
			const combined = context ? combineSelectors(context, parentText) : parentText;
			if (!nextContexts.includes(combined)) {
				nextContexts.push(combined);
			}
		}));
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
	const childSelector = parseCss(childSelectorText || "&");
	const parentSelector = parentSelectorText ? parseCss(parentSelectorText) : null;
	let hasNesting = false;
	cssTree.walk(childSelector, {
		visit: "NestingSelector",
		enter(_node, item, list) {
			hasNesting = true;
			if (!parentSelector) {
				list.remove(item);
				return;
			}
			const nodes = parentSelector.children.toArray().map(parentNode => cssTree.clone(parentNode));
			nodes.forEach(node => list.insertData(node, item));
			list.remove(item);
		}
	});
	if (hasNesting) {
		return cssTree.generate(childSelector);
	}
	if (!parentSelector) {
		return cssTree.generate(childSelector);
	}
	const combinedSelector = parseCss(`${parentSelectorText} ${childSelectorText}`);
	return cssTree.generate(combinedSelector);
}

function hasChildren(node) {
	return Boolean(node && node.children && node.children.head);
}

function computeEffectiveSpecificity(selectorData, element, docContext) {
	const baseSpecificity = selectorData.specificity;
	let effectiveSpecificity = { a: baseSpecificity.a, b: baseSpecificity.b, c: baseSpecificity.c };
	const includeLists = selectorData && selectorData.scopeIncludeLists && selectorData.scopeIncludeLists.length ? selectorData.scopeIncludeLists[selectorData.scopeIncludeLists.length - 1] : [];
	if (includeLists && includeLists.length) {
		for (const includeSelector of includeLists) {
			const roots = getScopeRoots(includeSelector, docContext);
			if (roots.some(root => root.contains(element))) {
				const includeSpecificity = getIncludeSpecificity(includeSelector, docContext);
				effectiveSpecificity = {
					a: effectiveSpecificity.a + includeSpecificity.a,
					b: effectiveSpecificity.b + includeSpecificity.b,
					c: effectiveSpecificity.c + includeSpecificity.c
				};
				break;
			}
		}
	}
	return effectiveSpecificity;
}

function getIncludeSpecificity(includeSelector, docContext) {
	let specificity = docContext.scopeSpecificities.get(includeSelector);
	if (!specificity) {
		const selector = parseCss(includeSelector);
		specificity = computeMaxSpecificity(selector, []);
		docContext.scopeSpecificities.set(includeSelector, specificity);
	}
	return specificity;
}

function getScopeRoots(selector, docContext) {
	let roots = docContext.scopeRoots.get(selector);
	if (!roots) {
		try {
			roots = Array.from(docContext.doc.querySelectorAll(selector));
		} catch {
			if (DEBUG) {
				// eslint-disable-next-line no-console
				console.warn("getScopeRoots: querySelectorAll threw for selector:", selector);
			}
			roots = [];
		}
		docContext.scopeRoots.set(selector, roots);
	}
	return roots;
}

function parseCss(text, context = "selector") {
	const options = { context };
	try {
		return cssTree.parse(text, options);
	} catch (error) {
		if (DEBUG) {
			// eslint-disable-next-line no-console
			console.warn("parseCss: cssTree.parse threw for text:", text, error);
		}
		throw error;
	}
}

function getFullLayerName(layers) {
	return layers.filter(layerName => layerName !== "").join(".");
}
