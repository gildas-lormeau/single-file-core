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
import { sanitizeSelector, matchUnqueryableAttributeSelector, matchUnqueryablePseudoClass } from "./css-selector-sanitizer.js";

const DEBUG = false;

const PSEUDO_ELEMENT_SYNONYMS = new Set(["after", "before", "first-letter", "first-line"]);
const FUNCTIONAL_PSEUDO_CLASS_NAMES = new Set(["not", "is", "where", "has"]);
const MEDIA_AT_RULE_NAME = "media";
const SUPPORTS_AT_RULE_NAME = "supports";
const CONDITIONAL_AT_RULE_NAMES = new Set([MEDIA_AT_RULE_NAME, SUPPORTS_AT_RULE_NAME, "container", "starting-style"]);
const RULE_TYPE = "Rule";
const AT_RULE_TYPE = "Atrule";
const NESTING_SELECTOR_TYPE = "NestingSelector";
const PSEUDO_CLASS_SELECTOR_TYPE = "PseudoClassSelector";
const ATTRIBUTE_SELECTOR_TYPE = "AttributeSelector";
const DECLARATION_TYPE = "Declaration";
const RAW_TYPE = "Raw";
const VALUE_TYPE = "Value";
const IDENTIFIER_TYPE = "Identifier";
const PSEUDO_ELEMENT_SELECTOR_TYPE = "PseudoElementSelector";
const LAYER_NAME = "layer";
const SCOPE_NAME = "scope";
const IMPORT_NAME = "import";
const FONT_FACE_NAME = "font-face";
const KEYFRAMES_NAME = "keyframes";
const COMBINATOR_NAME = "Combinator";
const TYPE_SELECTOR_TYPE = "TypeSelector";
const STYLE_ATTRIBUTE_NAME = "style";
const SELECTOR_LIST_CONTEXT = "selectorList";
const STYLESHEET_CONTEXT = "stylesheet";
const SELECTOR_CONTEXT = "selector";
const DECLARATION_LIST_CONTEXT = "declarationList";
const UNKNOWN_PROPERTY_ERROR_NAME = "SyntaxReferenceError";
const VALUE_MISMATCH_ERROR_NAME = "SyntaxMatchError";
const VAR_FUNCTION_NAME = "var";
const FUNCTION_TYPE = "Function";
const VALIDITY_VALID = "valid";
const VALIDITY_UNKNOWN = "unknown";
const VALIDITY_INVALID = "invalid";
const PARSE_CSS_ERROR_MESSAGE = "Failed to parse CSS";
const QSA_ERROR_MESSAGE = "Failed to match selector";
const PRELUDE_SEPARATOR = ",";
const NESTING_SELECTOR = "&";
const SCOPE_PSEUDO_CLASS = ":scope";
const SCOPE_PSEUDO_CLASS_NAME = "scope";
const DESCENDANT_COMBINATOR = " ";
const NAMESPACE_SEPARATOR = "|";
const SELECTOR_SUPPORTS_PREFIX = "selector(";
const SELECTOR_SUPPORTS_SUFFIX = ")";
const VENDOR_PREFIX = "-";
const CUSTOM_PROPERTY_PREFIX = "--";
const LAYER_NAME_SEPARATOR = ".";
const CONTEXT_KEY_SEPARATOR = "|";
const REVERT_LAYER_KEYWORD = "revert-layer";
const UNSCOPED_PROXIMITY = Infinity;
const BLOCK_OPEN = "{";
const BLOCK_CLOSE = "}";
const EMPTY_STRING = "";
const CSS_IMPORTANCE_NOT_IMPORTANT = 0;
const CSS_IMPORTANCE_IMPORTANT = 1;
const INVALID_CSS_ESCAPE_TEST = /\\(?![0-9a-fA-F]{1,6}\s|[^0-9a-zA-Z])/;
const ANONYMOUS_LAYER_PLACEHOLDER = "\u0000";

export {
	process,
	isUnsupportedPropertyValue,
	getValueValidity,
	VALIDITY_VALID,
	VALIDITY_UNKNOWN,
	VALIDITY_INVALID
};

function isUnsupportedPropertyValue(property, value) {
	const match = cssTree.lexer.matchProperty(property, value);
	return Boolean(!match.matched && match.error && match.error.name !== UNKNOWN_PROPERTY_ERROR_NAME);
}

function getValueValidity(property, value) {
	const singleNode = value.children.size === 1 ? value.children.head.data : null;
	const name = singleNode && typeof singleNode.name === "string" ? singleNode.name : null;
	if (name && INVALID_CSS_ESCAPE_TEST.test(name)) {
		return VALIDITY_INVALID;
	}
	const isVendorValue = Boolean(name && name.startsWith(VENDOR_PREFIX));
	if (globalThis.CSS && globalThis.CSS.supports) {
		let supported;
		try {
			supported = globalThis.CSS.supports(property, cssTree.generate(value));
		} catch {
			return VALIDITY_UNKNOWN;
		}
		if (supported) {
			return VALIDITY_VALID;
		}
		return isVendorValue ? VALIDITY_INVALID : VALIDITY_UNKNOWN;
	}
	if (cssTree.find(value, node => node.type === FUNCTION_TYPE && node.name.toLowerCase() === VAR_FUNCTION_NAME)) {
		return VALIDITY_VALID;
	}
	let match;
	try {
		match = cssTree.lexer.matchProperty(property, value);
	} catch {
		return VALIDITY_UNKNOWN;
	}
	if (match.matched) {
		return VALIDITY_VALID;
	}
	if (match.error && match.error.name === VALUE_MISMATCH_ERROR_NAME && !isVendorValue && !property.startsWith(VENDOR_PREFIX)) {
		return VALIDITY_INVALID;
	}
	return VALIDITY_UNKNOWN;
}

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
		scopedSelectorTexts: new Map(),
		supportedSelectors: new Map(),
		valueValidities: new Map(),
		preludeTexts: new Map(),
		rulesCounter: 0,
		scopeIdCounter: 0
	};
	collectLayerOrder(stylesheets, docContext);
	buildEffectiveLayerOrder(docContext);
	minifyRules(stylesheets, docContext);
	computeCascade(docContext);
	removeEmptyRules(stylesheets, docContext);
	return docContext.stats;
}

function collectLayerOrder(stylesheets, docContext) {
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			if (hasChildNodes(stylesheetInfo.stylesheet)) {
				collectStylesheetLayerOrder(stylesheetInfo.stylesheet.children, { layerStack: [], conditionalStack: [] }, docContext);
			}
		}
	});
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

function minifyRules(stylesheets, docContext) {
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			if (hasChildNodes(stylesheetInfo.stylesheet)) {
				const topConditionalStack = stylesheetInfo.mediaText ? [{ name: MEDIA_AT_RULE_NAME, prelude: stylesheetInfo.mediaText }] : [];
				minifyStylesheetRules(stylesheetInfo.stylesheet.children, stylesheets, {
					ancestorsSelectors: [],
					layerStack: [],
					scopeStack: [],
					conditionalStack: topConditionalStack
				}, docContext);
			}
		}
	});
}

function computeCascade(docContext) {
	const winningDeclarations = new Set();
	docContext.matchedElements.forEach(element => computeCascadedStylesForElement(element, winningDeclarations, docContext));
	removeLosingDeclarations(winningDeclarations, docContext);
}

function removeEmptyRules(stylesheets, docContext) {
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			if (hasChildNodes(stylesheetInfo.stylesheet)) {
				removeStylesheetEmptyRules(stylesheetInfo.stylesheet.children, docContext);
			}
		}
	});
}

function collectStylesheetLayerOrder(cssRules, layerContext, docContext) {
	const { layerStack, conditionalStack } = layerContext;
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type === AT_RULE_TYPE && ruleData.name === LAYER_NAME) {
			collectStylesheetLayerRule(ruleData, layerStack, conditionalStack, docContext);
		} else if (isImportRule(ruleData)) {
			collectImportLayerOrder(ruleData, layerContext, docContext);
		} else if (ruleData.type === AT_RULE_TYPE && hasChildNodes(ruleData.block)) {
			const newConditionalStack = buildConditionalStack(conditionalStack, ruleData, docContext);
			collectStylesheetLayerOrder(ruleData.block.children, { layerStack, conditionalStack: newConditionalStack }, docContext);
		} else if (ruleData.type === RULE_TYPE && hasChildNodes(ruleData.block)) {
			collectStylesheetLayerOrder(ruleData.block.children, layerContext, docContext);
		}
	}
}

function collectStylesheetLayerRule(ruleData, layerStack, conditionalStack, docContext) {
	if (ruleData.block) {
		const layerName = getPreludeText(ruleData.prelude, docContext);
		registerLayerDeclaration(layerStack, layerName, conditionalStack, docContext);
		collectStylesheetLayerOrder(ruleData.block.children, { layerStack: [...layerStack, layerName], conditionalStack }, docContext);
	} else if (ruleData.prelude) {
		const layerNames = getPreludeText(ruleData.prelude, docContext).split(PRELUDE_SEPARATOR);
		layerNames.forEach(layerName => registerLayerDeclaration(layerStack, layerName, conditionalStack, docContext));
	}
}

function collectImportLayerOrder(ruleData, layerContext, docContext) {
	const urlNode = ruleData.prelude.children.head.data;
	const conditionalStack = buildImportConditionalStack(layerContext.conditionalStack, urlNode);
	const layerName = getImportLayerName(ruleData, urlNode);
	let { layerStack } = layerContext;
	if (layerName !== undefined) {
		registerLayerDeclaration(layerStack, layerName, conditionalStack, docContext);
		layerStack = [...layerStack, layerName];
	}
	collectStylesheetLayerOrder(urlNode.importedChildren, { layerStack, conditionalStack }, docContext);
}

function buildConditionalStack(conditionalStack, ruleData, docContext) {
	const isConditional = CONDITIONAL_AT_RULE_NAMES.has(ruleData.name);
	return isConditional
		? [...conditionalStack, { name: ruleData.name, prelude: getPreludeText(ruleData.prelude, docContext) }]
		: conditionalStack;
}

function buildImportConditionalStack(conditionalStack, urlNode) {
	const importConditionalStack = [...conditionalStack];
	if (urlNode.importedMediaText) {
		importConditionalStack.push({ name: MEDIA_AT_RULE_NAME, prelude: urlNode.importedMediaText });
	}
	if (urlNode.importedSupportsCondition !== undefined) {
		importConditionalStack.push({ name: SUPPORTS_AT_RULE_NAME, prelude: urlNode.importedSupportsCondition });
	}
	return importConditionalStack;
}

function getImportLayerName(ruleData, urlNode) {
	if (urlNode.importedLayerName !== undefined) {
		return urlNode.importedLayerName;
	}
	const layerKeyword = cssTree.find(ruleData.prelude, node => node.type === IDENTIFIER_TYPE && node.name.toLowerCase() === LAYER_NAME);
	return layerKeyword ? EMPTY_STRING : undefined;
}

function isImportRule(ruleData) {
	return ruleData.type === AT_RULE_TYPE && ruleData.name === IMPORT_NAME && hasChildNodes(ruleData.prelude) && Boolean(ruleData.prelude.children.head.data.importedChildren);
}

function registerLayerDeclaration(layerStack, layerName, conditionalStack, docContext) {
	const fullLayerName = getFullLayerName([...layerStack, layerName]);
	docContext.layerDeclarations.push({
		name: fullLayerName,
		order: docContext.layerDeclarationCounter++,
		conditionalStack: conditionalStack.slice()
	});
}

function minifyStylesheetRules(cssRules, stylesheets, processingContext, docContext) {
	const removedRules = new Set();
	let nestedRuleSeen = false;
	let declarationsOrder;
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		docContext.stats.processed++;
		if (cssRule.data.type === DECLARATION_TYPE) {
			if (nestedRuleSeen) {
				if (declarationsOrder === undefined) {
					declarationsOrder = docContext.rulesCounter++;
				}
				cssRule.data.order = declarationsOrder;
			}
		} else {
			minifyRule(cssRule.data, cssRule, stylesheets, processingContext, removedRules, docContext);
			nestedRuleSeen = true;
			declarationsOrder = undefined;
		}
	}
	removedRules.forEach(cssRule => cssRules.remove(cssRule));
}

function minifyRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	if (isImportRule(ruleData)) {
		minifyImportRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
	} else if (ruleData.type === AT_RULE_TYPE && ruleData.name === LAYER_NAME && hasChildNodes(ruleData.block)) {
		minifyLayerRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
	} else if (ruleData.type === AT_RULE_TYPE && ruleData.name === SCOPE_NAME && hasChildNodes(ruleData.block)) {
		minifyScopeRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
	} else if (ruleData.type === AT_RULE_TYPE && ruleData.name !== FONT_FACE_NAME && ruleData.name !== KEYFRAMES_NAME && !ruleData.name.startsWith(VENDOR_PREFIX) && hasChildNodes(ruleData.block)) {
		minifyAtRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
	} else if (ruleData.type === RULE_TYPE && hasChildNodes(ruleData.prelude)) {
		minifyStylesheetRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
	}
}

function minifyImportRule(ruleData, _cssRule, stylesheets, processingContext, _removedRules, docContext) {
	const urlNode = ruleData.prelude.children.head.data;
	const conditionalStack = buildImportConditionalStack(processingContext.conditionalStack, urlNode);
	const layerName = getImportLayerName(ruleData, urlNode);
	const layerStack = layerName === undefined ? processingContext.layerStack : [...processingContext.layerStack, layerName];
	minifyStylesheetRules(urlNode.importedChildren, stylesheets, {
		...processingContext,
		layerStack,
		conditionalStack
	}, docContext);
}

function minifyLayerRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	const layerName = getPreludeText(ruleData.prelude, docContext);
	const newProcessingContext = { ...processingContext, layerStack: [...processingContext.layerStack, layerName] };
	expandRawCssRules(ruleData);
	minifyStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
	if (!hasChildNodes(ruleData.block)) {
		removeEmptyLayerRule(ruleData, cssRule, removedRules, docContext);
	}
}

function removeEmptyLayerRule(ruleData, cssRule, removedRules, docContext) {
	if (hasChildNodes(ruleData.prelude)) {
		ruleData.block = null;
	} else {
		docContext.stats.discarded++;
		removedRules.add(cssRule);
	}
}

function minifyScopeRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	let scopeContext;
	try {
		const parsedPrelude = parsePrelude(ruleData.prelude);
		scopeContext = buildScopeContext(parsedPrelude, processingContext, docContext);
	} catch (error) {
		if (DEBUG) {
			// eslint-disable-next-line no-console
			console.error(PARSE_CSS_ERROR_MESSAGE, { ruleData, error });
		}
	}
	if (!scopeContext) {
		docContext.stats.discarded++;
		removedRules.add(cssRule);
		return;
	}
	const newProcessingContext = {
		...processingContext,
		scopeStack: [...(processingContext.scopeStack || []), scopeContext],
		hasUnqueryableSelector: processingContext.hasUnqueryableSelector || scopeContext.hasUnqueryableSelector,
		hasNestedUnqueryablePseudoClass: processingContext.hasNestedUnqueryablePseudoClass || scopeContext.hasNestedUnqueryablePseudoClass
	};
	expandRawCssRules(ruleData);
	minifyStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
	if (!hasChildNodes(ruleData.block)) {
		docContext.stats.discarded++;
		removedRules.add(cssRule);
	}
}

function buildScopeContext(parsedPrelude, processingContext, docContext) {
	const scopeStack = processingContext.scopeStack || [];
	const includeSelectors = parsedPrelude && parsedPrelude.include ? parsedPrelude.include : [];
	const excludeSelectors = parsedPrelude && parsedPrelude.exclude ? parsedPrelude.exclude : [];
	const includeAnalysis = analyzeScopeSelectors(includeSelectors);
	const excludeAnalysis = analyzeScopeSelectors(excludeSelectors);
	let rootElements = [];
	if (includeSelectors.length) {
		rootElements = collectScopeRootElements(includeSelectors, scopeStack, docContext);
		if (!rootElements.length && includeAnalysis.hasNestedUnqueryablePseudoClass) {
			rootElements = scopeStack.length ? Array.from(scopeStack[scopeStack.length - 1].rootElements) : getDefaultScopeRoots(docContext);
		}
	} else if (scopeStack.length) {
		rootElements = Array.from(scopeStack[scopeStack.length - 1].rootElements);
	} else {
		rootElements = getDefaultScopeRoots(docContext);
	}
	const uniqueRoots = Array.from(new Set(rootElements.filter(Boolean)));
	if (!uniqueRoots.length) {
		return null;
	}
	const boundaryElements = collectScopeBoundaryElements(excludeSelectors, uniqueRoots, docContext);
	return {
		id: docContext.scopeIdCounter++,
		rootElements: new Set(uniqueRoots),
		stopElements: boundaryElements,
		hasUnqueryableSelector: includeAnalysis.hasUnqueryableSelector || excludeAnalysis.hasUnqueryableSelector,
		hasNestedUnqueryablePseudoClass: includeAnalysis.hasNestedUnqueryablePseudoClass
	};
}

function analyzeScopeSelectors(selectors) {
	const analysis = { hasUnqueryableSelector: false, hasNestedUnqueryablePseudoClass: false };
	selectors.forEach(selectorInfo => {
		const { hasUnqueryableSelector, hasNestedUnqueryablePseudoClass } = analyzeSelector(selectorInfo.data);
		analysis.hasUnqueryableSelector ||= hasUnqueryableSelector;
		analysis.hasNestedUnqueryablePseudoClass ||= hasNestedUnqueryablePseudoClass;
	});
	return analysis;
}

function collectScopeRootElements(includeSelectors, scopeStack, docContext) {
	const roots = new Set();
	includeSelectors.forEach(selectorInfo => {
		const selectorText = sanitizeSelector(selectorInfo, null, docContext);
		const matchedNodes = querySelectorAll(docContext.doc, selectorText);
		filterElementsByScopes(matchedNodes, scopeStack).forEach(match => roots.add(match));
	});
	return Array.from(roots);
}

function collectScopeBoundaryElements(excludeSelectors, rootElements, docContext) {
	const boundaries = new Set();
	if (!excludeSelectors.length || !rootElements.length) {
		return boundaries;
	}
	excludeSelectors.forEach(selectorInfo => {
		const { hasUnqueryableSelector, hasNestedUnqueryablePseudoClass } = analyzeSelector(selectorInfo.data);
		if (!hasUnqueryableSelector && !hasNestedUnqueryablePseudoClass) {
			const selectorText = getScopedSelectorText(sanitizeSelector(selectorInfo, null, docContext), docContext);
			rootElements.forEach(root => {
				matchSelectorWithinRoot(root, selectorText).forEach(node => boundaries.add(node));
			});
		}
	});
	return boundaries;
}

function getDefaultScopeRoots(docContext) {
	const roots = [];
	if (docContext.doc && docContext.doc.documentElement) {
		roots.push(docContext.doc.documentElement);
	}
	if (!roots.length && docContext.doc && docContext.doc.body) {
		roots.push(docContext.doc.body);
	}
	if (!roots.length && docContext.doc && docContext.doc.children) {
		roots.push(...Array.from(docContext.doc.children).filter(node => node.nodeType === 1));
	}
	return roots;
}

function minifyAtRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	const newConditionalStack = buildConditionalStack(processingContext.conditionalStack, ruleData, docContext);
	const newProcessingContext = { ...processingContext, conditionalStack: newConditionalStack };
	expandRawCssRules(ruleData);
	minifyStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
	if (!hasChildNodes(ruleData.block)) {
		docContext.stats.discarded++;
		removedRules.add(cssRule);
	}
}

function minifyStylesheetRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	ruleData.order = docContext.rulesCounter++;
	if (!isPreludeSupported(ruleData.prelude, docContext)) {
		return;
	}
	const removedSelectors = processSelectors(ruleData, processingContext, docContext);
	const wasDiscarded = removeUnmatchedSelectors(ruleData, removedSelectors, removedRules, cssRule, docContext);
	if (!wasDiscarded && hasChildNodes(ruleData.block)) {
		processNestedRules(ruleData, stylesheets, processingContext, docContext);
	}
}

function processSelectors(ruleData, processingContext, docContext) {
	const removedSelectors = [];
	const { ancestorsSelectors, scopeStack } = processingContext;
	for (let selector = ruleData.prelude.children.head, selectorIndex = 0; selector; selector = selector.next, selectorIndex++) {
		const analysis = analyzeSelector(selector.data);
		const { startsWithCombinator } = analysis;
		const hasUnqueryableSelector = analysis.hasUnqueryableSelector || Boolean(processingContext.hasUnqueryableSelector);
		const hasNestedUnqueryablePseudoClass = analysis.hasNestedUnqueryablePseudoClass || Boolean(processingContext.hasNestedUnqueryablePseudoClass);
		if (hasUnqueryableSelector) {
			ruleData.hasUnqueryableSelector = true;
		}
		if (hasNestedUnqueryablePseudoClass) {
			ruleData.hasNestedUnqueryablePseudoClass = true;
		}
		registerSelector(selector, ruleData, processingContext, docContext);
		if (!startsWithCombinator || !ancestorsSelectors || !ancestorsSelectors.length) {
			const relativeToScope = startsWithCombinator && Boolean(scopeStack && scopeStack.length);
			const matchedElements = matchElements(selector, ancestorsSelectors, scopeStack, docContext, relativeToScope);
			if (matchedElements.length) {
				if (!hasUnqueryableSelector) {
					updateMatchingSelectors(matchedElements, selector, docContext);
				}
			} else if (!hasNestedUnqueryablePseudoClass) {
				removedSelectors.push(selector);
			}
		}
	}
	return removedSelectors;
}

function analyzeSelector(selector) {
	let hasUnqueryableSelector = false;
	let hasNestedUnqueryablePseudoClass = false;
	let startsWithCombinator = false;
	let functionalPseudoClassDepth = 0;
	cssTree.walk(selector, {
		enter(node) {
			if (node.type === PSEUDO_ELEMENT_SELECTOR_TYPE) {
				hasUnqueryableSelector = true;
				if (functionalPseudoClassDepth) {
					hasNestedUnqueryablePseudoClass = true;
				}
			} else if (node.type === PSEUDO_CLASS_SELECTOR_TYPE) {
				if (PSEUDO_ELEMENT_SYNONYMS.has(node.name) || matchUnqueryablePseudoClass(node)) {
					hasUnqueryableSelector = true;
					if (functionalPseudoClassDepth) {
						hasNestedUnqueryablePseudoClass = true;
					}
				}
				if (FUNCTIONAL_PSEUDO_CLASS_NAMES.has(node.name.toLowerCase())) {
					functionalPseudoClassDepth++;
				}
			} else if (node.type === ATTRIBUTE_SELECTOR_TYPE && matchUnqueryableAttributeSelector(node)) {
				hasUnqueryableSelector = true;
				if (functionalPseudoClassDepth) {
					hasNestedUnqueryablePseudoClass = true;
				}
			} else if (node.type === TYPE_SELECTOR_TYPE && typeof node.name === "string" && node.name.includes(NAMESPACE_SEPARATOR)) {
				hasUnqueryableSelector = true;
				if (functionalPseudoClassDepth) {
					hasNestedUnqueryablePseudoClass = true;
				}
			}
		},
		leave(node) {
			if (node.type === PSEUDO_CLASS_SELECTOR_TYPE && FUNCTIONAL_PSEUDO_CLASS_NAMES.has(node.name.toLowerCase())) {
				functionalPseudoClassDepth--;
			}
		}
	});
	const firstChild = selector.children.head.data;
	startsWithCombinator = firstChild && firstChild.type === COMBINATOR_NAME;
	return { hasUnqueryableSelector, hasNestedUnqueryablePseudoClass, startsWithCombinator };
}

function isPreludeSupported(prelude, docContext) {
	if (!globalThis.CSS || !globalThis.CSS.supports) {
		return true;
	}
	for (let selector = prelude.children.head; selector; selector = selector.next) {
		if (!isSelectorSupported(selector.data, docContext)) {
			return false;
		}
	}
	return true;
}

function isSelectorSupported(selector, docContext) {
	const selectorNode = cssTree.clone(selector);
	cssTree.walk(selectorNode, {
		visit: TYPE_SELECTOR_TYPE,
		enter(node) {
			if (typeof node.name === "string" && node.name.includes(NAMESPACE_SEPARATOR)) {
				node.name = node.name.substring(node.name.lastIndexOf(NAMESPACE_SEPARATOR) + 1);
			}
		}
	});
	let selectorText = cssTree.generate(selectorNode);
	const firstChild = selectorNode.children && selectorNode.children.head && selectorNode.children.head.data;
	if (firstChild && firstChild.type === COMBINATOR_NAME) {
		selectorText = SCOPE_PSEUDO_CLASS + selectorText;
	}
	if (!docContext.supportedSelectors.has(selectorText)) {
		let supported;
		try {
			supported = globalThis.CSS.supports(SELECTOR_SUPPORTS_PREFIX + selectorText + SELECTOR_SUPPORTS_SUFFIX);
		} catch {
			supported = true;
		}
		docContext.supportedSelectors.set(selectorText, supported);
	}
	return docContext.supportedSelectors.get(selectorText);
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

function processNestedRules(ruleData, stylesheets, processingContext, docContext) {
	expandRawCssRules(ruleData);
	const newProcessingContext = {
		...processingContext,
		ancestorsSelectors: [...processingContext.ancestorsSelectors, ruleData.prelude],
		hasUnqueryableSelector: Boolean(ruleData.hasUnqueryableSelector),
		hasNestedUnqueryablePseudoClass: Boolean(ruleData.hasNestedUnqueryablePseudoClass)
	};
	minifyStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
}

function registerSelector(selector, ruleData, processingContext, docContext) {
	const {
		ancestorsSelectors,
		layerStack,
		scopeStack,
		conditionalStack
	} = processingContext;
	docContext.selectorData.set(selector, {
		specificity: computeMaxSpecificity(selector.data, ancestorsSelectors),
		rule: ruleData,
		layerStack,
		scopeStack,
		conditionalStack
	});
}

function computeCascadedStylesForElement(element, winningDeclarations, docContext) {
	const allDeclarations = collectDeclarationItemsForElement(element, docContext);
	const contextGroups = new Map();
	allDeclarations.forEach(declarationData => {
		const { selector } = declarationData;
		const conditionalStack = getConditionalStackForSelector(selector, docContext);
		const contextKey = createContextKey(conditionalStack);
		if (!contextGroups.has(contextKey)) {
			contextGroups.set(contextKey, []);
		}
		contextGroups.get(contextKey).push(declarationData);
	});
	contextGroups.forEach(declarations => {
		declarations.sort((declarationA, declarationB) => compareDeclarations(declarationA, declarationB, docContext));
		const propertyDeclarations = new Map();
		declarations.forEach(declarationData => {
			const { property } = declarationData.declaration.data;
			if (!propertyDeclarations.has(property)) {
				propertyDeclarations.set(property, []);
			}
			propertyDeclarations.get(property).push(declarationData);
		});
		propertyDeclarations.forEach(candidates => {
			for (let indexCandidate = candidates.length - 1; indexCandidate >= 0; indexCandidate--) {
				const { declaration, validity } = candidates[indexCandidate];
				winningDeclarations.add(declaration);
				if (validity === VALIDITY_VALID) {
					if (isRevertLayerValue(declaration)) {
						candidates.forEach(candidate => winningDeclarations.add(candidate.declaration));
					}
					break;
				}
			}
		});
	});
}

function isRevertLayerValue(declaration) {
	const { value } = declaration.data;
	return Boolean(value &&
		value.type === VALUE_TYPE &&
		value.children &&
		value.children.size === 1 &&
		value.children.head.data.type === IDENTIFIER_TYPE &&
		value.children.head.data.name.toLowerCase() === REVERT_LAYER_KEYWORD);
}

function createContextKey(conditionalStack) {
	return conditionalStack.map(context => `${context.name}:${context.prelude}`).join(CONTEXT_KEY_SEPARATOR);
}

function collectDeclarationItemsForElement(element, docContext) {
	const matchingSelectors = docContext.matchingSelectors.get(element);
	const allDeclarations = [];
	matchingSelectors.forEach(selector => {
		const selectorData = docContext.selectorData.get(selector);
		const cssRule = selectorData.rule;
		if (hasChildNodes(cssRule.block)) {
			const proximity = getScopeProximity(element, selectorData.scopeStack);
			const declarations = cssRule.block.children;
			for (let declaration = declarations.head; declaration; declaration = declaration.next) {
				const { type, value, order } = declaration.data;
				if (type === DECLARATION_TYPE && value) {
					addDeclaration(declaration, selectorData.specificity, false, selector, order === undefined ? cssRule.order : order, proximity);
				}
			}
		}
	});
	const inlineDeclarations = getInlineStyleDeclarations(element);
	for (const declaration of inlineDeclarations) {
		addDeclaration(declaration.declaration, declaration.specificity, true);
	}
	return allDeclarations;

	function addDeclaration(declaration, specificity, isInline, selector, order, proximity) {
		const { property, value } = declaration.data;
		if (value.type === VALUE_TYPE && hasChildNodes(value)) {
			const validity = getCachedValueValidity(property, value, docContext);
			if (validity !== VALIDITY_INVALID) {
				allDeclarations.push({
					declaration,
					selector,
					specificity,
					isInline,
					order,
					proximity,
					validity
				});
			}
		}
	}
}

function getCachedValueValidity(property, value, docContext) {
	if (property.startsWith(CUSTOM_PROPERTY_PREFIX)) {
		return VALIDITY_VALID;
	}
	if (!docContext.valueValidities.has(value)) {
		docContext.valueValidities.set(value, getValueValidity(property, value));
	}
	return docContext.valueValidities.get(value);
}

function getScopeProximity(element, scopeStack) {
	if (!scopeStack || !scopeStack.length) {
		return UNSCOPED_PROXIMITY;
	}
	const { rootElements } = scopeStack[scopeStack.length - 1];
	let hops = 0;
	for (let current = element; current; current = current.parentElement) {
		if (rootElements.has(current)) {
			return hops;
		}
		hops++;
	}
	return UNSCOPED_PROXIMITY;
}

function getConditionalStackForSelector(selector, docContext) {
	let conditionalStack = [];
	if (selector) {
		const selectorData = docContext.selectorData.get(selector);
		if (selectorData && selectorData.conditionalStack) {
			conditionalStack = selectorData.conditionalStack;
		}
	}
	return conditionalStack;
}

function matchElements(selector, ancestorsSelectors, scopeStack, docContext, relativeToScope) {
	let selectorText = createSelectorText(selector, ancestorsSelectors, docContext);
	if (relativeToScope) {
		selectorText = SCOPE_PSEUDO_CLASS + selectorText;
	} else if (scopeStack && scopeStack.length) {
		selectorText = getScopedSelectorText(selectorText, docContext);
	}
	const cacheKey = createScopeCacheKey(selectorText, scopeStack);
	const cachedNodes = docContext.matchedSelectors.get(cacheKey);
	if (cachedNodes) {
		return cachedNodes;
	}
	let nodes;
	if (scopeStack && scopeStack.length) {
		nodes = matchElementsInScope(selectorText, scopeStack);
		nodes = filterElementsByScopes(nodes, scopeStack);
	} else {
		nodes = querySelectorAll(docContext.doc, selectorText);
	}
	docContext.matchedSelectors.set(cacheKey, nodes);
	return nodes;
}

function getScopedSelectorText(selectorText, docContext) {
	if (!docContext.scopedSelectorTexts.has(selectorText)) {
		let scopedSelectorText = selectorText;
		try {
			const selectorList = parseCss(selectorText, SELECTOR_LIST_CONTEXT);
			scopedSelectorText = selectorList.children.toArray().map(selector => {
				const hasScopePseudoClass = cssTree.find(selector, node => node.type === PSEUDO_CLASS_SELECTOR_TYPE && node.name.toLowerCase() === SCOPE_PSEUDO_CLASS_NAME);
				return hasScopePseudoClass ? cssTree.generate(selector) : SCOPE_PSEUDO_CLASS + DESCENDANT_COMBINATOR + cssTree.generate(selector);
			}).join(PRELUDE_SEPARATOR);
		} catch {
			if (DEBUG) {
				// eslint-disable-next-line no-console
				console.warn(PARSE_CSS_ERROR_MESSAGE, selectorText);
			}
		}
		docContext.scopedSelectorTexts.set(selectorText, scopedSelectorText);
	}
	return docContext.scopedSelectorTexts.get(selectorText);
}

function createScopeCacheKey(selectorText, scopeStack) {
	if (!scopeStack || !scopeStack.length) {
		return selectorText;
	}
	const signature = scopeStack.map(scope => scope.id).join(CONTEXT_KEY_SEPARATOR);
	return `${selectorText}${CONTEXT_KEY_SEPARATOR}${signature}`;
}

function matchElementsInScope(selectorText, scopeStack) {
	const currentScope = scopeStack[scopeStack.length - 1];
	const roots = Array.from(currentScope.rootElements);
	if (!roots.length) {
		return [];
	}
	const matchedNodes = new Set();
	roots.forEach(root => {
		matchSelectorWithinRoot(root, selectorText).forEach(node => matchedNodes.add(node));
	});
	return Array.from(matchedNodes);
}

function matchSelectorWithinRoot(root, selectorText) {
	const matchedNodes = new Set();
	if (!root || root.nodeType !== 1) {
		return matchedNodes;
	}
	if (matches(root, selectorText)) {
		matchedNodes.add(root);
	}
	let nodes;
	try {
		nodes = root.querySelectorAll(selectorText);
	} catch {
		if (DEBUG) {
			// eslint-disable-next-line no-console
			console.error(QSA_ERROR_MESSAGE, { root, selectorText });
		}
		nodes = matchByTraversal([root], selectorText, true);
	}
	for (const node of nodes) {
		matchedNodes.add(node);
	}
	return Array.from(matchedNodes);
}

function matches(element, selectorText) {
	if (!element || element.nodeType !== 1) {
		return false;
	}
	try {
		return element.matches(selectorText);
	} catch {
		return false;
	}
}

function matchByTraversal(roots, selectorText, skipFirst) {
	const results = [];
	const visited = new Set();
	const stack = [];
	roots.forEach(root => {
		if (root && root.nodeType === 1) {
			stack.push({ node: root, include: !skipFirst });
		}
	});
	while (stack.length) {
		const { node, include } = stack.pop();
		if (!node || visited.has(node)) {
			continue;
		}
		visited.add(node);
		if (include && matches(node, selectorText)) {
			results.push(node);
		}
		for (let child = node.firstElementChild; child; child = child.nextElementSibling) {
			stack.push({ node: child, include: true });
		}
	}
	return results;
}

function getTraversalRoots(root) {
	if (!root) {
		return [];
	}
	if (root.nodeType === 9 || root.nodeType === 11) {
		if (root.documentElement) {
			return [root.documentElement];
		}
		return root.children ? Array.from(root.children).filter(node => node.nodeType === 1) : [];
	}
	return [root];
}

function filterElementsByScopes(elements, scopeStack) {
	if (!scopeStack || !scopeStack.length) {
		return elements;
	}
	return elements.filter(element => isElementWithinScopes(element, scopeStack));
}

function isElementWithinScopes(element, scopeStack) {
	if (!element) {
		return false;
	}
	for (let index = 0; index < scopeStack.length; index++) {
		if (!isElementWithinScope(element, scopeStack[index])) {
			return false;
		}
	}
	return true;
}

function isElementWithinScope(element, scopeContext) {
	let current = element;
	while (current && current.nodeType === 1) {
		if (scopeContext.stopElements && scopeContext.stopElements.has(current)) {
			return false;
		}
		if (scopeContext.rootElements.has(current)) {
			return true;
		}
		current = current.parentElement;
	}
	return false;
}

function createSelectorText(selector, ancestorsSelectors, docContext) {
	let selectorText;
	if (ancestorsSelectors && ancestorsSelectors.length) {
		selectorText = combineSelectorWithAncestors(selector.data, ancestorsSelectors, docContext);
		const combinedAst = parseCss(selectorText, SELECTOR_LIST_CONTEXT);
		selectorText = sanitizeSelector({ data: combinedAst }, ancestorsSelectors, docContext);
	}
	if (!selectorText) {
		selectorText = sanitizeSelector(selector, ancestorsSelectors, docContext);
	}
	return selectorText;
}

function compareDeclarations(declarationA, declarationB, docContext) {
	const importantA = declarationA.declaration.data.important ? CSS_IMPORTANCE_IMPORTANT : CSS_IMPORTANCE_NOT_IMPORTANT;
	const importantB = declarationB.declaration.data.important ? CSS_IMPORTANCE_IMPORTANT : CSS_IMPORTANCE_NOT_IMPORTANT;
	if (importantA !== importantB) {
		return importantA - importantB;
	}
	if (declarationA.isInline && !declarationB.isInline) return 1;
	if (!declarationA.isInline && declarationB.isInline) return -1;
	const selectorDataA = declarationA.selector ? docContext.selectorData.get(declarationA.selector) : null;
	const selectorDataB = declarationB.selector ? docContext.selectorData.get(declarationB.selector) : null;
	if (selectorDataA && selectorDataB) {
		const layerComparison = compareLayers(selectorDataA.layerStack, selectorDataB.layerStack, docContext);
		if (layerComparison !== 0) {
			return importantA ? -layerComparison : layerComparison;
		}
		const specificityA = declarationA.specificity;
		const specificityB = declarationB.specificity;
		if (specificityA.a !== specificityB.a) {
			return specificityA.a - specificityB.a;
		}
		if (specificityA.b !== specificityB.b) {
			return specificityA.b - specificityB.b;
		}
		if (specificityA.c !== specificityB.c) {
			return specificityA.c - specificityB.c;
		}
		if (declarationA.proximity !== declarationB.proximity) {
			return declarationB.proximity - declarationA.proximity;
		}
		if (declarationA.order !== declarationB.order) {
			return declarationA.order - declarationB.order;
		}
		return 0;
	} else {
		const specificityA = declarationA.specificity;
		const specificityB = declarationB.specificity;
		if (specificityA.a !== specificityB.a) {
			return specificityA.a - specificityB.a;
		}
		if (specificityA.b !== specificityB.b) {
			return specificityA.b - specificityB.b;
		}
		if (specificityA.c !== specificityB.c) {
			return specificityA.c - specificityB.c;
		}
		return 0;
	}
}

function compareLayers(layersA, layersB, docContext) {
	const isUnlayeredA = layersA.length === 0;
	const isUnlayeredB = layersB.length === 0;
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

function removeStylesheetEmptyRules(cssRules, docContext) {
	const removedRules = new Set();
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type === RULE_TYPE) {
			if (hasChildNodes(ruleData.block)) {
				removeStylesheetEmptyRules(ruleData.block.children, docContext);
			} else {
				docContext.stats.discarded++;
				removedRules.add(cssRule);
			}
		} else if (isImportRule(ruleData)) {
			removeStylesheetEmptyRules(ruleData.prelude.children.head.data.importedChildren, docContext);
		} else if (ruleData.type === AT_RULE_TYPE && ruleData.block && ruleData.name !== FONT_FACE_NAME && ruleData.name !== KEYFRAMES_NAME) {
			removeStylesheetEmptyRules(ruleData.block.children, docContext);
			if (!hasChildNodes(ruleData.block)) {
				if (ruleData.name === LAYER_NAME) {
					removeEmptyLayerRule(ruleData, cssRule, removedRules, docContext);
				} else {
					docContext.stats.discarded++;
					removedRules.add(cssRule);
				}
			}
		}
	}
	removedRules.forEach(cssRule => cssRules.remove(cssRule));
}

function removeUnmatchedSelectors(ruleData, removedSelectors, removedRules, cssRule, docContext) {
	if (removedSelectors && removedSelectors.length) {
		removedSelectors.forEach(selector => ruleData.prelude.children.remove(selector));
	}
	if (!hasChildNodes(ruleData.prelude)) {
		docContext.stats.discarded++;
		removedRules.add(cssRule);
		return true;
	}
	return false;
}

function removeLosingDeclarations(winningDeclarations, docContext) {
	const allDeclarations = new Map();
	const protectedDeclarations = new Set();
	docContext.matchedElements.forEach(element => {
		const matchingSelectors = docContext.matchingSelectors.get(element);
		if (matchingSelectors) {
			matchingSelectors.forEach(selector => {
				const cssRule = docContext.selectorData.get(selector).rule;
				if (hasChildNodes(cssRule.block)) {
					const declarations = cssRule.block.children;
					for (let declaration = declarations.head; declaration; declaration = declaration.next) {
						if (declaration.data.type === DECLARATION_TYPE) {
							allDeclarations.set(declaration, declarations);
							const { property, value } = declaration.data;
							if (property && property.startsWith(CUSTOM_PROPERTY_PREFIX) || (value && value.type === RAW_TYPE) || cssRule.hasUnqueryableSelector) {
								protectedDeclarations.add(declaration);
							}
						}
					}
				}
			});
		}
	});
	allDeclarations.forEach((list, node) => {
		if (!winningDeclarations.has(node) && !protectedDeclarations.has(node)) {
			list.remove(node);
		}
	});
}

function expandRawCssRules(ruleData) {
	const ruleChildren = [];
	if (hasChildNodes(ruleData.block)) {
		for (let cssRuleNode = ruleData.block.children.head; cssRuleNode; cssRuleNode = cssRuleNode.next) {
			if (cssRuleNode.data.type === RAW_TYPE) {
				if (cssRuleNode.data.value.indexOf(BLOCK_OPEN) !== -1 &&
					cssRuleNode.data.value.indexOf(BLOCK_OPEN) < cssRuleNode.data.value.indexOf(BLOCK_CLOSE)) {
					try {
						const stylesheet = parseCss(cssRuleNode.data.value, STYLESHEET_CONTEXT);
						for (let stylesheetChild = stylesheet.children.head; stylesheetChild; stylesheetChild = stylesheetChild.next) {
							ruleChildren.push(stylesheetChild);
						}
					} catch (error) {
						if (DEBUG) {
							// eslint-disable-next-line no-console
							console.warn(PARSE_CSS_ERROR_MESSAGE, cssRuleNode.data.value, error);
						}
					}
				} else {
					ruleChildren.push(cssRuleNode);
				}
			} else {
				ruleChildren.push(cssRuleNode);
			}
		}
	}
	ruleData.block.children.clear();
	ruleChildren.forEach(ruleChild => ruleData.block.children.appendData(ruleChild.data));
}

function combineSelectorWithAncestors(selector, ancestorsSelectors, docContext) {
	const selectorText = getSelectorText(selector, docContext);
	if (!ancestorsSelectors || !ancestorsSelectors.length) {
		return selectorText;
	} else {
		let contexts = [EMPTY_STRING];
		ancestorsSelectors.forEach(selectorList => {
			if (hasChildNodes(selectorList)) {
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
			}
		});
		const expandedSelectors = new Set();
		contexts.forEach(context => {
			const result = context ? combineSelectors(context, selectorText) : selectorText;
			expandedSelectors.add(result);
		});
		return Array.from(expandedSelectors).join(PRELUDE_SEPARATOR);
	}
}

function combineSelectors(parentSelectorText, childSelectorText) {
	const childSelector = parseCss(childSelectorText || NESTING_SELECTOR);
	const parentSelector = parentSelectorText ? parseCss(parentSelectorText) : null;
	let hasNesting = false;
	cssTree.walk(childSelector, {
		visit: NESTING_SELECTOR_TYPE,
		enter(_node, item, list) {
			hasNesting = true;
			if (!parentSelector) {
				list.remove(item);
				return;
			}
			const nodes = parentSelector.children.toArray().map(parent => cssTree.clone(parent));
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

function hasChildNodes(node) {
	return Boolean(node && node.children && node.children.head);
}

function getSelectorText(selector, docContext) {
	if (!docContext.selectorTexts.has(selector)) {
		docContext.selectorTexts.set(selector, cssTree.generate(selector));
	}
	return docContext.selectorTexts.get(selector);
}

function getPreludeText(prelude, docContext) {
	if (prelude) {
		if (!docContext.preludeTexts.has(prelude)) {
			docContext.preludeTexts.set(prelude, cssTree.generate(prelude));
		}
		return docContext.preludeTexts.get(prelude);
	} else {
		return EMPTY_STRING;
	}
}

function getFullLayerName(layers) {
	return layers.map(layerName => layerName === EMPTY_STRING ? ANONYMOUS_LAYER_PLACEHOLDER : layerName).join(LAYER_NAME_SEPARATOR);
}

function parseCss(text, context = SELECTOR_CONTEXT) {
	const options = { context };
	return cssTree.parse(text, options);
}

function querySelectorAll(root, selectorText) {
	if (!root) {
		return [];
	}
	const isDocumentNode = root.nodeType === 9 || root.nodeType === 11;
	const hasScopePseudo = Boolean(selectorText && selectorText.indexOf(":scope") !== -1);
	if (isDocumentNode && hasScopePseudo) {
		return matchDocumentScopeSelector(root, selectorText);
	}
	try {
		return Array.from(root.querySelectorAll(selectorText));
	} catch {
		if (DEBUG) {
			// eslint-disable-next-line no-console
			console.warn(QSA_ERROR_MESSAGE, selectorText, root.nodeType === 1 && root.tagName ? root.tagName : EMPTY_STRING);
		}
		const traversalRoots = getTraversalRoots(root);
		return matchByTraversal(traversalRoots, selectorText, false);
	}
}

function matchDocumentScopeSelector(root, selectorText) {
	const traversalRoots = getTraversalRoots(root);
	if (!traversalRoots.length) {
		return [];
	}
	const matchedNodes = new Set();
	traversalRoots.forEach(scopeRoot => {
		matchSelectorWithinRoot(scopeRoot, selectorText).forEach(node => matchedNodes.add(node));
	});
	return Array.from(matchedNodes);
}

function getInlineStyleDeclarations(element) {
	const style = element.getAttribute(STYLE_ATTRIBUTE_NAME);
	if (style) {
		let declarationNodes;
		try {
			declarationNodes = cssTree.parse(style, { context: DECLARATION_LIST_CONTEXT });
		} catch {
			return [];
		}
		const declarations = [];
		for (let node = declarationNodes.children && declarationNodes.children.head; node; node = node.next) {
			if (node.data.type === DECLARATION_TYPE) {
				declarations.push({
					declaration: node,
					specificity: { a: 1, b: 0, c: 0 },
					isInline: true
				});
			}
		}
		return declarations;
	} else {
		return [];
	}
}