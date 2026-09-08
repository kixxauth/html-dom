/**
 * @module serialize
 */

import { VOID_ELEMENTS, RAW_TEXT_ELEMENTS } from './html-tags.js';

// Two distinct escapers. Text content and attribute values escape a
// different set of characters — an attribute value may contain a literal
// "<" or ">" but not an unescaped '"', and text is the other way around —
// and "&" must be replaced first in both, or the "&" introduced by
// replacing the other characters would itself get escaped.
function escapeText(text) {
    return text
        .replace(/&/gu, '&amp;')
        .replace(/</gu, '&lt;')
        .replace(/>/gu, '&gt;')
        .replace(/\u00A0/gu, '&nbsp;');
}

function escapeAttributeValue(value) {
    return value
        .replace(/&/gu, '&amp;')
        .replace(/"/gu, '&quot;')
        .replace(/\u00A0/gu, '&nbsp;');
}

// The tag name as written to output: lowercase local name for HTML,
// rawName verbatim for foreign elements, so "svg" and "clipPath" survive.
function tagNameFor(element) {
    return element.isForeign ? element.rawName : element.localName;
}

function serializeStartTag(element) {
    let result = `<${ tagNameFor(element) }`;

    for (const attr of element.getAttributesForSerialization()) {
        const name = element.isForeign ? attr.rawName : attr.name;
        result += ` ${ name }="${ escapeAttributeValue(attr.value) }"`;
    }

    return `${ result }>`;
}

function serializeEndTag(element) {
    return `</${ tagNameFor(element) }>`;
}

function isRawTextElement(element) {
    return !element.isForeign && RAW_TEXT_ELEMENTS.has(element.localName);
}

function isVoidElement(element) {
    return !element.isForeign && VOID_ELEMENTS.has(element.localName);
}

// Serializes `startNodes` (and everything beneath them) onto `parts`, using
// an explicit stack rather than recursion so a pathologically deep tree —
// thousands of nested elements, which is realistic input for a scraping
// library — cannot overflow the call stack. A `{ closeOf }` marker stands
// in for "emit this element's end tag now that its children are done."
function serializeNodes(startNodes, parts) {
    const stack = [];
    for (let index = startNodes.length - 1; index >= 0; index -= 1) {
        stack.push(startNodes[index]);
    }

    while (stack.length > 0) {
        const item = stack.pop();

        if (item.closeOf) {
            parts.push(serializeEndTag(item.closeOf));
            continue;
        }

        const node = item;

        if (node.nodeType === 3) {
            parts.push(escapeText(node.data));
            continue;
        }

        if (node.nodeType === 8) {
            parts.push(`<!--${ node.data }-->`);
            continue;
        }

        // node.nodeType === 1: Element.
        parts.push(serializeStartTag(node));

        if (isVoidElement(node)) {
            continue;
        }

        if (isRawTextElement(node)) {
            // Never escaped: the children of <script> and <style> are
            // output verbatim, since escaping them would corrupt inline
            // script and stylesheet content.
            for (const child of node.childNodes) {
                if (child.nodeType === 3) {
                    parts.push(child.data);
                }
            }
            parts.push(serializeEndTag(node));
            continue;
        }

        stack.push({ closeOf: node });
        const { childNodes } = node;
        for (let index = childNodes.length - 1; index >= 0; index -= 1) {
            stack.push(childNodes[index]);
        }
    }
}

/**
 * @param {Element} element - The element to serialize.
 * @returns {string} HTML for `element`'s children only, matching
 *   `Element.innerHTML`.
 */
export function serializeInnerHTML(element) {
    if (isRawTextElement(element)) {
        return element.childNodes
            .filter((child) => child.nodeType === 3)
            .map((child) => child.data)
            .join('');
    }

    const parts = [];
    serializeNodes(element.childNodes, parts);
    return parts.join('');
}

/**
 * @param {Element} element - The element to serialize.
 * @returns {string} HTML for `element` including its own tags, matching
 *   `Element.outerHTML`.
 */
export function serializeOuterHTML(element) {
    const parts = [];
    serializeNodes([ element ], parts);
    return parts.join('');
}
