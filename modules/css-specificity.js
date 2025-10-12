export { computeSpecificity };

function computeSpecificity(selector, specificity = { a: 0, b: 0, c: 0 }) {
    if (!selector || !selector.type) {
        return specificity;
    }
    switch (selector.type) {
        case "Selector":
            traverseChildren(selector.children, (child) => computeSpecificity(child, specificity));
            break;

        case "IdSelector":
            specificity.a++;
            break;

        case "ClassSelector":
            specificity.b++;
            break;

        case "AttributeSelector":
            specificity.b++;
            break;

        case "TypeSelector":
            if (selector.name !== "*") {
                specificity.c++;
            }
            break;

        case "PseudoElementSelector":
            specificity.c++;
            break;

        case "PseudoClassSelector": {
            const pseudoName = selector.name.toLowerCase();

            if (pseudoName === "where") {
                // :where() has zero specificity - do nothing
                break;
            }

            if (pseudoName === "is" || pseudoName === "not" || pseudoName === "has") {
                // :is(), :not(), :has() - use the max specificity from their selector list
                traverseChildren(selector.children, (child) => {
                    if (child.type === "SelectorList") {
                        addMaxSpecificity(specificity, getMaxSpecificityFromList(child));
                    }
                });
                break;
            }

            if (pseudoName === "nth-child" || pseudoName === "nth-last-child") {
                // :nth-child() and :nth-last-child() count as one pseudo-class
                specificity.b++;

                // Plus the max specificity from their selector list (if any)
                traverseChildren(selector.children, (child) => {
                    if (child.type === "Nth" && child.selector) {
                        addMaxSpecificity(specificity, getMaxSpecificityFromList(child.selector));
                    }
                });
                break;
            }

            // Regular pseudo-classes contribute to 'b'
            // Exception: :scope is treated as a type selector (contributes to 'c')
            if (pseudoName === "scope") {
                specificity.c++;
            } else {
                specificity.b++;
            }
            break;
        }

        case "Combinator":
        case "Raw":
            break;
    }

    return specificity;
}

function addMaxSpecificity(specificity, maxSpec) {
    specificity.a += maxSpec.a;
    specificity.b += maxSpec.b;
    specificity.c += maxSpec.c;
}

function traverseChildren(children, callback) {
    if (!children) return;

    let current = children.head;
    while (current) {
        callback(current.data);
        current = current.next;
    }
}

function getMaxSpecificityFromList(selectorList) {
    let maxSpec = { a: 0, b: 0, c: 0 };

    traverseChildren(selectorList.children, (selector) => {
        const spec = computeSpecificity(selector, { a: 0, b: 0, c: 0 });
        if (spec.a > maxSpec.a ||
            (spec.a === maxSpec.a && spec.b > maxSpec.b) ||
            (spec.a === maxSpec.a && spec.b === maxSpec.b && spec.c > maxSpec.c)) {
            maxSpec = spec;
        }
    });

    return maxSpec;
}
