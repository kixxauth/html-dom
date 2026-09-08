/**
 * @module selector-matcher
 */

import { parseSelector } from './selector-parser.js';

function typeKey(element) {
    return element.isForeign ? element.rawName : element.localName;
}

function previousElementSibling(element) {
    const parent = element.parentNode;
    if (!parent) {
        return null;
    }

    const siblings = parent.childNodes;
    const index = siblings.indexOf(element);

    for (let i = index - 1; i >= 0; i -= 1) {
        if (siblings[i].nodeType === 1) {
            return siblings[i];
        }
    }

    return null;
}

// Element-only siblings (including `element` itself) in document order,
// optionally narrowed to those sharing `element`'s type — the distinction
// between the plain "-child" and "-of-type" pseudo-classes.
function siblingsFor(element, sameTypeOnly) {
    const parent = element.parentNode;
    const all = parent ? parent.children : [ element ];

    if (!sameTypeOnly) {
        return all;
    }

    const key = typeKey(element);
    return all.filter((candidate) => typeKey(candidate) === key);
}

function positionAmongSiblings(element, sameTypeOnly) {
    const siblings = siblingsFor(element, sameTypeOnly);
    return siblings.indexOf(element) + 1;
}

function positionFromEndAmongSiblings(element, sameTypeOnly) {
    const siblings = siblingsFor(element, sameTypeOnly);
    return siblings.length - siblings.indexOf(element);
}

// An, per the CSS An+B microsyntax: true when there exists an integer n >= 0
// such that a*n + b === position.
function matchesNth(position, { a, b }) {
    if (a === 0) {
        return position === b;
    }
    const n = (position - b) / a;
    return Number.isInteger(n) && n >= 0;
}

function isEmptyElement(element) {
    return element.childNodes.every((node) => {
        if (node.nodeType === 1) {
            return false;
        }
        if (node.nodeType === 3) {
            return node.data.length === 0;
        }
        return true;
    });
}

function matchesAttribute(element, attribute) {
    const value = element.getAttribute(attribute.name);

    if (value === null) {
        return false;
    }
    if (attribute.operator === null) {
        return true;
    }

    let actual = value;
    let expected = attribute.value;

    if (attribute.caseInsensitive) {
        actual = actual.toLowerCase();
        expected = expected.toLowerCase();
    }

    switch (attribute.operator) {
        case '=':
            return actual === expected;
        case '~=':
            return actual.split(/\s+/u).filter(Boolean).includes(expected);
        case '|=':
            return actual === expected || actual.startsWith(`${ expected }-`);
        case '^=':
            return expected !== '' && actual.startsWith(expected);
        case '$=':
            return expected !== '' && actual.endsWith(expected);
        case '*=':
            return expected !== '' && actual.includes(expected);
        default:
            return false;
    }
}

function matchesPseudo(element, pseudo) {
    switch (pseudo.name) {
        case 'root':
            return Boolean(element.parentNode) && element.parentNode.nodeType === 9;
        case 'empty':
            return isEmptyElement(element);
        case 'first-child':
            return positionAmongSiblings(element, false) === 1;
        case 'last-child':
            return positionFromEndAmongSiblings(element, false) === 1;
        case 'only-child':
            return positionAmongSiblings(element, false) === 1 && positionFromEndAmongSiblings(element, false) === 1;
        case 'first-of-type':
            return positionAmongSiblings(element, true) === 1;
        case 'last-of-type':
            return positionFromEndAmongSiblings(element, true) === 1;
        case 'only-of-type':
            return positionAmongSiblings(element, true) === 1 && positionFromEndAmongSiblings(element, true) === 1;
        case 'nth-child':
            return matchesNth(positionAmongSiblings(element, false), pseudo.argument);
        case 'nth-last-child':
            return matchesNth(positionFromEndAmongSiblings(element, false), pseudo.argument);
        case 'nth-of-type':
            return matchesNth(positionAmongSiblings(element, true), pseudo.argument);
        case 'nth-last-of-type':
            return matchesNth(positionFromEndAmongSiblings(element, true), pseudo.argument);
        case 'not':
            return !matchesAnySelector(element, pseudo.argument);
        case 'is':
        case 'where':
            return matchesAnySelector(element, pseudo.argument);
        default:
            return false;
    }
}

function matchesCompound(element, compound) {
    if (compound.tag !== null) {
        const matchesTag = element.isForeign
            ? element.rawName === compound.rawTag
            : element.localName === compound.tag;

        if (!matchesTag) {
            return false;
        }
    }

    if (compound.id !== null && element.id !== compound.id) {
        return false;
    }

    if (!compound.classes.every((token) => element.classList.contains(token))) {
        return false;
    }

    if (!compound.attributes.every((attribute) => matchesAttribute(element, attribute))) {
        return false;
    }

    return compound.pseudos.every((pseudo) => matchesPseudo(element, pseudo));
}

// Matches right to left: the rightmost compound is tested against `element`
// first, and only on success does matching walk left through the
// combinator chain — so a candidate that fails on its own compound never
// pays for a tree walk.
function matchesComplex(element, chain) {
    if (!matchesCompound(element, chain.compound)) {
        return false;
    }
    if (chain.combinator === null) {
        return true;
    }
    return matchesCombinatorLeft(element, chain.combinator, chain.left);
}

function matchesCombinatorLeft(element, combinator, leftChain) {
    if (combinator === '>') {
        const parent = element.parentElement;
        return Boolean(parent) && matchesComplex(parent, leftChain);
    }

    if (combinator === ' ') {
        let ancestor = element.parentElement;
        while (ancestor) {
            if (matchesComplex(ancestor, leftChain)) {
                return true;
            }
            ancestor = ancestor.parentElement;
        }
        return false;
    }

    if (combinator === '+') {
        const sibling = previousElementSibling(element);
        return Boolean(sibling) && matchesComplex(sibling, leftChain);
    }

    // '~'
    let sibling = previousElementSibling(element);
    while (sibling) {
        if (matchesComplex(sibling, leftChain)) {
            return true;
        }
        sibling = previousElementSibling(sibling);
    }
    return false;
}

function matchesAnySelector(element, selectorList) {
    return selectorList.some((chain) => matchesComplex(element, chain));
}

// Yields every descendant Element of `root` in document order, using an
// explicit stack rather than recursion so a pathologically deep tree cannot
// overflow the call stack.
function* iterateDescendants(root) {
    const stack = [];
    const children = root.children;
    for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push(children[i]);
    }

    while (stack.length > 0) {
        const node = stack.pop();
        yield node;

        const kids = node.children;
        for (let i = kids.length - 1; i >= 0; i -= 1) {
            stack.push(kids[i]);
        }
    }
}

/**
 * @param {Element} element - The element to test.
 * @param {string} selectorText - A CSS selector.
 * @returns {boolean} Whether `element` matches `selectorText`.
 * @throws {SelectorSyntaxError} When `selectorText` is invalid.
 */
export function matches(element, selectorText) {
    return matchesAnySelector(element, parseSelector(selectorText));
}

/**
 * @param {ParentNode} scope - The element or document to search within.
 * @param {string} selectorText - A CSS selector.
 * @returns {Element|null} The first descendant of `scope` matching
 *   `selectorText`, in document order, or `null`.
 * @throws {SelectorSyntaxError} When `selectorText` is invalid.
 */
export function querySelector(scope, selectorText) {
    const ast = parseSelector(selectorText);

    for (const element of iterateDescendants(scope)) {
        if (matchesAnySelector(element, ast)) {
            return element;
        }
    }

    return null;
}

/**
 * @param {ParentNode} scope - The element or document to search within.
 * @param {string} selectorText - A CSS selector.
 * @returns {Element[]} Every descendant of `scope` matching `selectorText`,
 *   in document order, deduplicated across a comma-separated selector list.
 * @throws {SelectorSyntaxError} When `selectorText` is invalid.
 */
export function querySelectorAll(scope, selectorText) {
    const ast = parseSelector(selectorText);
    const results = [];

    for (const element of iterateDescendants(scope)) {
        if (matchesAnySelector(element, ast)) {
            results.push(element);
        }
    }

    return Object.freeze(results);
}

/**
 * @param {Element} element - The element to start from.
 * @param {string} selectorText - A CSS selector.
 * @returns {Element|null} `element` itself if it matches, otherwise the
 *   nearest matching ancestor, stopping at `documentElement`. `null` when
 *   nothing matches.
 * @throws {SelectorSyntaxError} When `selectorText` is invalid.
 */
export function closest(element, selectorText) {
    const ast = parseSelector(selectorText);

    let current = element;
    while (current) {
        if (matchesAnySelector(current, ast)) {
            return current;
        }
        current = current.parentElement;
    }

    return null;
}
