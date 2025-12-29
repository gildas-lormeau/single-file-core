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
import * as cssTree from "../vendor/css-tree.js";

const CANONICAL_PSEUDO_ELEMENT_NAMES = new Set(["after", "before", "first-letter", "first-line", "placeholder", "selection", "part", "marker"]);

export {
  parsePrelude
};

function parsePrelude(prelude) {
  if (!prelude) {
    return { include: [], exclude: [] };
  }

  const scopeNode = findScopeNode(prelude);
  if (!scopeNode) {
    return { include: [], exclude: [] };
  }

  const include = extractSelectorList(scopeNode.root);
  const exclude = extractSelectorList(scopeNode.limit);

  // Validate: pseudo-elements are not allowed in scope start/end selectors
  function containsPseudoElement(selectorAst) {
    let found = false;
    cssTree.walk(selectorAst, {
      visit: "PseudoElementSelector",
      enter() { found = true; }
    });
    if (!found) {
      // also check for pseudo-class names that are treated as pseudo-elements by some authors
      cssTree.walk(selectorAst, {
        visit: "PseudoClassSelector",
        enter(node) {
          const name = (node.name || "").toLowerCase();
          // keep this conservative: disallow known pseudo-element names if used as pseudo-class
          if (CANONICAL_PSEUDO_ELEMENT_NAMES.has(name)) {
            found = true;
          }
        }
      });
    }
    return found;
  }

  for (const s of include) {
    if (containsPseudoElement(s.data)) {
      throw new Error("Pseudo-elements are not allowed in @scope prelude (scope-start)");
    }
  }
  for (const s of exclude) {
    if (containsPseudoElement(s.data)) {
      throw new Error("Pseudo-elements are not allowed in @scope prelude (scope-end)");
    }
  }

  return { include, exclude };
}

function findScopeNode(prelude) {
  if (!prelude || !prelude.children) {
    return null;
  }
  for (let node = prelude.children.head; node; node = node.next) {
    if (node.data && node.data.type === "Scope") {
      return node.data;
    }
  }
  return null;
}

function extractSelectorList(selectorList) {
  if (!selectorList || !selectorList.children) {
    return [];
  }
  const selectors = [];
  for (let node = selectorList.children.head; node; node = node.next) {
    const selector = node.data;
    selectors.push({ data: selector, text: cssTree.generate(selector) });
  }
  return selectors;
}
