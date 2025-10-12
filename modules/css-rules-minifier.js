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

const IGNORED_PSEUDO_ELEMENTS = ["after", "before", "first-letter", "first-line", "placeholder", "selection", "part", "marker", "grammar-error", "spelling-error", "cue", "cue-region"];
const KEPT_PSEUDO_CLASSES = ["is", "where"];

const matchedSelectorsCache = new Map();

export {
	process
};

function process(doc, stylesheets) {
	const stats = { processed: 0, discarded: 0 };
	try {
		stylesheets.forEach((stylesheetInfo, key) => {
			if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
				const cssRules = stylesheetInfo.stylesheet.children;
				if (cssRules) {
					processStylesheetRules(doc, cssRules, stylesheets, stats);
				}
			}
		});
	} finally {
		matchedSelectorsCache.clear();
	}
	return stats;
}

function processStylesheetRules(doc, cssRules, stylesheets, stats, ancestorsSelectors = []) {
	const removedRules = new Set();
	for (let child = cssRules.head; child; child = child.next) {
		stats.processed++;
		const ruleData = child.data;
		if (ruleData.type == "Atrule" && ruleData.name == "import" && ruleData.prelude && ruleData.prelude.children && ruleData.prelude.children.head.data.importedChildren) {
			processStylesheetRules(doc, ruleData.prelude.children.head.data.importedChildren, stylesheets, stats, ancestorsSelectors);
		} else if (ruleData.type == "Atrule" && ruleData.block && ruleData.name != "font-face" && ruleData.name != "keyframes") {
			processStylesheetRules(doc, ruleData.block.children, stylesheets, stats, ancestorsSelectors);
			if (ruleData.block.children.size == 0) {
				stats.discarded++;
				removedRules.add(child);
			}
		} else if (ruleData.type == "Rule" && ruleData.prelude && ruleData.prelude.children) {
			const selectorsText = ruleData.prelude.children.toArray().map(selector => cssTree.generate(selector));
			const removedSelectors = [];
			for (let selector = ruleData.prelude.children.head, selectorIndex = 0; selector; selector = selector.next, selectorIndex++) {
				if (!matchElements(doc, selector, selectorsText[selectorIndex], ancestorsSelectors)) {
					removedSelectors.push(selector);
				}
			}
			removedSelectors.forEach(selector => ruleData.prelude.children.remove(selector));
			if (ruleData.prelude.children.size == 0) {
				stats.discarded++;
				removedRules.add(child);
			} else if (ruleData.block && ruleData.block.children) {
				fixRawRules(ruleData);
				cleanDeclarations(ruleData.block);
				processStylesheetRules(doc, ruleData.block.children, stylesheets, stats, ancestorsSelectors.concat(ruleData.prelude));
			}
			if (ruleData.block.children.size == 0) {
				stats.discarded++;
				removedRules.add(child);
			}
		}
	}
	removedRules.forEach(rule => cssRules.remove(rule));
}

function matchElements(doc, selector, selectorText, ancestorsSelectors) {
	if (ancestorsSelectors.length) {
		selectorText = combineWithAncestors(selector.data, ancestorsSelectors);
	}
	try {
		const selectorsText = getFilteredSelector(selector, selectorText);
		const cachedResult = matchedSelectorsCache.get(selectorsText);
		if (cachedResult !== undefined) {
			return cachedResult;
		} else {
			const result = Boolean(doc.querySelector(selectorsText));
			matchedSelectorsCache.set(selectorsText, result);
			return result;
		}
		// eslint-disable-next-line no-unused-vars
	} catch (_error) {
		// ignored				
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
		if ((selector.data.type == "PseudoClassSelector" && !KEPT_PSEUDO_CLASSES.includes(selector.data.name)) ||
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

function fixRawRules(ruleData) {
	const children = [];
	if (ruleData.block && ruleData.block.children) {
		for (let child = ruleData.block.children.head; child; child = child.next) {
			if (child.data.type == "Raw") {
				try {
					if (child.data.value.indexOf("{") && child.data.value.indexOf("{") < child.data.value.indexOf("}")) {
						const stylesheet = cssTree.parse(child.data.value, { context: "stylesheet" });
						for (let child = stylesheet.children.head; child; child = child.next) {
							children.push(child);
						}
					} else {
						children.push(child);
					}
					// eslint-disable-next-line no-unused-vars
				} catch (_error) {
					children.push(child);
				}
			} else {
				children.push(child);
			}
		}
	}
	ruleData.block.children.clear();
	children.forEach(child => {
		ruleData.block.children.appendData(child.data);
	});
}

function cleanDeclarations(block) {
	if (!block || !block.children) return;
	const propertyMap = new Map();
	const toRemove = [];
	for (let child = block.children.head; child; child = child.next) {
		if (child.data.type === "Declaration") {
			const prop = child.data.property;
			if (propertyMap.has(prop)) {
				toRemove.push(propertyMap.get(prop));
			}
			propertyMap.set(prop, child);
		}
	}
	toRemove.forEach(child => block.children.remove(child));
}

function combineWithAncestors(selector, ancestorsSelectors) {
	const childText = cssTree.generate(selector);
	if (!ancestorsSelectors || !ancestorsSelectors.length) {
		return childText;
	}
	let contexts = [""];
	ancestorsSelectors.forEach(selectorList => {
		if (!selectorList || !selectorList.children || !selectorList.children.size) {
			return;
		}
		const parentSelectors = selectorList.children.toArray();
		if (!parentSelectors.length) {
			return;
		}
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
		const result = context ? combineSelectors(context, childText) : childText;
		expandedSelectors.add(result);
	});
	return Array.from(expandedSelectors).join(", ");
}

function combineSelectors(parentSelectorText, childSelectorText) {
	const parentText = parentSelectorText.trim();
	const childText = childSelectorText.trim();
	const childAST = cssTree.parse(childText || "&", { context: "selector" });
	const parentAST = parentText ? cssTree.parse(parentText, { context: "selector" }) : null;
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
	const combinedAST = cssTree.parse(`${parentText} ${childText}`, { context: "selector" });
	return cssTree.generate(combinedAST);
}