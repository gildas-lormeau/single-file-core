/*
 * Copyright 2010-2026 Gildas Lormeau
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
const MEDIA_SCREEN = "screen";
const MEDIA_PRINT = "print";
const MODIFIER_NOT = "not";
const MEDIA_ATTRIBUTE_NAME = "media";
const MEDIA_AT_RULE_NAME = "media";
const MEDIA_QUERY_LIST_TYPE = "MediaQueryList";
const MEDIA_QUERY_TYPE = "MediaQuery";
const AT_RULE_TYPE = "Atrule";

export {
	process
};

function process(stylesheets) {
	stylesheets.forEach(stylesheetInfo => {
		if (stylesheetInfo.stylesheet) {
			processStylesheet(stylesheetInfo.stylesheet);
		}
	});
	stylesheets.forEach((stylesheetInfo, key) => {
		if (stylesheetInfo.stylesheet) {
			if (key.urlNode) {
				processImportedStylesheet(stylesheetInfo, key);
			} else if (stylesheetInfo.mediaText) {
				processStylesheetElement(stylesheets, stylesheetInfo, key);
			}
		}
	});
}

function processStylesheet(stylesheet) {
	const removedRules = [];
	cssTree.walk(stylesheet, {
		enter(node) {
			if (node.type == MEDIA_QUERY_LIST_TYPE) {
				processMediaQueryList(node);
			}
		},
		leave(node, item, list) {
			if (node.type == AT_RULE_TYPE && node.name.toLowerCase() == MEDIA_AT_RULE_NAME && list) {
				const mediaQueryList = getMediaQueryList(node);
				if (mediaQueryList && isNeverMatching(mediaQueryList)) {
					removedRules.push({ list, item });
				}
			}
		}
	});
	removedRules.forEach(({ list, item }) => list.remove(item));
}

function processImportedStylesheet(stylesheetInfo, key) {
	const mediaQueryList = cssTree.find(key.importNode, node => node.type == MEDIA_QUERY_LIST_TYPE);
	if (mediaQueryList) {
		stylesheetInfo.mediaText = key.urlNode.importedMediaText = cssTree.generate(mediaQueryList);
		if (isNeverMatching(mediaQueryList) && stylesheetInfo.stylesheet.children) {
			stylesheetInfo.stylesheet.children.clear();
		}
	}
}

function processStylesheetElement(stylesheets, stylesheetInfo, key) {
	let mediaQueryList;
	try {
		mediaQueryList = cssTree.parse(stylesheetInfo.mediaText, { context: "mediaQueryList" });
		// eslint-disable-next-line no-unused-vars
	} catch (error) {
		// ignored
	}
	if (mediaQueryList && mediaQueryList.type == MEDIA_QUERY_LIST_TYPE) {
		processMediaQueryList(mediaQueryList);
		if (isNeverMatching(mediaQueryList)) {
			stylesheets.delete(key);
			if (key.element) {
				key.element.remove();
			}
		} else {
			stylesheetInfo.mediaText = cssTree.generate(mediaQueryList);
			if (key.element) {
				key.element.setAttribute(MEDIA_ATTRIBUTE_NAME, stylesheetInfo.mediaText);
			}
		}
	}
}

function processMediaQueryList(mediaQueryList) {
	mediaQueryList.children.forEach(mediaQuery => {
		if (mediaQuery.type == MEDIA_QUERY_TYPE && mediaQuery.mediaType) {
			const mediaType = mediaQuery.mediaType.toLowerCase();
			const negated = Boolean(mediaQuery.modifier) && mediaQuery.modifier.toLowerCase() == MODIFIER_NOT;
			if (mediaType == MEDIA_PRINT) {
				mediaQuery.mediaType = MEDIA_ALL;
				if (!negated) {
					mediaQuery.modifier = null;
				}
			} else if (mediaType == MEDIA_SCREEN) {
				mediaQuery.mediaType = MEDIA_ALL;
				mediaQuery.modifier = negated ? null : MODIFIER_NOT;
				mediaQuery.condition = null;
			}
		}
	});
}

function getMediaQueryList(ruleData) {
	if (ruleData.prelude && ruleData.prelude.children) {
		const mediaQueryList = ruleData.prelude.children.first;
		if (mediaQueryList && mediaQueryList.type == MEDIA_QUERY_LIST_TYPE) {
			return mediaQueryList;
		}
	}
}

function isNeverMatching(mediaQueryList) {
	return !mediaQueryList.children.isEmpty && mediaQueryList.children.toArray().every(mediaQuery =>
		mediaQuery.type == MEDIA_QUERY_TYPE &&
		mediaQuery.modifier == MODIFIER_NOT &&
		mediaQuery.mediaType == MEDIA_ALL &&
		!mediaQuery.condition);
}
