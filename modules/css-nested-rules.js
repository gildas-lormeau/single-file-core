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


import { decodeName } from "./css-identifier.js";

const RULE_TYPE = "Rule";
const AT_RULE_TYPE = "Atrule";
const LEAF_AT_RULE_NAMES = ["font-face", "keyframes"];
const REGEXP_VENDOR_PREFIX = /^-[^-]+-/;

export {
	getNestedChildren
};

function getNestedChildren(ruleData) {
	if (ruleData.block && ruleData.block.children) {
		if (ruleData.type == RULE_TYPE) {
			return ruleData.block.children;
		} else if (ruleData.type == AT_RULE_TYPE && typeof ruleData.name == "string" && !LEAF_AT_RULE_NAMES.includes(decodeName(ruleData.name).replace(REGEXP_VENDOR_PREFIX, ""))) {
			return ruleData.block.children;
		}
	}
}
