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

const DEFAULT_REPLACED_CHARACTERS = ["~", "+", "?", "%", "*", ":", "|", "\"", "<", ">", "\\\\", "\x00-\x1f", "\x7F"];
const DEFAULT_REPLACEMENT_CHARACTER = "_";
const DEFAULT_REPLACEMENT_CHARACTERS = ["～", "＋", "？", "％", "＊", "：", "｜", "＂", "＜", "＞", "＼"];
const CHARACTER_CLASS_SPECIAL_CHARACTERS = ["[", "]", "^", "-", "\\"];

export {
	getValidFilename,
	DEFAULT_REPLACED_CHARACTERS,
	DEFAULT_REPLACEMENT_CHARACTER,
	DEFAULT_REPLACEMENT_CHARACTERS
};

function getValidFilename(filename, replacedCharacters = DEFAULT_REPLACED_CHARACTERS, replacementCharacter = DEFAULT_REPLACEMENT_CHARACTER, replacementCharacters = DEFAULT_REPLACEMENT_CHARACTERS) {
	replacementCharacters.forEach((indexReplacementCharacter, index) => {
		if (indexReplacementCharacter && replacedCharacters[index] !== undefined && indexReplacementCharacter != replacedCharacters[index]) {
			// no "+" here, unlike the fallback below: a lookalike replaces its character one for
			// one, so collapsing a run would drop characters the name needs ("C++" -> "C＋")
			filename = filename.replace(new RegExp("[" + getCharacterClassContent(replacedCharacters[index]) + "]", "g"), indexReplacementCharacter);
		}
	});
	replacedCharacters.forEach((replacedCharacter, index) => {
		if (!replacementCharacters[index]) {
			filename = filename.replace(new RegExp("[" + getCharacterClassContent(replacedCharacter) + "]+", "g"), replacementCharacter);
		}
	});
	filename = filename
		.replace(/\.\.\//g, "")
		.replace(/^\/+/, "")
		.replace(/\/+/g, "/")
		.replace(/\/$/, "")
		.replace(/\.$/, "")
		.replace(/\.\//g, "." + replacementCharacter)
		.replace(/\/\./g, "/" + replacementCharacter);
	return filename;
}

function getCharacterClassContent(characters) {
	return characters.length == 1 && CHARACTER_CLASS_SPECIAL_CHARACTERS.includes(characters) ? "\\" + characters : characters;
}
