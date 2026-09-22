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
const FUNCTIONAL_PSEUDO_CLASS_NAMES = new Set(["not", "is", "where", "has", "nth-child", "nth-last-child"]);
const MEDIA_AT_RULE_NAME = "media";
const SUPPORTS_AT_RULE_NAME = "supports";
const STARTING_STYLE_AT_RULE_NAME = "starting-style";
const CONDITIONAL_AT_RULE_NAMES = new Set([MEDIA_AT_RULE_NAME, SUPPORTS_AT_RULE_NAME, "container", STARTING_STYLE_AT_RULE_NAME]);
const UNCERTAIN_CONDITIONAL_AT_RULE_NAMES = new Set([MEDIA_AT_RULE_NAME, SUPPORTS_AT_RULE_NAME, STARTING_STYLE_AT_RULE_NAME]);
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
const DECLARATION_SEPARATOR = ":";
const IS_PSEUDO_CLASS_PREFIX = ":is(";
const IS_PSEUDO_CLASS_SUFFIX = ")";
const NO_ELEMENT_SELECTOR = ":not(*)";
const SCOPE_PSEUDO_CLASS = ":scope";
const SCOPE_PSEUDO_CLASS_NAME = "scope";
const DESCENDANT_COMBINATOR = " ";
const NAMESPACE_SEPARATOR = "|";
const SELECTOR_SUPPORTS_PREFIX = "selector(";
const SELECTOR_SUPPORTS_SUFFIX = ")";
const VENDOR_PREFIX = "-";
const CUSTOM_PROPERTY_PREFIX = "--";
const LAYER_NAME_SEPARATOR = ".";
const LAYER_NAME_KEY_SEPARATOR = "\u0000";
const CONTEXT_KEY_SEPARATOR = "|";
const REVERT_LAYER_KEYWORD = "revert-layer";
const REVERT_LAYER_TEST = /(^|[^-\w])revert-layer([^-\w]|$)/i;
const NAMESPACE_AT_RULE_NAME = "namespace";
const URL_TYPE = "Url";
const STRING_TYPE = "String";
const ESCAPE_CHARACTER = "\\";
const CSS_ESCAPE_TEST = /\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \n\r\t\f])?|([^\n\r\f]))/g;
const REPLACEMENT_CHARACTER = "\uFFFD";
const MAX_CODE_POINT = 0x10ffff;
const SURROGATE_FIRST_CODE_POINT = 0xd800;
const SURROGATE_LAST_CODE_POINT = 0xdfff;
const HEXADECIMAL_RADIX = 16;
const UNSCOPED_PROXIMITY = Infinity;
const BLOCK_OPEN = "{";
const BLOCK_CLOSE = "}";
const EMPTY_STRING = "";
const CSS_IMPORTANCE_NOT_IMPORTANT = 0;
const CSS_IMPORTANCE_IMPORTANT = 1;
const INVALID_CSS_ESCAPE_TEST = /\\(?![0-9a-fA-F]{1,6}\s|[^0-9a-zA-Z])/;
const ANONYMOUS_LAYER_PREFIX = "\u0000";
const UNCERTAIN_LAYER_ORDER = null;
const UNDECLARED_LAYER_POSITION = Infinity;

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
		revertLayerElements: new Set(),
		matchedSelectors: new Map(),
		matchingSelectors: new Map(),
		layerDeclarationCounter: 0,
		anonymousLayerCounter: 0,
		layerOrder: new Map(),
		layerComparisons: new Map(),
		selectorData: new Map(),
		selectorTexts: new Map(),
		nestedSelectorTexts: new Map(),
		nestingParentTexts: new Map(),
		nestingParentNodes: new Map(),
		scopedSelectorTexts: new Map(),
		supportedSelectors: new Map(),
		valueValidities: new Map(),
		preludeTexts: new Map(),
		rulesCounter: 0,
		scopeIdCounter: 0
	};
	collectLayerOrder(stylesheets, docContext);
	minifyRules(stylesheets, docContext);
	computeCascade(docContext);
	removeEmptyRules(stylesheets, docContext);
	return docContext.stats;
}

function collectLayerOrder(stylesheets, docContext) {
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			if (hasChildNodes(stylesheetInfo.stylesheet)) {
				collectStylesheetLayerOrder(stylesheetInfo.stylesheet.children, { layerStack: [], conditionalStack: getTopConditionalStack(stylesheetInfo) }, docContext);
			}
		}
	});
}

function getTopConditionalStack(stylesheetInfo) {
	return stylesheetInfo.mediaText ? [{ name: MEDIA_AT_RULE_NAME, prelude: stylesheetInfo.mediaText }] : [];
}

function minifyRules(stylesheets, docContext) {
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			if (hasChildNodes(stylesheetInfo.stylesheet)) {
				minifyStylesheetRules(stylesheetInfo.stylesheet.children, stylesheets, {
					ancestorsSelectors: [],
					layerStack: [],
					scopeStack: [],
					conditionalStack: getTopConditionalStack(stylesheetInfo),
					ownerElement: getStylesheetOwnerElement(key),
					hasDefaultNamespace: hasDefaultNamespace(stylesheetInfo.stylesheet.children)
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
		const layerSegments = getLayerSegments(ruleData, docContext);
		registerLayerDeclaration(layerStack, layerSegments, conditionalStack, docContext);
		collectStylesheetLayerOrder(ruleData.block.children, { layerStack: [...layerStack, ...layerSegments], conditionalStack }, docContext);
	} else if (ruleData.prelude) {
		getPreludeText(ruleData.prelude, docContext).split(PRELUDE_SEPARATOR).forEach(layerName => registerLayerDeclaration(layerStack, splitLayerName(layerName), conditionalStack, docContext));
	}
}

function collectImportLayerOrder(ruleData, layerContext, docContext) {
	const urlNode = ruleData.prelude.children.head.data;
	const conditionalStack = buildImportConditionalStack(layerContext.conditionalStack, urlNode);
	const layerSegments = getImportLayerSegments(ruleData, urlNode, docContext);
	let { layerStack } = layerContext;
	if (layerSegments) {
		registerLayerDeclaration(layerStack, layerSegments, conditionalStack, docContext);
		layerStack = [...layerStack, ...layerSegments];
	}
	collectStylesheetLayerOrder(urlNode.importedChildren, { layerStack, conditionalStack }, docContext);
}

function getLayerSegments(ruleData, docContext) {
	if (!ruleData.layerSegments) {
		ruleData.layerSegments = ruleData.prelude ? splitLayerName(getPreludeText(ruleData.prelude, docContext)) : [createAnonymousLayerSegment(docContext)];
	}
	return ruleData.layerSegments;
}

function splitLayerName(layerName) {
	const name = layerName.trim();
	const segments = [];
	let segment = EMPTY_STRING;
	for (let index = 0; index < name.length; index++) {
		const character = name.charAt(index);
		if (character === ESCAPE_CHARACTER && index + 1 < name.length) {
			segment += character + name.charAt(index + 1);
			index++;
		} else if (character === LAYER_NAME_SEPARATOR) {
			segments.push(decodeIdentifier(segment));
			segment = EMPTY_STRING;
		} else {
			segment += character;
		}
	}
	segments.push(decodeIdentifier(segment));
	return segments;
}

function decodeIdentifier(identifier) {
	if (identifier.indexOf(ESCAPE_CHARACTER) === -1) {
		return identifier;
	}
	return identifier.replace(CSS_ESCAPE_TEST, (match, hexadecimalDigits, character) => {
		if (hexadecimalDigits === undefined) {
			return character;
		}
		const codePoint = parseInt(hexadecimalDigits, HEXADECIMAL_RADIX);
		return codePoint === 0 || codePoint > MAX_CODE_POINT || (codePoint >= SURROGATE_FIRST_CODE_POINT && codePoint <= SURROGATE_LAST_CODE_POINT)
			? REPLACEMENT_CHARACTER
			: String.fromCodePoint(codePoint);
	});
}

function createAnonymousLayerSegment(docContext) {
	return ANONYMOUS_LAYER_PREFIX + docContext.anonymousLayerCounter++;
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

function getImportLayerSegments(ruleData, urlNode, docContext) {
	if (urlNode.importedLayerName !== undefined) {
		return splitLayerName(urlNode.importedLayerName);
	}
	if (!urlNode.anonymousLayerSegments) {
		const layerKeyword = cssTree.find(ruleData.prelude, node => node.type === IDENTIFIER_TYPE && node.name.toLowerCase() === LAYER_NAME);
		urlNode.anonymousLayerSegments = layerKeyword ? [createAnonymousLayerSegment(docContext)] : null;
	}
	return urlNode.anonymousLayerSegments;
}

function isImportRule(ruleData) {
	return ruleData.type === AT_RULE_TYPE && ruleData.name === IMPORT_NAME && hasChildNodes(ruleData.prelude) && Boolean(ruleData.prelude.children.head.data.importedChildren);
}

function registerLayerDeclaration(layerStack, layerSegments, conditionalStack, docContext) {
	const position = docContext.layerDeclarationCounter++;
	const certain = !conditionalStack.some(context => UNCERTAIN_CONDITIONAL_AT_RULE_NAMES.has(context.name));
	const segments = [...layerStack, ...layerSegments];
	for (let length = layerStack.length + 1; length <= segments.length; length++) {
		const fullLayerName = getFullLayerName(segments.slice(0, length));
		const layerPosition = docContext.layerOrder.get(fullLayerName);
		if (!layerPosition) {
			docContext.layerOrder.set(fullLayerName, { first: position, firstCertain: certain ? position : UNDECLARED_LAYER_POSITION });
		} else if (certain && layerPosition.firstCertain === UNDECLARED_LAYER_POSITION) {
			layerPosition.firstCertain = position;
		}
	}
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
	const layerSegments = getImportLayerSegments(ruleData, urlNode, docContext);
	const layerStack = layerSegments ? [...processingContext.layerStack, ...layerSegments] : processingContext.layerStack;
	minifyStylesheetRules(urlNode.importedChildren, stylesheets, {
		...processingContext,
		layerStack,
		conditionalStack,
		hasDefaultNamespace: processingContext.hasDefaultNamespace || hasDefaultNamespace(urlNode.importedChildren)
	}, docContext);
}

function minifyLayerRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	const layerSegments = getLayerSegments(ruleData, docContext);
	const layerStack = [...processingContext.layerStack, ...layerSegments];
	if (!docContext.layerOrder.has(getFullLayerName(layerStack))) {
		registerLayerDeclaration(processingContext.layerStack, layerSegments, processingContext.conditionalStack, docContext);
	}
	const newProcessingContext = { ...processingContext, layerStack };
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
	const includeAnalysis = analyzeScopeSelectors(includeSelectors, processingContext.hasDefaultNamespace);
	const excludeAnalysis = analyzeScopeSelectors(excludeSelectors, processingContext.hasDefaultNamespace);
	let rootElements = [];
	if (includeSelectors.length) {
		rootElements = collectScopeRootElements(includeSelectors, scopeStack, docContext);
		if (!rootElements.length && includeAnalysis.hasNestedUnqueryablePseudoClass) {
			rootElements = scopeStack.length ? Array.from(scopeStack[scopeStack.length - 1].rootElements) : getDefaultScopeRoots(docContext);
		}
	} else {
		rootElements = getImplicitScopeRoots(processingContext.ownerElement, docContext);
	}
	const uniqueRoots = Array.from(new Set(rootElements.filter(Boolean)));
	if (!uniqueRoots.length) {
		return null;
	}
	const boundaryElements = collectScopeBoundaryElements(excludeSelectors, uniqueRoots, docContext, processingContext.hasDefaultNamespace);
	return {
		id: docContext.scopeIdCounter++,
		rootElements: new Set(uniqueRoots),
		stopElements: boundaryElements,
		hasUnqueryableSelector: includeAnalysis.hasUnqueryableSelector || excludeAnalysis.hasUnqueryableSelector,
		hasNestedUnqueryablePseudoClass: includeAnalysis.hasNestedUnqueryablePseudoClass
	};
}

function analyzeScopeSelectors(selectors, defaultNamespace) {
	const analysis = { hasUnqueryableSelector: false, hasNestedUnqueryablePseudoClass: false };
	selectors.forEach(selectorInfo => {
		const { hasUnqueryableSelector, hasNestedUnqueryablePseudoClass } = analyzeSelector(selectorInfo.data, defaultNamespace);
		analysis.hasUnqueryableSelector ||= hasUnqueryableSelector;
		analysis.hasNestedUnqueryablePseudoClass ||= hasNestedUnqueryablePseudoClass;
	});
	return analysis;
}

function collectScopeRootElements(includeSelectors, scopeStack, docContext) {
	const roots = new Set();
	includeSelectors.forEach(selectorInfo => {
		const selectorText = sanitizeSelector(selectorInfo, docContext);
		const matchedNodes = scopeStack.length
			? matchElementsInScope(getScopedSelectorText(selectorText, docContext), scopeStack)
			: querySelectorAll(docContext.doc, selectorText);
		filterElementsByScopes(matchedNodes, scopeStack).forEach(match => roots.add(match));
	});
	return Array.from(roots);
}

function collectScopeBoundaryElements(excludeSelectors, rootElements, docContext, defaultNamespace) {
	const boundaries = new Map();
	if (!excludeSelectors.length || !rootElements.length) {
		return boundaries;
	}
	excludeSelectors.forEach(selectorInfo => {
		const { hasUnqueryableSelector, hasNestedUnqueryablePseudoClass } = analyzeSelector(selectorInfo.data, defaultNamespace);
		if (!hasUnqueryableSelector && !hasNestedUnqueryablePseudoClass) {
			const selectorText = getScopedSelectorText(sanitizeSelector(selectorInfo, docContext), docContext);
			rootElements.forEach(root => {
				const rootBoundaries = boundaries.get(root) || new Set();
				matchSelectorWithinRoot(root, selectorText).forEach(node => rootBoundaries.add(node));
				if (rootBoundaries.size) {
					boundaries.set(root, rootBoundaries);
				}
			});
		}
	});
	return boundaries;
}

function hasDefaultNamespace(cssRules) {
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type === AT_RULE_TYPE && ruleData.name && ruleData.name.toLowerCase() === NAMESPACE_AT_RULE_NAME) {
			const prelude = ruleData.prelude && ruleData.prelude.children && ruleData.prelude.children.head;
			if (prelude && (prelude.data.type === URL_TYPE || prelude.data.type === STRING_TYPE)) {
				return true;
			}
		}
	}
	return false;
}

function getStylesheetOwnerElement(key) {
	if (key && key.element) {
		return key.element;
	}
	return key && key.nodeType === 1 ? key : null;
}

function getImplicitScopeRoots(ownerElement, docContext) {
	if (ownerElement && ownerElement.parentElement) {
		return [ownerElement.parentElement];
	}
	return getDefaultScopeRoots(docContext);
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
	expandRawCssRules(ruleData);
	const removedSelectors = getRemovableSelectors(ruleData, processSelectors(ruleData, processingContext, docContext), docContext);
	const wasDiscarded = removeUnmatchedSelectors(ruleData, removedSelectors, removedRules, cssRule, docContext);
	if (!wasDiscarded && hasChildNodes(ruleData.block)) {
		processNestedRules(ruleData, stylesheets, processingContext, docContext);
	}
}

function processSelectors(ruleData, processingContext, docContext) {
	const removedSelectors = [];
	const { ancestorsSelectors, scopeStack } = processingContext;
	for (let selector = ruleData.prelude.children.head, selectorIndex = 0; selector; selector = selector.next, selectorIndex++) {
		const analysis = analyzeSelector(selector.data, processingContext.hasDefaultNamespace);
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
		const relativeToScope = startsWithCombinator && !(ancestorsSelectors && ancestorsSelectors.length) && Boolean(scopeStack && scopeStack.length);
		const matchedElements = matchElements(selector, ancestorsSelectors, scopeStack, docContext, relativeToScope);
		if (matchedElements.length) {
			if (hasUnqueryableSelector) {
				registerRevertLayerElements(ruleData, matchedElements, docContext);
			} else {
				updateMatchingSelectors(matchedElements, selector, docContext);
			}
		} else if (!hasNestedUnqueryablePseudoClass) {
			removedSelectors.push(selector);
		}
	}
	return removedSelectors;
}

function getRemovableSelectors(ruleData, removedSelectors, docContext) {
	if (!removedSelectors.length || removedSelectors.length === ruleData.prelude.children.size || !hasNestedRules(ruleData)) {
		return removedSelectors;
	}
	const removedSet = new Set(removedSelectors);
	let keptSpecificity = { a: 0, b: 0, c: 0 };
	for (let selector = ruleData.prelude.children.head; selector; selector = selector.next) {
		if (!removedSet.has(selector)) {
			const { specificity } = docContext.selectorData.get(selector);
			if (compareSpecificities(specificity, keptSpecificity) > 0) {
				keptSpecificity = specificity;
			}
		}
	}
	return removedSelectors.filter(selector => compareSpecificities(docContext.selectorData.get(selector).specificity, keptSpecificity) <= 0);
}

function hasNestedRules(ruleData) {
	if (hasChildNodes(ruleData.block)) {
		for (let child = ruleData.block.children.head; child; child = child.next) {
			if (child.data.type !== DECLARATION_TYPE) {
				return true;
			}
		}
	}
	return false;
}

function compareSpecificities(specificityA, specificityB) {
	return (specificityA.a - specificityB.a) || (specificityA.b - specificityB.b) || (specificityA.c - specificityB.c);
}

function analyzeSelector(selector, defaultNamespace) {
	let hasUnqueryableSelector = Boolean(defaultNamespace);
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
	const nestedSelectorText = getNestedSelectorText(selector, ancestorsSelectors, docContext);
	docContext.selectorData.set(selector, {
		specificity: computeMaxSpecificity(nestedSelectorText === null ? selector.data : parseCss(nestedSelectorText, SELECTOR_LIST_CONTEXT)),
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
	let hasWinningRevertLayer = false;
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
			if (hasUncertainLayerOrder(candidates, docContext)) {
				candidates.forEach(candidate => winningDeclarations.add(candidate.declaration));
				return;
			}
			for (let indexCandidate = candidates.length - 1; indexCandidate >= 0; indexCandidate--) {
				const { declaration, validity } = candidates[indexCandidate];
				winningDeclarations.add(declaration);
				if (validity === VALIDITY_VALID) {
					hasWinningRevertLayer ||= hasRevertLayerKeyword(declaration);
					break;
				}
			}
		});
	});
	if (hasWinningRevertLayer || docContext.revertLayerElements.has(element)) {
		allDeclarations.forEach(({ declaration }) => winningDeclarations.add(declaration));
	}
}

function hasUncertainLayerOrder(candidates, docContext) {
	const layerStacks = [new Map(), new Map()];
	candidates.forEach(({ declaration, selector }) => {
		if (selector) {
			const { layerStack } = docContext.selectorData.get(selector);
			layerStacks[declaration.data.important ? CSS_IMPORTANCE_IMPORTANT : CSS_IMPORTANCE_NOT_IMPORTANT].set(getFullLayerName(layerStack), layerStack);
		}
	});
	return layerStacks.some(importanceStacks => {
		const stacks = Array.from(importanceStacks.values());
		for (let indexA = 0; indexA < stacks.length; indexA++) {
			for (let indexB = indexA + 1; indexB < stacks.length; indexB++) {
				if (compareLayers(stacks[indexA], stacks[indexB], docContext) === UNCERTAIN_LAYER_ORDER) {
					return true;
				}
			}
		}
		return false;
	});
}

function registerRevertLayerElements(ruleData, matchedElements, docContext) {
	if (hasRevertLayerDeclaration(ruleData)) {
		matchedElements.forEach(element => docContext.revertLayerElements.add(element));
	}
}

function hasRevertLayerDeclaration(ruleData) {
	if (!hasChildNodes(ruleData.block)) {
		return false;
	}
	for (let child = ruleData.block.children.head; child; child = child.next) {
		if (child.data.type === DECLARATION_TYPE && hasRevertLayerKeyword(child)) {
			return true;
		}
	}
	return false;
}

function hasRevertLayerKeyword(declaration) {
	const { value } = declaration.data;
	if (!value) {
		return false;
	}
	if (value.type === RAW_TYPE) {
		return REVERT_LAYER_TEST.test(decodeIdentifier(value.value));
	}
	return Boolean(cssTree.find(value, node => node.type === IDENTIFIER_TYPE && decodeIdentifier(node.name).toLowerCase() === REVERT_LAYER_KEYWORD));
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
	const { rootElements, stopElements } = scopeStack[scopeStack.length - 1];
	let hops = 0;
	for (let current = element; current; current = current.parentElement) {
		if (rootElements.has(current) && isElementWithinRoot(element, current, stopElements && stopElements.get(current))) {
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
		const stopElements = currentScope.stopElements && currentScope.stopElements.get(root);
		matchSelectorWithinRoot(root, selectorText).forEach(node => {
			if (!stopElements || isElementWithinRoot(node, root, stopElements)) {
				matchedNodes.add(node);
			}
		});
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
	const { rootElements, stopElements } = scopeContext;
	for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
		if (rootElements.has(current) && isElementWithinRoot(element, current, stopElements && stopElements.get(current))) {
			return true;
		}
	}
	return false;
}

function isElementWithinRoot(element, root, stopElements) {
	const ancestors = [];
	for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
		ancestors.push(current);
		if (current === root) {
			return !isPathBlocked(ancestors, stopElements);
		}
	}
	return false;
}

function isPathBlocked(ancestors, stopElements) {
	return Boolean(stopElements) && ancestors.some(ancestor => stopElements.has(ancestor));
}

function createSelectorText(selector, ancestorsSelectors, docContext) {
	const nestedSelectorText = getNestedSelectorText(selector, ancestorsSelectors, docContext);
	if (nestedSelectorText === null) {
		return sanitizeSelector(selector, docContext);
	}
	return sanitizeSelector({ data: parseCss(nestedSelectorText, SELECTOR_LIST_CONTEXT) }, docContext);
}

function getNestedSelectorText(selector, ancestorsSelectors, docContext) {
	if (!ancestorsSelectors || !ancestorsSelectors.length) {
		return null;
	}
	if (!docContext.nestedSelectorTexts.has(selector.data)) {
		docContext.nestedSelectorTexts.set(selector.data, nestSelectorText(getSelectorText(selector.data, docContext), getNestingParentText(ancestorsSelectors, docContext), docContext));
	}
	return docContext.nestedSelectorTexts.get(selector.data);
}

function getNestingParentText(ancestorsSelectors, docContext) {
	const prelude = ancestorsSelectors[ancestorsSelectors.length - 1];
	if (!docContext.nestingParentTexts.has(prelude)) {
		const grandParentText = ancestorsSelectors.length > 1 ? getNestingParentText(ancestorsSelectors.slice(0, -1), docContext) : null;
		const selectorTexts = [];
		for (let parentSelector = prelude.children.head; parentSelector; parentSelector = parentSelector.next) {
			if (!hasPseudoElement(parentSelector.data)) {
				const parentText = getSelectorText(parentSelector.data, docContext);
				selectorTexts.push(grandParentText === null ? parentText : nestSelectorText(parentText, grandParentText, docContext));
			}
		}
		docContext.nestingParentTexts.set(prelude, selectorTexts.length ? IS_PSEUDO_CLASS_PREFIX + selectorTexts.join(PRELUDE_SEPARATOR) + IS_PSEUDO_CLASS_SUFFIX : NO_ELEMENT_SELECTOR);
	}
	return docContext.nestingParentTexts.get(prelude);
}

function hasPseudoElement(selector) {
	return Boolean(cssTree.find(selector, node => node.type === PSEUDO_ELEMENT_SELECTOR_TYPE || (node.type === PSEUDO_CLASS_SELECTOR_TYPE && PSEUDO_ELEMENT_SYNONYMS.has(node.name.toLowerCase()))));
}

function nestSelectorText(selectorText, parentText, docContext) {
	const selector = parseCss(selectorText);
	let hasNestingSelector = false;
	cssTree.walk(selector, {
		visit: NESTING_SELECTOR_TYPE,
		enter(_node, item, list) {
			hasNestingSelector = true;
			list.insertData(getNestingParentNode(parentText, docContext), item);
			list.remove(item);
		}
	});
	if (hasNestingSelector) {
		return cssTree.generate(selector);
	}
	const startsWithCombinator = selector.children.head.data.type === COMBINATOR_NAME;
	return parentText + (startsWithCombinator ? EMPTY_STRING : DESCENDANT_COMBINATOR) + selectorText;
}

function getNestingParentNode(parentText, docContext) {
	if (!docContext.nestingParentNodes.has(parentText)) {
		docContext.nestingParentNodes.set(parentText, parseCss(parentText).children.head.data);
	}
	return cssTree.clone(docContext.nestingParentNodes.get(parentText));
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
		if (layerComparison) {
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
	const comparisonKey = fullLayerNameA + CONTEXT_KEY_SEPARATOR + fullLayerNameB;
	if (!docContext.layerComparisons.has(comparisonKey)) {
		docContext.layerComparisons.set(comparisonKey, compareLayerNames(layersA, layersB, docContext));
	}
	return docContext.layerComparisons.get(comparisonKey);
}

function compareLayerNames(layersA, layersB, docContext) {
	const minLength = Math.min(layersA.length, layersB.length);
	for (let indexLayer = 0; indexLayer < minLength; indexLayer++) {
		if (layersA[indexLayer] !== layersB[indexLayer]) {
			const positionA = docContext.layerOrder.get(getFullLayerName(layersA.slice(0, indexLayer + 1)));
			const positionB = docContext.layerOrder.get(getFullLayerName(layersB.slice(0, indexLayer + 1)));
			if (!positionA || !positionB) {
				return UNCERTAIN_LAYER_ORDER;
			}
			if (positionA.firstCertain < positionB.first) {
				return -1;
			}
			if (positionB.firstCertain < positionA.first) {
				return 1;
			}
			return UNCERTAIN_LAYER_ORDER;
		}
	}
	return layersB.length - layersA.length;
}

function removeStylesheetEmptyRules(cssRules, docContext) {
	const removedRules = new Set();
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type === RULE_TYPE) {
			if (hasChildNodes(ruleData.block)) {
				removeStylesheetEmptyRules(ruleData.block.children, docContext);
			}
			if (!hasChildNodes(ruleData.block)) {
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
			const rawRuleText = getRawRuleText(cssRuleNode.data);
			if (rawRuleText !== null) {
				try {
					const stylesheet = parseCss(rawRuleText, STYLESHEET_CONTEXT);
					for (let stylesheetChild = stylesheet.children.head; stylesheetChild; stylesheetChild = stylesheetChild.next) {
						ruleChildren.push(stylesheetChild);
					}
				} catch (error) {
					if (DEBUG) {
						// eslint-disable-next-line no-console
						console.warn(PARSE_CSS_ERROR_MESSAGE, rawRuleText, error);
					}
				}
			} else {
				ruleChildren.push(cssRuleNode);
			}
		}
	}
	ruleData.block.children.clear();
	ruleChildren.forEach(ruleChild => ruleData.block.children.appendData(ruleChild.data));
}

function getRawRuleText(node) {
	if (node.type === RAW_TYPE && holdsBlock(node.value)) {
		return node.value;
	}
	if (node.type === DECLARATION_TYPE && !node.property.startsWith(CUSTOM_PROPERTY_PREFIX) && node.value.type === RAW_TYPE && holdsBlock(node.value.value) && node.value.value.trimStart().indexOf(BLOCK_OPEN) > 0) {
		return node.property + DECLARATION_SEPARATOR + node.value.value;
	}
	return null;
}

function holdsBlock(text) {
	const blockOpenIndex = text.indexOf(BLOCK_OPEN);
	return blockOpenIndex !== -1 && blockOpenIndex < text.indexOf(BLOCK_CLOSE);
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
	return layers.join(LAYER_NAME_KEY_SEPARATOR);
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