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
import * as fontPropertyParser from "./../vendor/css-font-property-parser.js";
import { getNestedChildren } from "./css-nested-rules.js";
import {
	normalizeFontFamily,
	flatten,
	getFontWeight,
	getFontStretch,
	getStylesheetsInCascadeOrder,
	removeQuotes
} from "./../core/helper.js";

const helper = {
	normalizeFontFamily,
	flatten,
	getFontWeight,
	getFontStretch,
	getStylesheetsInCascadeOrder,
	removeQuotes
};

const REGEXP_COMMA = /\s*,\s*/;
const REGEXP_SPACES = /\s+/g;
const REGEXP_ANGLE = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(deg|grad|rad|turn)?$/;
const ANGLE_UNITS = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };
const NORMAL_FONT_STYLE = "normal";
const ITALIC_FONT_STYLE = "italic";
const OBLIQUE_FONT_STYLE = "oblique";
const DEFAULT_OBLIQUE_ANGLE = 14;
const NORMAL_FONT_STRETCH = 100;
const LOWER_WEIGHT_SEARCH_THRESHOLD = 400;
const UPPER_WEIGHT_SEARCH_THRESHOLD = 500;
const GECKO_REVERSE_STRETCH_DISTANCE = 1000;
const GECKO_REVERSE_STYLE_DISTANCE = 100;
const GECKO_NEGATE_STYLE_DISTANCE = 200;
const GECKO_BAD_STYLE_DISTANCE = 700;
const GECKO_REVERSE_WEIGHT_DISTANCE = 600;
const GECKO_LIGHTER_WEIGHT_DISTANCE = 100;
const FONT_MATCHING_ALGORITHMS = [
	{ getStretchDistance: getWebKitStretchDistance, getStyleDistance: getWebKitStyleDistance, getWeightDistance: getWebKitWeightDistance },
	{ getStretchDistance: getWebKitStretchDistance, getStyleDistance: getWebKitObliqueStyleDistance, getWeightDistance: getWebKitWeightDistance },
	{ getStretchDistance: getGeckoStretchDistance, getStyleDistance: getGeckoStyleDistance, getWeightDistance: getGeckoWeightDistance }
];
const REGEXP_DASH = /-/;
const REGEXP_QUESTION_MARK = /\?/g;
const REGEXP_STARTS_U_PLUS = /^U\+/i;
const REGEXP_CUSTOM_PROPERTY = /var\(\s*(--[^\s,)]+)\s*(?:,[^)]*)?\)/g;
const REGEXP_CUSTOM_PROPERTY_FAMILY = /^var\(\s*(--[^\s,)]+)\s*(?:,(.*))?\)$/;
const REGEXP_CUSTOM_PROPERTY_NAME = /^--/;
const NON_GLYPH_CHAR_CODES = [9, 10, 12, 13];
const MAX_NON_GLYPH_CHAR_CODE = 13;
// a family name kept when the "font" shorthand cannot be read: it resolves to nothing, so it
// survives the substitution below and marks the fonts as undetermined instead of unused
const UNRESOLVED_CUSTOM_PROPERTY_FAMILY = "var(--)";

export {
	process
};

function process(doc, stylesheets, styles, options) {
	const stats = { rules: { processed: 0, discarded: 0 }, fonts: { processed: 0, discarded: 0 } };
	const fontsInfo = { declared: [], used: [] };
	const customProperties = new Map();
	const workStyleElement = doc.createElement("style");
	let docContent = "";
	doc.body.appendChild(workStyleElement);
	// the custom properties are collected first: a family or a "font" shorthand can be resolved
	// with a property that a later stylesheet, or a style attribute, declares
	stylesheets.forEach(stylesheetInfo => {
		if (stylesheetInfo.stylesheet && stylesheetInfo.stylesheet.children) {
			getCustomPropertiesInfo(stylesheetInfo.stylesheet.children, customProperties);
		}
	});
	styles.forEach(declarations => getCustomProperties(declarations.children, customProperties));
	options = Object.assign({}, options, { customProperties });
	helper.getStylesheetsInCascadeOrder(stylesheets).forEach(({ stylesheetInfo }) => {
		if (stylesheetInfo.stylesheet) {
			const cssRules = stylesheetInfo.stylesheet.children;
			if (cssRules) {
				stats.processed += cssRules.size;
				stats.discarded += cssRules.size;
				getFontsInfo(cssRules, fontsInfo, options);
				docContent = getRulesTextContent(doc, cssRules, workStyleElement, docContent);
			}
		}
	});
	styles.forEach(declarations => {
		const fontFamilyNames = getFontFamilyNames(declarations, options);
		if (fontFamilyNames.length) {
			fontsInfo.used.push(fontFamilyNames);
		}
		docContent = getDeclarationsTextContent(declarations.children, workStyleElement, docContent);
	});
	workStyleElement.remove();
	docContent += doc.body.innerText;
	fontsInfo.used = fontsInfo.used.map(fontNames => fontNames.map(familyName => resolveFamilyName(familyName, options)));
	fontsInfo.used = fontsInfo.used.map(fontNames => helper.flatten(fontNames));
	const variableFound = fontsInfo.used.find(fontNames => fontNames.find(fontName => fontName.match(/^var\(--/)));
	// an empty list of rendered fonts does not mean the document uses none: every rendered element
	// has a computed font-family, so an empty list means the computed styles could not be read at
	// all. A frame whose contentDocument is unreachable is re-parsed from its srcdoc with
	// DOMParser, and that document is never rendered, so it reports nothing and every face it
	// declares would be dropped
	const usedFontsUnknown = !options.usedFonts || !options.usedFonts.length;
	let unusedFonts, filteredUsedFonts, selectedFonts;
	if (usedFontsUnknown) {
		unusedFonts = [];
	} else {
		filteredUsedFonts = new Map();
		fontsInfo.used.forEach(fontNames => fontNames.forEach(familyName =>
			keepDeclaredFontIfRendered(familyName, fontsInfo, filteredUsedFonts, options)));
		// A family named through a value that could not be resolved cannot be looked up in the
		// stylesheets — but the browser resolved it when it drew the page, so whatever it named is
		// in the list of fonts actually rendered, and that list answers for it.
		//
		// Giving up on the whole document instead, which is what an unresolved name used to do,
		// kept every declared face on any page holding one unreadable value anywhere while every
		// other page pruned as usual. That was not a policy about uncertainty: a page that names
		// its families plainly has always dropped a face it had not drawn yet, and only a page
		// whose value happened not to parse was spared. The difference came from a parse failure,
		// so it is the rendered list that decides in both cases now.
		if (variableFound) {
			fontsInfo.declared.forEach(fontInfo =>
				keepDeclaredFontIfRendered(fontInfo.fontFamily, fontsInfo, filteredUsedFonts, options));
		}
		unusedFonts = fontsInfo.declared.filter(fontInfo => !filteredUsedFonts.has(fontInfo.fontFamily));
		selectedFonts = getSelectedFonts(fontsInfo.declared, filteredUsedFonts);
	}
	const docChars = Array.from(new Set(docContent)).map(char => char.codePointAt(0)).sort((value1, value2) => value1 - value2);
	const usedFontsCharacters = getUsedFontsCharacters(options);
	stylesheets.forEach(stylesheetInfo => {
		if (stylesheetInfo.stylesheet) {
			const cssRules = stylesheetInfo.stylesheet.children;
			if (cssRules) {
				filterUnusedFonts(cssRules, fontsInfo.declared, unusedFonts, selectedFonts, docChars, usedFontsCharacters);
				stats.rules.discarded -= cssRules.size;
			}
		}
	});
	return stats;
}

// a face is kept when the page declares it and the browser reports having drawn with it: the
// stylesheets say what exists, the rendered list says what was needed
function keepDeclaredFontIfRendered(familyName, fontsInfo, filteredUsedFonts, options) {
	if (fontsInfo.declared.find(fontInfo => fontInfo.fontFamily == familyName)) {
		const optionalData = options.usedFonts.filter(fontInfo => fontInfo[0] == familyName);
		if (optionalData.length) {
			filteredUsedFonts.set(familyName, optionalData);
		}
	}
}

function getFontsInfo(cssRules, fontsInfo, options) {
	cssRules.forEach(ruleData => {
		if (ruleData.type == "Atrule" && ruleData.name == "font-face") {
			const fontFamily = helper.normalizeFontFamily(getDeclarationValue(ruleData.block.children, "font-family"));
			if (fontFamily) {
				const fontWeight = getDeclarationValue(ruleData.block.children, "font-weight") || "400";
				const fontStyle = getDeclarationValue(ruleData.block.children, "font-style") || "normal";
				const fontVariant = getDeclarationValue(ruleData.block.children, "font-variant") || "normal";
				const fontStretch = getDeclarationValue(ruleData.block.children, "font-stretch") || "normal";
				const unicodeRange = getDeclarationValue(ruleData.block.children, "unicode-range");
				fontWeight.split(",").forEach(weightValue =>
					fontsInfo.declared.push({ fontFamily, fontWeight: helper.getFontWeight(helper.removeQuotes(weightValue)), fontStyle, fontVariant, fontStretch, unicodeRange, ruleData }));
			}
		} else {
			const children = getNestedChildren(ruleData);
			if (children) {
				const fontFamilyNames = getFontFamilyNames(ruleData.block, options);
				if (fontFamilyNames.length) {
					fontsInfo.used.push(fontFamilyNames);
				}
				getFontsInfo(children, fontsInfo, options);
			}
		}
	});
}

function getCustomPropertiesInfo(cssRules, customProperties) {
	cssRules.forEach(ruleData => {
		if (ruleData.type == "Atrule" && ruleData.name == "import" && ruleData.prelude && ruleData.prelude.children && ruleData.prelude.children.head.data.importedChildren) {
			getCustomPropertiesInfo(ruleData.prelude.children.head.data.importedChildren, customProperties);
		} else {
			const children = getNestedChildren(ruleData);
			if (children) {
				getCustomProperties(children, customProperties);
				getCustomPropertiesInfo(children, customProperties);
			}
		}
	});
}

function getCustomProperties(declarations, customProperties) {
	if (declarations) {
		declarations.forEach(declaration => {
			if (declaration.property && declaration.property.match(REGEXP_CUSTOM_PROPERTY_NAME)) {
				try {
					const value = cssTree.generate(declaration.value).trim();
					if (value) {
						let values = customProperties.get(declaration.property);
						if (!values) {
							values = new Set();
							customProperties.set(declaration.property, values);
						}
						values.add(value);
					}
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					// ignored
				}
			}
		});
	}
}

function getCustomPropertyValues(name, options) {
	let values;
	if (globalThis.getComputedStyle && options.doc) {
		const computedValue = globalThis.getComputedStyle(options.doc.body).getPropertyValue(name);
		if (computedValue && computedValue.trim()) {
			values = [computedValue];
		}
	}
	if (!values) {
		// the property is not inherited by the body: it is declared on a descendant, or in a
		// media query that does not apply, so the value seen by the element using it cannot be
		// determined here. Every value declared for it in the document is taken as a candidate,
		// which still discards the fonts named by none of them
		const declaredValues = options.customProperties && options.customProperties.get(name);
		if (declaredValues && declaredValues.size) {
			values = Array.from(declaredValues);
		}
	}
	return values;
}

function resolveFamilyName(familyName, options, resolvedProperties = new Set()) {
	const matchedVar = familyName.match(REGEXP_CUSTOM_PROPERTY_FAMILY);
	if (matchedVar) {
		const propertyName = matchedVar[1];
		const fallback = matchedVar[2];
		// a property naming itself, directly or through another one, would resolve for ever: the
		// chain already walked is carried down the branch so it stops instead
		if (!resolvedProperties.has(propertyName)) {
			const properties = new Set(resolvedProperties);
			properties.add(propertyName);
			const values = getCustomPropertyValues(propertyName, options);
			if (values) {
				const families = helper.flatten(values.map(value => splitFamilyNames(value, options, properties)));
				const fallbackFamilies = fallback ? splitFamilyNames(fallback, options, properties) : [];
				// the browser takes the property or the fallback, so knowing one branch is not
				// knowing the value: a var() left unresolved in either one keeps the family
				// undetermined, exactly as it was before the nested one could be read at all
				if (!families.concat(fallbackFamilies).some(testUnresolvedFamilyName)) {
					return families.concat(fallbackFamilies);
				}
			}
		}
	}
	return familyName;
}

function testUnresolvedFamilyName(familyName) {
	return typeof familyName == "string" && familyName.startsWith("var(");
}

function splitFamilyNames(value, options, resolvedProperties) {
	const familyNames = splitValues(value).map(familyName => normalizeFamilyName(familyName)).filter(familyName => familyName);
	return options
		? helper.flatten(familyNames.map(familyName => resolveFamilyName(familyName, options, resolvedProperties)))
		: familyNames;
}

// a family list is split on its top-level commas only: the commas inside a var() belong to that
// var(), and the ones inside a quoted name belong to the name. Splitting on every comma is what
// made a var() nested in a fallback unreadable, and it also broke a family named "Foo, Bar"
function splitValues(value) {
	const values = [];
	let depth = 0, quote, start = 0;
	for (let index = 0; index < value.length; index++) {
		const character = value.charAt(index);
		if (quote) {
			if (character == quote && value.charAt(index - 1) != "\\") {
				quote = null;
			}
		} else if (character == "\"" || character == "'") {
			quote = character;
		} else if (character == "(") {
			depth++;
		} else if (character == ")") {
			depth--;
		} else if (character == "," && !depth) {
			values.push(value.substring(start, index));
			start = index + 1;
		}
	}
	values.push(value.substring(start));
	return values;
}

function filterUnusedFonts(cssRules, declaredFonts, unusedFonts, selectedFonts, docChars, usedFontsCharacters) {
	const removedRules = [];
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type == "Atrule" && ruleData.name == "import" && ruleData.prelude && ruleData.prelude.children && ruleData.prelude.children.head.data.importedChildren) {
			filterUnusedFonts(ruleData.prelude.children.head.data.importedChildren, declaredFonts, unusedFonts, selectedFonts, docChars, usedFontsCharacters);
		} else if (getNestedChildren(ruleData)) {
			filterUnusedFonts(ruleData.block.children, declaredFonts, unusedFonts, selectedFonts, docChars, usedFontsCharacters);
		} else if (ruleData.type == "Atrule" && ruleData.name == "font-face") {
			const fontFamily = helper.normalizeFontFamily(getDeclarationValue(ruleData.block.children, "font-family"));
			if (fontFamily) {
				const unicodeRange = getDeclarationValue(ruleData.block.children, "unicode-range");
				const laterUnicodeRanges = getLaterUnicodeRanges(declaredFonts, ruleData);
				if (unusedFonts.find(fontInfo => fontInfo.fontFamily == fontFamily) ||
					!testUnicodeRange(docChars, unicodeRange) ||
					!testReachableUnicodeRange(docChars, unicodeRange, laterUnicodeRanges) ||
					!testDrawnUnicodeRange(ruleData, fontFamily, unicodeRange, usedFontsCharacters, selectedFonts) ||
					!testUsedFont(ruleData, fontFamily, selectedFonts)) {
					removedRules.push(cssRule);
				}
			}
			const removedDeclarations = [];
			for (let declaration = ruleData.block.children.head; declaration; declaration = declaration.next) {
				if (declaration.data.property == "font-display") {
					removedDeclarations.push(declaration);
				}
			}
			if (removedDeclarations.length) {
				removedDeclarations.forEach(removedDeclaration => ruleData.block.children.remove(removedDeclaration));
			}
		}
	}
	removedRules.forEach(cssRule => cssRules.remove(cssRule));
}

function getUsedFontsCharacters(options) {
	const usedFontsCharacters = new Map();
	if (options.usedFontsCharacters && options.usedFontsCharacters.length) {
		options.usedFontsCharacters.forEach(([fontFamily, fontStyle, ranges, unknown]) => {
			let buckets = usedFontsCharacters.get(fontFamily);
			if (!buckets) {
				buckets = [];
				usedFontsCharacters.set(fontFamily, buckets);
			}
			buckets.push({ fontStyle, ranges: ranges || [], unknown: Boolean(unknown) });
		});
	}
	return usedFontsCharacters;
}

function testDrawnUnicodeRange(ruleData, familyName, unicodeRange, usedFontsCharacters, selectedFonts) {
	if (!unicodeRange || !usedFontsCharacters || !usedFontsCharacters.size) {
		return true;
	}
	const buckets = usedFontsCharacters.get(familyName);
	if (!buckets || !buckets.length) {
		return true;
	}
	const selection = selectedFonts && selectedFonts.get(familyName);
	if (!selection || !selection.candidates.has(ruleData) || buckets.find(bucket => !selection.rulesByStyle.has(bucket.fontStyle))) {
		return true;
	}
	const matchedBuckets = buckets.filter(bucket => selection.rulesByStyle.get(bucket.fontStyle).has(ruleData));
	if (!matchedBuckets.length || matchedBuckets.find(bucket => bucket.unknown)) {
		return true;
	}
	if (!matchedBuckets.find(bucket => bucket.ranges.length)) {
		return true;
	}
	const ranges = parseUnicodeRanges(unicodeRange);
	if (!ranges.length) {
		return true;
	}
	return Boolean(matchedBuckets.find(bucket =>
		bucket.ranges.find(drawnRange =>
			ranges.find(range => testDrawnGlyph(drawnRange, range)))));
}

// A tab or a newline is recorded as drawn like any other character, but neither can ever select a
// glyph, so a face whose unicode-range meets the page in nothing else is dead however the page is
// laid out. Google Fonts symbol subsets are exactly that shape: measured on a capture of
// techcrunch.com, two Roboto faces worth 23,505 bytes matched the document in U+0009 and U+000A and
// nothing more.
function testDrawnGlyph(drawnRange, range) {
	const fromCharCode = Math.max(drawnRange[0], range[0]);
	const toCharCode = Math.min(drawnRange[1], range[1]);
	if (fromCharCode > toCharCode) {
		return false;
	}
	if (fromCharCode > MAX_NON_GLYPH_CHAR_CODE || toCharCode > MAX_NON_GLYPH_CHAR_CODE) {
		return true;
	}
	for (let charCode = fromCharCode; charCode <= toCharCode; charCode++) {
		if (!NON_GLYPH_CHAR_CODES.includes(charCode)) {
			return true;
		}
	}
	return false;
}

function testUsedFont(ruleData, familyName, selectedFonts) {
	const selection = selectedFonts && selectedFonts.get(familyName);
	return !selection || !selection.candidates.has(ruleData) || selection.rules.has(ruleData);
}

function getSelectedFonts(declaredFonts, filteredUsedFonts) {
	const selectedFonts = new Map();
	filteredUsedFonts.forEach((usedFonts, familyName) => {
		const fonts = declaredFonts
			.filter(fontInfo => fontInfo.fontFamily == familyName)
			.map(fontInfo => ({
				ruleData: fontInfo.ruleData,
				weight: parseFontWeight(fontInfo.fontWeight),
				style: parseFontStyle(fontInfo.fontStyle),
				stretch: parseFontStretch(fontInfo.fontStretch)
			}))
			.filter(fontInfo => fontInfo.weight && fontInfo.style && fontInfo.stretch);
		const selection = { candidates: new Set(fonts.map(fontInfo => fontInfo.ruleData)), rules: new Set(), rulesByStyle: new Map() };
		usedFonts.forEach(([, fontWeight, fontStyle, , fontStretch]) => {
			let styleRules = selection.rulesByStyle.get(fontStyle);
			if (!styleRules) {
				styleRules = new Set();
				selection.rulesByStyle.set(fontStyle, styleRules);
			}
			FONT_MATCHING_ALGORITHMS.forEach(algorithm => selectFonts(fonts, fontWeight, fontStyle, fontStretch, algorithm).forEach(fontInfo => {
				styleRules.add(fontInfo.ruleData);
				selection.rules.add(fontInfo.ruleData);
			}));
		});
		selectedFonts.set(familyName, selection);
	});
	return selectedFonts;
}

function selectFonts(fonts, fontWeight, fontStyle, fontStretch, algorithm) {
	const stretchBounds = getBounds(fonts.map(fontInfo => fontInfo.stretch));
	const styleBounds = getBounds(fonts.map(fontInfo => fontInfo.style.range));
	const weightBounds = getBounds(fonts.map(fontInfo => fontInfo.weight));
	const stretch = fontStretch && parseFontStretch(fontStretch);
	if (fonts.length && stretch && stretch[0] == stretch[1]) {
		fonts = filterFonts(fonts, fontInfo => fontInfo.stretch, fontInfo => algorithm.getStretchDistance(fontInfo.stretch, stretch[0], stretchBounds));
	}
	const style = fontStyle && parseFontStyle(fontStyle);
	if (fonts.length && style && style.range[0] == style.range[1]) {
		fonts = filterFonts(fonts, fontInfo => fontInfo.style.range, fontInfo => algorithm.getStyleDistance(fontInfo.style, style, styleBounds));
	}
	const weight = fontWeight && parseFontWeight(String(fontWeight));
	if (fonts.length && weight && weight[0] == weight[1]) {
		fonts = filterFonts(fonts, fontInfo => fontInfo.weight, fontInfo => algorithm.getWeightDistance(fontInfo.weight, weight[0], weightBounds));
	}
	return fonts;
}

function filterFonts(fonts, getRange, getDistance) {
	const results = fonts.map(getDistance);
	const distance = Math.min(...results.map(result => result.distance));
	const values = results
		.filter(result => result.distance == distance && result.value !== undefined)
		.map(result => result.value);
	return fonts.filter((fontInfo, index) => results[index].distance == distance || values.some(value => testRange(getRange(fontInfo), value)));
}

function getBounds(ranges) {
	return [Math.min(...ranges.map(([min]) => min)), Math.max(...ranges.map(([, max]) => max))];
}

function getWebKitStretchDistance([min, max], stretch, [boundsMin, boundsMax]) {
	if (testRange([min, max], stretch)) {
		return { distance: 0, value: stretch };
	} else if (stretch > NORMAL_FONT_STRETCH) {
		return min > stretch ? { distance: min - stretch, value: min } : { distance: Math.max(stretch, boundsMax) - max, value: max };
	} else {
		return max < stretch ? { distance: stretch - max, value: max } : { distance: min - Math.min(stretch, boundsMin), value: min };
	}
}

function getWebKitStyleDistance({ range: [min, max] }, { range: [slope] }, [boundsMin, boundsMax]) {
	if (testRange([min, max], slope)) {
		return { distance: 0, value: slope };
	} else if (slope >= DEFAULT_OBLIQUE_ANGLE) {
		return min > slope ? { distance: min - slope, value: min } : { distance: Math.max(slope, boundsMax) - max, value: max };
	} else if (slope >= 0) {
		if (max >= 0 && max < slope) {
			return { distance: slope - max, value: max };
		} else {
			return min > slope ? { distance: min, value: min } : { distance: Math.max(slope, boundsMax) - max, value: max };
		}
	} else if (slope > -DEFAULT_OBLIQUE_ANGLE) {
		if (min > slope && min <= 0) {
			return { distance: min - slope, value: min };
		} else {
			return max < slope ? { distance: -max, value: max } : { distance: min - Math.min(slope, boundsMin), value: min };
		}
	} else {
		return max < slope ? { distance: slope - max, value: max } : { distance: min - Math.min(slope, boundsMin), value: min };
	}
}

function getWebKitObliqueStyleDistance(fontStyle, style, bounds) {
	if (fontStyle.italic && !style.italic) {
		return { distance: Infinity };
	} else {
		return getWebKitStyleDistance(fontStyle, style, bounds);
	}
}

function getWebKitWeightDistance([min, max], weight, [boundsMin, boundsMax]) {
	if (testRange([min, max], weight)) {
		return { distance: 0, value: weight };
	} else if (weight >= LOWER_WEIGHT_SEARCH_THRESHOLD && weight <= UPPER_WEIGHT_SEARCH_THRESHOLD) {
		if (min > weight && min <= UPPER_WEIGHT_SEARCH_THRESHOLD) {
			return { distance: min - weight, value: min };
		} else {
			return max < weight ? { distance: UPPER_WEIGHT_SEARCH_THRESHOLD - max, value: max } : { distance: min - Math.min(weight, boundsMin), value: min };
		}
	} else if (weight < LOWER_WEIGHT_SEARCH_THRESHOLD) {
		return max < weight ? { distance: weight - max, value: max } : { distance: min - Math.min(weight, boundsMin), value: min };
	} else {
		return min > weight ? { distance: min - weight, value: min } : { distance: Math.max(weight, boundsMax) - max, value: max };
	}
}

function getGeckoStretchDistance([min, max], stretch) {
	if (stretch < min) {
		return { distance: min - stretch + (stretch > NORMAL_FONT_STRETCH ? 0 : GECKO_REVERSE_STRETCH_DISTANCE) };
	} else if (stretch > max) {
		return { distance: stretch - max + (stretch <= NORMAL_FONT_STRETCH ? 0 : GECKO_REVERSE_STRETCH_DISTANCE) };
	} else {
		return { distance: 0 };
	}
}

function getGeckoStyleDistance({ italic, range: [min, max] }, style) {
	const [angle] = style.range;
	if (italic ? style.italic : !style.italic && (angle == min || angle == max)) {
		return { distance: 0 };
	} else if (!style.italic && angle == 0) {
		if (italic) {
			return { distance: GECKO_BAD_STYLE_DISTANCE };
		} else if (min >= 0) {
			return { distance: min };
		} else {
			return { distance: max >= 0 ? 0 : GECKO_NEGATE_STYLE_DISTANCE - max };
		}
	} else if (style.italic) {
		if (min >= DEFAULT_OBLIQUE_ANGLE) {
			return { distance: min - DEFAULT_OBLIQUE_ANGLE + 1 };
		} else if (max >= DEFAULT_OBLIQUE_ANGLE) {
			return { distance: 1 };
		} else {
			return { distance: (max > 0 ? GECKO_REVERSE_STYLE_DISTANCE : GECKO_REVERSE_STYLE_DISTANCE + GECKO_NEGATE_STYLE_DISTANCE) + DEFAULT_OBLIQUE_ANGLE - max };
		}
	} else if (italic) {
		return { distance: GECKO_BAD_STYLE_DISTANCE };
	} else if (angle >= DEFAULT_OBLIQUE_ANGLE || angle <= -DEFAULT_OBLIQUE_ANGLE) {
		const sign = Math.sign(angle);
		const [signedMin, signedMax] = sign > 0 ? [min, max] : [-max, -min];
		const signedAngle = sign * angle;
		if (signedMin >= signedAngle) {
			return { distance: signedMin - signedAngle };
		} else if (signedMax >= signedAngle) {
			return { distance: 0 };
		} else {
			return { distance: (signedMax > 0 ? GECKO_REVERSE_STYLE_DISTANCE : GECKO_REVERSE_STYLE_DISTANCE + GECKO_NEGATE_STYLE_DISTANCE) + signedAngle - signedMax };
		}
	} else {
		const sign = angle > 0 ? 1 : -1;
		const [signedMin, signedMax] = sign > 0 ? [min, max] : [-max, -min];
		const signedAngle = sign * angle;
		if (signedMin > signedAngle) {
			return { distance: GECKO_REVERSE_STYLE_DISTANCE + signedMin - signedAngle };
		} else if (signedMax >= signedAngle) {
			return { distance: 0 };
		} else {
			return { distance: (signedMax > 0 ? 0 : GECKO_REVERSE_STYLE_DISTANCE + GECKO_NEGATE_STYLE_DISTANCE) + signedAngle - signedMax };
		}
	}
}

function getGeckoWeightDistance([min, max], weight) {
	if (testRange([min, max], weight)) {
		return { distance: 0 };
	} else if (weight < LOWER_WEIGHT_SEARCH_THRESHOLD) {
		return { distance: max < weight ? weight - max : min - weight + GECKO_REVERSE_WEIGHT_DISTANCE };
	} else if (weight > UPPER_WEIGHT_SEARCH_THRESHOLD) {
		return { distance: min > weight ? min - weight : weight - max + GECKO_REVERSE_WEIGHT_DISTANCE };
	} else if (min > weight) {
		return { distance: min - weight + (min <= UPPER_WEIGHT_SEARCH_THRESHOLD ? 0 : GECKO_REVERSE_WEIGHT_DISTANCE) };
	} else {
		return { distance: weight - max + GECKO_LIGHTER_WEIGHT_DISTANCE };
	}
}

function testRange([min, max], value) {
	return min <= value && value <= max;
}

function parseFontWeight(fontWeight) {
	return parseRange(fontWeight, value => Number(helper.getFontWeight(value)));
}

function parseFontStretch(fontStretch) {
	return parseRange(fontStretch, value => {
		value = helper.getFontStretch(value.toLowerCase());
		return value.endsWith("%") ? Number(value.slice(0, -1)) : NaN;
	});
}

function parseFontStyle(fontStyle) {
	const values = String(fontStyle).trim().toLowerCase().split(REGEXP_SPACES);
	if (values.length == 1 && values[0] == NORMAL_FONT_STYLE) {
		return { italic: false, range: [0, 0] };
	} else if (values.length == 1 && values[0] == ITALIC_FONT_STYLE) {
		return { italic: true, range: [DEFAULT_OBLIQUE_ANGLE, DEFAULT_OBLIQUE_ANGLE] };
	} else if (values[0] == OBLIQUE_FONT_STYLE) {
		const range = values.length == 1 ? [DEFAULT_OBLIQUE_ANGLE, DEFAULT_OBLIQUE_ANGLE] : parseRange(values.slice(1).join(" "), parseAngle);
		if (range) {
			return { italic: false, range };
		}
	}
}

function parseAngle(angle) {
	const match = angle.match(REGEXP_ANGLE);
	if (match && (match[2] || Number(match[1]) == 0)) {
		return Number(match[1]) * ANGLE_UNITS[match[2] || "deg"];
	} else {
		return NaN;
	}
}

function parseRange(value, parseValue) {
	const values = String(value).trim().split(REGEXP_SPACES).map(parseValue);
	if (values.length && values.length <= 2 && values.every(Number.isFinite)) {
		return [Math.min(...values), Math.max(...values)];
	}
}

function getDeclarationValue(declarations, propertyName) {
	let property;
	if (declarations) {
		property = declarations.filter(declaration => declaration.property == propertyName).tail;
	}
	if (property) {
		try {
			return helper.removeQuotes(cssTree.generate(property.data.value)).toLowerCase();
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			// ignored
		}
	}
}

function getFontFamilyNames(declarations, options) {
	let fontFamilyName = declarations.children.filter(node => node.property == "font-family").tail;
	let fontFamilyNames = [];
	if (fontFamilyName) {
		if (fontFamilyName.data.value.children) {
			parseFamilyNames(fontFamilyName.data.value, fontFamilyNames);
		} else {
			fontFamilyName = cssTree.generate(fontFamilyName.data.value);
			if (fontFamilyName) {
				fontFamilyNames.push(normalizeFamilyName(fontFamilyName));
			}
		}
	}
	const font = declarations.children.filter(node => node.property == "font").tail;
	if (font && font.data && font.data.value) {
		const fontValue = cssTree.generate(font.data.value);
		try {
			let value = font.data.value;
			const resolvedFontValue = resolveCustomProperties(fontValue, options);
			if (resolvedFontValue != fontValue) {
				value = cssTree.parse(resolvedFontValue, { context: "value" });
			}
			const parsedFont = fontPropertyParser.parse(value);
			parsedFont.family.forEach(familyName => fontFamilyNames.push(normalizeFamilyName(familyName)));
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			// the shorthand is unreadable, and dropping it here would count the fonts it names as
			// unused: a custom property left in it means the families cannot be determined at all
			if (fontValue.includes("var(")) {
				fontFamilyNames.push(UNRESOLVED_CUSTOM_PROPERTY_FAMILY);
			}
		}
	}
	return fontFamilyNames;
}

function resolveCustomProperties(value, options) {
	return value.replace(REGEXP_CUSTOM_PROPERTY, (property, name) => {
		const values = getCustomPropertyValues(name, options);
		// the shorthand is parsed as a whole, so it can only be substituted with a single value:
		// with several candidates the families it names stay undetermined
		return values && values.length == 1 ? values[0] : property;
	});
}

function normalizeFamilyName(familyName = "") {
	// custom property names are case-sensitive, unlike family names
	return familyName.match(REGEXP_CUSTOM_PROPERTY_FAMILY) ? familyName.trim() : helper.normalizeFontFamily(familyName);
}

function parseFamilyNames(fontFamilyNameTokenData, fontFamilyNames) {
	let nextToken = fontFamilyNameTokenData.children.head;
	while (nextToken) {
		if (nextToken.data.type == "Identifier") {
			let familyName = nextToken.data.name;
			// an unquoted family name is a sequence of identifiers, and the walk has to resume
			// after the last of them: resuming after the first pushes every word but that one
			// again as a family of its own, so "Foo Bar" also claims a font-face named "Bar"
			let nextIdentifierToken = nextToken.next;
			while (nextIdentifierToken && nextIdentifierToken.data.type == "Identifier") {
				familyName += " " + nextIdentifierToken.data.name;
				nextIdentifierToken = nextIdentifierToken.next;
			}
			fontFamilyNames.push(helper.normalizeFontFamily(familyName));
			nextToken = nextIdentifierToken;
		} else if (nextToken.data.type == "Function" && nextToken.data.name == "var" && nextToken.data.children) {
			const varName = nextToken.data.children.head.data.name;
			fontFamilyNames.push("var(" + varName + ")");
			let nextValueToken = nextToken.data.children.head.next;
			while (nextValueToken && nextValueToken.data.type == "Operator" && nextValueToken.data.value == ",") {
				nextValueToken = nextValueToken.next;
			}
			const fallbackToken = nextValueToken;
			if (fallbackToken) {
				if (fallbackToken.data.children) {
					parseFamilyNames(fallbackToken.data, fontFamilyNames);
				} else {
					// the fallback of a var() is parsed as a single raw token, so it still has to
					// be split into the list of families it may hold
					splitFamilyNames(String(fallbackToken.data.value)).forEach(familyName => fontFamilyNames.push(familyName));
				}
			}
			nextToken = nextToken.next;
		} else if (nextToken.data.type == "String") {
			fontFamilyNames.push(helper.normalizeFontFamily(nextToken.data.value));
			nextToken = nextToken.next;
		} else if (nextToken.data.type == "Number") {
			fontFamilyNames.push(helper.normalizeFontFamily(String(nextToken.data.value)));
			nextToken = nextToken.next;
		} else {
			nextToken = nextToken.next;
		}
	}
}

function getRulesTextContent(doc, cssRules, workStylesheet, content) {
	cssRules.forEach(ruleData => {
		const children = getNestedChildren(ruleData);
		if (children) {
			content = getDeclarationsTextContent(children, workStylesheet, content);
			content = getRulesTextContent(doc, children, workStylesheet, content);
		}
	});
	return content;
}

function getDeclarationsTextContent(declarations, workStylesheet, content) {
	const contentText = getDeclarationUnescapedValue(declarations, "content", workStylesheet);
	const quotesText = getDeclarationUnescapedValue(declarations, "quotes", workStylesheet);
	if (!content.includes(contentText)) {
		content += contentText;
	}
	if (!content.includes(quotesText)) {
		content += quotesText;
	}
	return content;
}

function getDeclarationUnescapedValue(declarations, property, workStylesheet) {
	const rawValue = getDeclarationValue(declarations, property) || "";
	if (rawValue) {
		workStylesheet.textContent = "tmp { content:\"" + rawValue + "\"}";
		if (workStylesheet.sheet && workStylesheet.sheet.cssRules) {
			return helper.removeQuotes(workStylesheet.sheet.cssRules[0].style.getPropertyValue("content"));
		} else {
			return rawValue;
		}
	}
	return "";
}

function testUnicodeRange(docCharCodes, unicodeRange) {
	if (unicodeRange) {
		const unicodeRanges = unicodeRange.split(REGEXP_COMMA);
		const result = unicodeRanges.filter(rangeValue => {
			const range = rangeValue.split(REGEXP_DASH);
			if (range.length == 2) {
				range[0] = transformRange(range[0]);
				range[1] = transformRange(range[1]);
			} else if (range.length == 1) {
				if (range[0].includes("?")) {
					const firstRange = range[0];
					const secondRange = firstRange;
					range[0] = transformRange(firstRange.replace(REGEXP_QUESTION_MARK, "0"));
					range[1] = transformRange(secondRange.replace(REGEXP_QUESTION_MARK, "F"));
				} else if (range[0]) {
					range[0] = range[1] = transformRange(range[0]);
				}
			}
			if (!range[0] || docCharCodes.find(charCode => charCode >= range[0] && charCode <= range[1])) {
				return true;
			}
		});
		return Boolean(!unicodeRanges.length || result.length);
	}
	return true;
}

function getLaterUnicodeRanges(declaredFonts, ruleData) {
	const index = declaredFonts.findIndex(fontInfo => fontInfo.ruleData == ruleData);
	if (index == -1) {
		return [];
	}
	const { fontFamily, fontWeight, fontStyle, fontStretch } = declaredFonts[index];
	return declaredFonts
		.slice(index + 1)
		.filter(fontInfo => fontInfo.ruleData != ruleData &&
			fontInfo.fontFamily == fontFamily &&
			fontInfo.fontWeight == fontWeight &&
			fontInfo.fontStyle == fontStyle &&
			fontInfo.fontStretch == fontStretch)
		.map(fontInfo => fontInfo.unicodeRange);
}

function testReachableUnicodeRange(docCharCodes, unicodeRange, laterUnicodeRanges) {
	if (!laterUnicodeRanges.length) {
		return true;
	}
	const laterRanges = helper.flatten(laterUnicodeRanges.map(laterUnicodeRange => parseUnicodeRanges(laterUnicodeRange)));
	if (!laterRanges.length) {
		return true;
	}
	const ranges = parseUnicodeRanges(unicodeRange);
	return Boolean(docCharCodes.find(charCode =>
		(!ranges.length || ranges.find(range => testCharCodeInRange(charCode, range))) &&
		!laterRanges.find(range => testCharCodeInRange(charCode, range))));
}

function testCharCodeInRange(charCode, range) {
	return charCode >= range[0] && charCode <= range[1];
}

function parseUnicodeRanges(unicodeRange) {
	const ranges = [];
	if (unicodeRange) {
		unicodeRange.split(REGEXP_COMMA).forEach(rangeValue => {
			const range = rangeValue.split(REGEXP_DASH);
			let min, max;
			if (range.length == 2) {
				min = transformRange(range[0]);
				max = transformRange(range[1]);
			} else if (range.length == 1 && range[0]) {
				if (range[0].includes("?")) {
					min = transformRange(range[0].replace(REGEXP_QUESTION_MARK, "0"));
					max = transformRange(range[0].replace(REGEXP_QUESTION_MARK, "F"));
				} else {
					min = max = transformRange(range[0]);
				}
			}
			if (Number.isInteger(min) && Number.isInteger(max)) {
				ranges.push([min, max]);
			}
		});
	}
	return ranges;
}

function transformRange(range) {
	range = range.replace(REGEXP_STARTS_U_PLUS, "");
	return parseInt(range, 16);
}