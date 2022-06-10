/*
 * The MIT License (MIT)
 * 
 * Author: Gildas Lormeau
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// derived from https://github.com/jedmao/parse-css-font/

/*
 * The MIT License (MIT)
 * 
 * Copyright (c) 2015 Jed Mao
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import * as cssTree from "./css-tree.js";
const REGEXP_SIMPLE_QUOTES_STRING = /^'(.*?)'$/;
const REGEXP_DOUBLE_QUOTES_STRING = /^"(.*?)"$/;

const globalKeywords = [
	"inherit",
	"initial",
	"unset"
];

const systemFontKeywords = [
	"caption",
	"icon",
	"menu",
	"message-box",
	"small-caption",
	"status-bar"
];

const fontWeightKeywords = [
	"normal",
	"bold",
	"bolder",
	"lighter",
	"100",
	"200",
	"300",
	"400",
	"500",
	"600",
	"700",
	"800",
	"900"
];

const fontStyleKeywords = [
	"normal",
	"italic",
	"oblique"
];

const fontStretchKeywords = [
	"normal",
	"condensed",
	"semi-condensed",
	"extra-condensed",
	"ultra-condensed",
	"expanded",
	"semi-expanded",
	"extra-expanded",
	"ultra-expanded"
];

const errorPrefix = "[parse-css-font] ";

export {
	parse
};

function parse(value) {
	const stringValue = cssTree.generate(value);
	if (systemFontKeywords.indexOf(stringValue) !== -1) {
		return { system: stringValue };
	}
	const tokens = value.children;

	const font = {
		lineHeight: "normal",
		stretch: "normal",
		style: "normal",
		variant: "normal",
		weight: "normal",
	};

	let isLocked = false;
	for (let tokenNode = tokens.head; tokenNode; tokenNode = tokenNode.next) {
		const token = cssTree.generate(tokenNode.data);
		if (token === "normal" || globalKeywords.indexOf(token) !== -1) {
			["style", "variant", "weight", "stretch"].forEach((prop) => {
				font[prop] = token;
			});
			isLocked = true;
			continue;
		}

		if (fontWeightKeywords.indexOf(token) !== -1) {
			if (isLocked) {
				continue;
			}
			font.weight = token;
			continue;
		}

		if (fontStyleKeywords.indexOf(token) !== -1) {
			if (isLocked) {
				continue;
			}
			font.style = token;
			continue;
		}

		if (fontStretchKeywords.indexOf(token) !== -1) {
			if (isLocked) {
				continue;
			}
			font.stretch = token;
			continue;
		}

		if (tokenNode.data.type == "Dimension") {
			font.size = cssTree.generate(tokenNode.data);
			tokenNode = tokenNode.next;
			if (tokenNode && tokenNode.data.type == "Operator" && tokenNode.data.value == "/" && tokenNode.next) {
				tokenNode = tokenNode.next;
				font.lineHeight = cssTree.generate(tokenNode.data);
				tokenNode = tokenNode.next;
			} else if (tokens.head.data.type == "Operator" && tokens.head.data.value == "/" && tokens.head.next) {
				font.lineHeight = cssTree.generate(tokens.head.next.data);
				tokenNode = tokens.head.next.next;
			}
			if (!tokenNode) {
				throw error("Missing required font-family.");
			}
			font.family = [];
			for (; tokenNode; tokenNode = tokenNode.next) {
				while (tokenNode && tokenNode.data.type == "Operator" && tokenNode.data.value == ",") {
					tokenNode = tokenNode.next;
				}
				if (tokenNode) {
					font.family.push(removeQuotes(cssTree.generate(tokenNode.data)));
				}
			}
			return font;
		}

		if (font.variant !== "normal") {
			throw error("Unknown or unsupported font token: " + font.variant);
		}

		if (isLocked) {
			continue;
		}
		font.variant = token;
	}

	throw error("Missing required font-size.");
}

function error(message) {
	return new Error(errorPrefix + message);
}

function removeQuotes(string) {
	if (string.match(REGEXP_SIMPLE_QUOTES_STRING)) {
		string = string.replace(REGEXP_SIMPLE_QUOTES_STRING, "$1");
	} else {
		string = string.replace(REGEXP_DOUBLE_QUOTES_STRING, "$1");
	}
	return string.trim();
}