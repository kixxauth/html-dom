/**
 * @module element
 */

import { ParentNode } from './node.js';

// Frozen {name, value} pairs, exposed through the array-like `attributes`
// getter below. Index access and Symbol.iterator are implemented with own
// numeric properties rather than extending Array, since an Array instance
// also carries push/splice/etc. that would misleadingly suggest the list
// can be mutated.
class AttributeList {
    constructor(entries) {
        entries.forEach((entry, index) => {
            this[index] = entry;
        });
        this.length = entries.length;
    }

    /**
     * @param {string} name - Attribute name to find.
     * @returns {{name: string, value: string}|null} The matching entry, or
     *   `null` when no attribute has this name.
     */
    getNamedItem(name) {
        for (let index = 0; index < this.length; index += 1) {
            if (this[index].name === name) {
                return this[index];
            }
        }
        return null;
    }

    [Symbol.iterator]() {
        let index = 0;
        const { length } = this;
        const list = this;

        return {
            next() {
                if (index >= length) {
                    return { value: undefined, done: true };
                }
                const value = list[index];
                index += 1;
                return { value, done: false };
            },
        };
    }
}

// A read-only DOMTokenList-alike over an attribute's whitespace-separated
// value. Tokens are deduplicated preserving first occurrence, per the DOM's
// ordered-set parser, so `class="a a"` has length 1 while `value` keeps the
// raw string `'a a'`.
class ClassList {
    #tokens;
    #value;

    constructor(value) {
        this.#value = value;

        const seen = new Set();
        this.#tokens = [];

        for (const token of value.split(/\s+/u).filter(Boolean)) {
            if (!seen.has(token)) {
                seen.add(token);
                this.#tokens.push(token);
            }
        }

        this.#tokens.forEach((token, index) => {
            this[index] = token;
        });
        this.length = this.#tokens.length;
    }

    /**
     * @returns {string} The raw, undeduplicated attribute value.
     */
    get value() {
        return this.#value;
    }

    /**
     * @param {string} token - Class name to test for.
     * @returns {boolean} Whether `token` is present.
     */
    contains(token) {
        return this.#tokens.includes(token);
    }

    [Symbol.iterator]() {
        return this.#tokens[Symbol.iterator]();
    }
}

/**
 * An element node. Construction is internal to this package — `parseHTML`
 * is the supported way to obtain one — but the class is exported so callers
 * can use `instanceof Element`.
 */
export class Element extends ParentNode {
    #localName;
    #rawName;
    #isForeign;
    #attributesArray;
    #attributesMap;
    #attributeList = null;
    #classList = null;

    /**
     * @param {string} localName - Lowercase element name.
     * @param {string} rawName - Element name as the author wrote it.
     * @param {{name: string, rawName: string, value: string}[]} attributes -
     *   Attributes in source order. Names are already lowercase.
     * @param {boolean} isForeign - Whether this element is inside an `svg`
     *   or `math` subtree.
     */
    constructor(localName, rawName, attributes, isForeign) {
        super(1);
        this.#localName = localName;
        this.#rawName = rawName;
        this.#isForeign = isForeign;
        this.#attributesArray = attributes;
        this.#attributesMap = new Map(attributes.map((attr) => [ attr.name, attr.value ]));
    }

    /**
     * @returns {string} Same value as `tagName`, matching the DOM's
     *   `Element.nodeName`.
     */
    get nodeName() {
        return this.tagName;
    }

    /**
     * @returns {string} The lowercase element name.
     */
    get localName() {
        return this.#localName;
    }

    /**
     * @returns {string} The element name exactly as the author wrote it.
     */
    get rawName() {
        return this.#rawName;
    }

    /**
     * @returns {boolean} Whether this element is inside an `svg` or `math`
     *   subtree.
     */
    get isForeign() {
        return this.#isForeign;
    }

    /**
     * @returns {string} `rawName` for a foreign element (so `svg` reports
     *   `'svg'` and `clipPath` reports `'clipPath'`), otherwise the
     *   uppercased local name.
     */
    get tagName() {
        return this.#isForeign ? this.#rawName : this.#localName.toUpperCase();
    }

    /**
     * @returns {string} The `id` attribute's value, or `''` when absent.
     */
    get id() {
        const value = this.getAttribute('id');
        return value === null ? '' : value;
    }

    /**
     * @param {string} name - Attribute name, matched case-insensitively.
     * @returns {string|null} The attribute's value, or `null` when absent.
     */
    getAttribute(name) {
        const value = this.#attributesMap.get(name.toLowerCase());
        return value === undefined ? null : value;
    }

    /**
     * @param {string} name - Attribute name, matched case-insensitively.
     * @returns {boolean} Whether the attribute is present.
     */
    hasAttribute(name) {
        return this.#attributesMap.has(name.toLowerCase());
    }

    /**
     * @returns {string[]} Attribute names in source order.
     */
    getAttributeNames() {
        return Object.freeze(this.#attributesArray.map((attr) => attr.name));
    }

    /**
     * @returns {AttributeList} A frozen, iterable, array-like collection of
     *   `{name, value}` entries in source order.
     */
    get attributes() {
        if (!this.#attributeList) {
            const entries = this.#attributesArray.map((attr) => Object.freeze({ name: attr.name, value: attr.value }));
            this.#attributeList = Object.freeze(new AttributeList(entries));
        }
        return this.#attributeList;
    }

    /**
     * @returns {ClassList} A read-only, iterable, array-like view of the
     *   `class` attribute's tokens.
     */
    get classList() {
        if (!this.#classList) {
            this.#classList = Object.freeze(new ClassList(this.getAttribute('class') ?? ''));
        }
        return this.#classList;
    }
}
