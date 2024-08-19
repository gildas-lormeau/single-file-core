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
		this.mediaAllInfo = createMediaInfo(MEDIA_ALL);
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
						const mediaInfo = createMediaInfo(stylesheetInfo.mediaText);
						this.mediaAllInfo.medias.set("style-" + sheetIndex + "-" + stylesheetInfo.mediaText, mediaInfo);
						getMatchedElementsRules(doc, cssRules, stylesheets, mediaInfo, sheetIndex, styles, matchedElementsCache, workStyleSheet);
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

function createMediaInfo(media) {
	const mediaInfo = {
		media: media,
		elements: new Map(),
		medias: new Map(),
		rules: new Map(),
		pseudoRules: new Map()
	};
	if (media == MEDIA_ALL) {
		mediaInfo.matchedStyles = new Map();
	}
	return mediaInfo;
}

function getMatchedElementsRules(doc, cssRules, stylesheets, mediaInfo, sheetIndex, styles, matchedElementsCache, workStylesheet, indexes = {
	mediaIndex: 0, ruleIndex: 0
}) {
	let startTime;
	if (DEBUG && cssRules.length > 1) {
		startTime = Date.now();
		log("  -- STARTED getMatchedElementsRules", " index =", sheetIndex, "rules.length =", cssRules.length);
	}
	cssRules.forEach(ruleData => {
		if (ruleData.type == "Atrule" && ruleData.name == "import" && ruleData.prelude && ruleData.prelude.children && ruleData.prelude.children.head.data.importedChildren) {
			getMatchedElementsRules(doc, ruleData.prelude.children.head.data.importedChildren, stylesheets, mediaInfo, sheetIndex, styles, matchedElementsCache, workStylesheet, indexes);
		} else if (ruleData.block && ruleData.block.children && ruleData.prelude && ruleData.prelude.children) {
			if (ruleData.type == "Atrule" && ruleData.name == "media") {
				const mediaText = cssTree.generate(ruleData.prelude);
				const ruleMediaInfo = createMediaInfo(mediaText);
				mediaInfo.medias.set("rule-" + sheetIndex + "-" + indexes.mediaIndex + "-" + mediaText, ruleMediaInfo);
				getMatchedElementsRules(doc, ruleData.block.children, stylesheets, ruleMediaInfo, sheetIndex, styles, matchedElementsCache, workStylesheet);
				indexes.mediaIndex++;
			} else if (ruleData.type == "Rule") {
				const selectors = ruleData.prelude.children.toArray();
				const selectorsText = ruleData.prelude.children.toArray().map(selector => cssTree.generate(selector));
				const ruleInfo = { ruleData, mediaInfo, ruleIndex: indexes.ruleIndex, sheetIndex, matchedSelectors: new Set(), declarations: new Set(), selectors, selectorsText };
				if (!invalidSelector(selectorsText.join(","), workStylesheet) || selectorsText.find(selectorText => selectorText.includes("|"))) {
					for (let selector = ruleData.prelude.children.head, selectorIndex = 0; selector; selector = selector.next, selectorIndex++) {
						const selectorText = selectorsText[selectorIndex];
						const selectorInfo = { selector, selectorText, ruleInfo };
						getMatchedElementsSelector(doc, selectorInfo, styles, matchedElementsCache);
					}
				}
				indexes.ruleIndex++;
			}
		}
	});
	if (DEBUG && cssRules.length > 1) {
		log("  -- ENDED   getMatchedElementsRules", "delay =", Date.now() - startTime);
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
				let pseudoSelectors = selectorInfo.ruleInfo.mediaInfo.pseudoRules.get(selectorInfo.ruleInfo.ruleData);
				if (!pseudoSelectors) {
					pseudoSelectors = new Set();
					selectorInfo.ruleInfo.mediaInfo.pseudoRules.set(selectorInfo.ruleInfo.ruleData, pseudoSelectors);
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
	const mediaInfo = selectorInfo.ruleInfo.mediaInfo;
	const elementStyle = styles.get(element);
	let elementInfo = mediaInfo.elements.get(element);
	if (!elementInfo) {
		elementInfo = [];
		if (elementStyle) {
			elementInfo.push({ styleInfo: { styleData: elementStyle, declarations: new Set() } });
		}
		mediaInfo.elements.set(element, elementInfo);
	}
	const specificity = computeSpecificity(selectorInfo.selector.data);
	specificity.ruleIndex = selectorInfo.ruleInfo.ruleIndex;
	specificity.sheetIndex = selectorInfo.ruleInfo.sheetIndex;
	selectorInfo.specificity = specificity;
	elementInfo.push(selectorInfo);
}

function computeCascade(mediaInfo, parentMediaInfo, mediaAllInfo, workStylesheet, workStyleElement) {
	mediaInfo.elements.forEach((elementInfo/*, element*/) =>
		getDeclarationsInfo(elementInfo, workStylesheet, workStyleElement/*, element*/).forEach((declarationsInfo, property) => {
			if (declarationsInfo.selectorInfo.ruleInfo || mediaInfo == mediaAllInfo) {
				let info;
				if (declarationsInfo.selectorInfo.ruleInfo) {
					info = declarationsInfo.selectorInfo.ruleInfo;
					const ruleData = info.ruleData;
					const ascendantMedia = [mediaInfo, ...parentMediaInfo].find(media => media.rules.get(ruleData)) || mediaInfo;
					ascendantMedia.rules.set(ruleData, info);
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
				if (!info.declarations.has(property)) {
					info.declarations.add(property);
				}
			}
		}));
	delete mediaInfo.elements;
	mediaInfo.medias.forEach(childMediaInfo => computeCascade(childMediaInfo, [mediaInfo, ...parentMediaInfo], mediaAllInfo, workStylesheet, workStyleElement));
}

function getDeclarationsInfo(elementInfo, workStylesheet, workStyleElement/*, element*/) {
	const declarationsInfo = new Map();
	const processedProperties = new Set();
	elementInfo.forEach(selectorInfo => {
		let declarations;
		if (selectorInfo.styleInfo) {
			declarations = selectorInfo.styleInfo.styleData.children;
		} else {
			declarations = selectorInfo.ruleInfo.ruleData.block.children;
		}
		processDeclarations(declarationsInfo, declarations, selectorInfo, processedProperties, workStylesheet, workStyleElement);
	});
	return declarationsInfo;
}

function processDeclarations(declarationsInfo, declarations, selectorInfo, processedProperties, workStylesheet, workStyleElement) {
	for (let declaration = declarations.tail; declaration; declaration = declaration.prev) {
		const declarationData = declaration.data;
		const declarationText = cssTree.generate(declarationData);
		if (declarationData.type == "Declaration" &&
			(declarationText.match(REGEXP_VENDOR_IDENTIFIER) || !processedProperties.has(declarationData.property) || declarationData.important) && !invalidDeclaration(declarationText, workStyleElement)) {
			const declarationInfo = declarationsInfo.get(declarationData);
			if (!declarationInfo || (declarationData.important && !declarationInfo.important)) {
				declarationsInfo.set(declarationData, { selectorInfo, important: declarationData.important });
				if (!declarationText.match(REGEXP_VENDOR_IDENTIFIER)) {
					processedProperties.add(declarationData.property);
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

function log(...args) {
	console.log("S-File <css-mat>", ...args); // eslint-disable-line no-console
}