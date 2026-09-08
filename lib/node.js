/**
 * @module node
 */

/**
 * Base class for every node in the tree. Structure — `parentNode` and, for
 * container nodes, children — is set once during parsing and never changes
 * afterward. The constructor is not a supported way to build a tree outside
 * this package; `parseHTML` owns construction.
 */
export class Node {
    /** @type {Node|null} */
    #parentNode = null;

    /**
     * @param {number} nodeType - The DOM node type number.
     */
    constructor(nodeType) {
        this.nodeType = nodeType;
    }

    /**
     * @returns {Node|null} The parent node, or `null` at the root.
     */
    get parentNode() {
        return this.#parentNode;
    }

    /**
     * @returns {Element|null} The parent when it is an `Element`, otherwise
     *   `null` — so an element directly under `Document` reports `null`
     *   rather than a `Document`. Checked by `nodeType` rather than
     *   `instanceof Element` so this module has no dependency on
     *   element.js, which itself depends on this one.
     */
    get parentElement() {
        return this.#parentNode && this.#parentNode.nodeType === 1 ? this.#parentNode : null;
    }

    // Internal: called only by the tree builder while assembling a node's
    // parent, never exposed as a public mutator.
    setParentNode(node) {
        this.#parentNode = node;
    }
}

/**
 * A `Node` that can contain children: `Document` and `Element`. Kept
 * separate from `Node` so that `Text` and `Comment` do not inherit
 * `children` or the query methods, which would be meaningless on them.
 */
export class ParentNode extends Node {
    /** @type {Node[]} */
    #childNodes = [];

    /** @type {Node[]|null} */
    #frozenChildNodes = null;

    /** @type {Element[]|null} */
    #frozenChildren = null;

    /**
     * @returns {Node[]} Every child node — elements, text, and comments — in
     *   source order. The same frozen Array instance is returned on every
     *   access.
     */
    get childNodes() {
        if (!this.#frozenChildNodes) {
            this.#frozenChildNodes = Object.freeze(this.#childNodes.slice());
        }
        return this.#frozenChildNodes;
    }

    /**
     * @returns {Element[]} Child `Element` nodes only, in source order. The
     *   same frozen Array instance is returned on every access. Filtered by
     *   `nodeType` rather than `instanceof Element` — see the note on
     *   `parentElement`.
     */
    get children() {
        if (!this.#frozenChildren) {
            this.#frozenChildren = Object.freeze(
                this.#childNodes.filter((node) => node.nodeType === 1),
            );
        }
        return this.#frozenChildren;
    }

    /**
     * @returns {string|null} The concatenated data of every descendant
     *   `Text` node in document order, ignoring comments. `null` when this
     *   node is a `Document`, per the DOM.
     */
    get textContent() {
        if (this.nodeType === 9) {
            return null;
        }

        let result = '';
        const stack = this.#childNodes.slice().reverse();

        while (stack.length > 0) {
            const node = stack.pop();
            if (node instanceof Text) {
                result += node.data;
            } else if (node instanceof ParentNode) {
                for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
                    stack.push(node.childNodes[index]);
                }
            }
        }

        return result;
    }

    /**
     * @param {string} name - Element local name to match, or `'*'` for any
     *   element. Matched case-insensitively against HTML elements and
     *   case-sensitively against foreign elements.
     * @returns {Element[]} Descendant elements in document order, excluding
     *   this node itself.
     */
    getElementsByTagName(name) {
        const isWildcard = name === '*';
        const lowerName = name.toLowerCase();
        const results = [];

        const visit = (node) => {
            for (const child of node.children) {
                const matches = isWildcard
                    || (child.isForeign ? child.tagName === name : child.localName === lowerName);

                if (matches) {
                    results.push(child);
                }
                visit(child);
            }
        };

        visit(this);

        return Object.freeze(results);
    }

    /**
     * @param {string} names - One or more class names separated by ASCII
     *   whitespace. An element must carry all of them, matched
     *   case-sensitively.
     * @returns {Element[]} Descendant elements in document order, excluding
     *   this node itself.
     */
    getElementsByClassName(names) {
        const required = names.split(/\s+/).filter(Boolean);
        const results = [];

        const visit = (node) => {
            for (const child of node.children) {
                if (required.every((token) => child.classList.contains(token))) {
                    results.push(child);
                }
                visit(child);
            }
        };

        visit(this);

        return Object.freeze(results);
    }

    // Internal: called only by the tree builder while appending a child.
    appendChild(node) {
        this.#childNodes.push(node);
        node.setParentNode(this);
    }
}

/**
 * A node holding a single string of data: `Text` or `Comment`.
 */
export class CharacterData extends Node {
    /**
     * @param {number} nodeType - The DOM node type number.
     * @param {string} data - The node's text data.
     */
    constructor(nodeType, data) {
        super(nodeType);
        this.data = data;
    }

    /**
     * @returns {string} The node's data. Provided so `Text` and `Comment`
     *   match the DOM's `textContent` contract at the leaf level.
     */
    get textContent() {
        return this.data;
    }
}

/**
 * A text node.
 */
export class Text extends CharacterData {
    /**
     * @param {string} data - The text content.
     */
    constructor(data) {
        super(3, data);
    }

    /**
     * @returns {string} Always `'#text'`.
     */
    get nodeName() {
        return '#text';
    }
}

/**
 * A comment node.
 */
export class Comment extends CharacterData {
    /**
     * @param {string} data - The comment content, excluding `<!--` and
     *   `-->`.
     */
    constructor(data) {
        super(8, data);
    }

    /**
     * @returns {string} Always `'#comment'`.
     */
    get nodeName() {
        return '#comment';
    }
}
