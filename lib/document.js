/**
 * @module document
 */

import { ParentNode } from './node.js';

/**
 * @typedef {Object} DocumentType
 * @property {string} name - The doctype name, lowercased.
 * @property {string|null} publicId - The public identifier, or `null`.
 * @property {string|null} systemId - The system identifier, or `null`.
 */

/**
 * @typedef {Object} ParseError
 * @property {string} code - A stable, kebab-case error identifier. Adding a
 *   code is a compatible change; renaming one is a breaking change.
 * @property {string} message - A human-readable description.
 * @property {number} offset - 0-based index into the preprocessed source.
 * @property {number} line - 1-based line number.
 * @property {number} column - 1-based column number.
 */

/**
 * The root of a parsed document. Construction is internal to this package —
 * `parseHTML` is the supported way to obtain one — but the class is
 * exported so callers can use `instanceof Document`.
 *
 * `documentElement`, `head`, and `body` are always non-null: `parseHTML`
 * synthesizes them even for empty input, so callers never need to guard
 * against a missing one.
 */
export class Document extends ParentNode {
    #documentElement = null;
    #head = null;
    #body = null;
    #doctype = null;
    #parseErrors = Object.freeze([]);

    constructor() {
        super(9);
    }

    /**
     * @returns {string} Always `'#document'`.
     */
    get nodeName() {
        return '#document';
    }

    /**
     * @returns {Element} The root `<html>` element.
     */
    get documentElement() {
        return this.#documentElement;
    }

    /**
     * @returns {Element} The `<head>` element.
     */
    get head() {
        return this.#head;
    }

    /**
     * @returns {Element} The `<body>` element.
     */
    get body() {
        return this.#body;
    }

    /**
     * @returns {DocumentType|null} The doctype, or `null` when the source
     *   had none. Not a node: it is not in `childNodes` or `children`.
     */
    get doctype() {
        return this.#doctype;
    }

    /**
     * @returns {ParseError[]} Every recovery the parser performed, in
     *   source order. Empty for a clean document.
     */
    get parseErrors() {
        return this.#parseErrors;
    }

    /**
     * @returns {Element[]} Always `[documentElement]` once parsing has set
     *   it, otherwise an empty array.
     */
    get children() {
        return this.#documentElement ? Object.freeze([ this.#documentElement ]) : Object.freeze([]);
    }

    // Internal: called only by the tree builder while assembling the
    // document.
    setDocumentElement(element) {
        this.#documentElement = element;
    }

    // Internal: called only by the tree builder while assembling the
    // document.
    setHead(element) {
        this.#head = element;
    }

    // Internal: called only by the tree builder while assembling the
    // document.
    setBody(element) {
        this.#body = element;
    }

    // Internal: called only by the tree builder while assembling the
    // document.
    setDoctype(doctype) {
        this.#doctype = doctype ? Object.freeze(doctype) : null;
    }

    // Internal: called only by the tree builder once parsing has finished
    // collecting errors.
    setParseErrors(errors) {
        this.#parseErrors = Object.freeze(errors);
    }
}
