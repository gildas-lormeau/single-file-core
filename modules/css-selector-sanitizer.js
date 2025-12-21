/*
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

const TREE_STRUCTURAL_PSEUDO_CLASSES = [
    "root",
    "empty",
    "first-child",
    "last-child",
    "only-child",
    "first-of-type",
    "last-of-type",
    "only-of-type"
];
const TREE_STRUCTURAL_FUNCTIONAL_PSEUDO_CLASSES = [
    "nth-child",
    "nth-last-child",
    "heading",
    "nth-of-type",
    "nth-last-of-type"
];
const FUNCTIONAL_PSEUDO_CLASSES = [
    "not",
    "is",
    "where",
    "has"
];
export {
    matchUnqueryablePseudoClass,
    sanitizeSelector,
};

function sanitizeSelector(selector, ancestors, docContext) {
    if (!docContext.normalizedSelectorText) {
        docContext.normalizedSelectorText = new WeakMap();
    }
    if (docContext.normalizedSelectorText.has(selector)) {
        return docContext.normalizedSelectorText.get(selector);
    }
    const ast = cssTree.parse(cssTree.generate(selector.data), { context: "selectorList" });
    normalizeSelectorNode(ast, ancestors);
    let normalized = cssTree.generate(ast);
    if (!normalized || !normalized.trim()) {
        normalized = "*";
    }
    docContext.normalizedSelectorText.set(selector, normalized);
    return normalized;
}

function normalizeSelectorNode(selector, ancestors) {
    let current = selector.children.head;
    while (current) {
        const next = current.next;
        const childNode = current.data;
        if (childNode.type === "NestingSelector") {
            if (ancestors && ancestors.length) {
                const lastAncestor = ancestors[ancestors.length - 1];
                let ancestorAst = lastAncestor && lastAncestor.data ? lastAncestor.data : lastAncestor;
                if (ancestorAst && ancestorAst.type === "SelectorList" && ancestorAst.children && ancestorAst.children.tail) {
                    ancestorAst = ancestorAst.children.tail.data;
                }
                if (ancestorAst && ancestorAst.children) {
                    for (let a = ancestorAst.children.head; a; a = a.next) {
                        const cloned = cssTree.clone(a.data);
                        selector.children.insertData(cloned, current);
                    }
                    selector.children.remove(current);
                }
            }
        } else if (childNode.type === "TypeSelector" && typeof childNode.name === "string" && childNode.name.includes("|")) {
            childNode.name = childNode.name.substring(childNode.name.lastIndexOf("|") + 1);
        } else if (childNode.type === "PseudoElementSelector") {
            selector.children.remove(current);
        } else if (childNode.type === "PseudoClassSelector") {
            if (matchUnqueryablePseudoClass(childNode)) {
                removeNode(selector.children, current);
            }
        } else if (childNode.type === "Selector") {
            normalizeSelectorNode(childNode, ancestors);
        }
        current = next;
    }
}

function removeNode(list, item) {
    if (item.prev == null || item.prev.data.type == "Combinator" || item.prev.data.type == "WhiteSpace") {
        list.replace(item, cssTree.parse("*", { context: "selector" }).children.head);
    } else {
        list.remove(item);
    }
}

function matchUnqueryablePseudoClass(pseudoClass) {
    const name = pseudoClass.name.toLowerCase();
    return pseudoClass.children ? (
        !TREE_STRUCTURAL_FUNCTIONAL_PSEUDO_CLASSES.includes(name) &&
        !FUNCTIONAL_PSEUDO_CLASSES.includes(name)
    ) : !TREE_STRUCTURAL_PSEUDO_CLASSES.includes(name);
}