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

const ESCAPE_CHARACTER = "\\";
const CSS_ESCAPE_TEST = /\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \n\r\t\f])?|([^\n\r\f]))/g;
const REPLACEMENT_CHARACTER = "�";
const MAX_CODE_POINT = 0x10ffff;
const SURROGATE_FIRST_CODE_POINT = 0xd800;
const SURROGATE_LAST_CODE_POINT = 0xdfff;
const HEXADECIMAL_RADIX = 16;

export {
	ESCAPE_CHARACTER,
	decodeIdentifier,
	decodeName
};

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

function decodeName(name) {
	return typeof name === "string" ? decodeIdentifier(name).toLowerCase() : name;
}
