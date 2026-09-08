/**
 * @module tree-builder
 */

import { Document } from './document.js';
import { Element } from './element.js';
import { Text, Comment } from './node.js';
import { VOID_ELEMENTS, HEAD_ELEMENTS, FOREIGN_ROOT_ELEMENTS, AUTO_CLOSED_BY } from './html-tags.js';

const WHITESPACE_ONLY_PATTERN = /^[\t\n\f\r ]*$/;

// Builds the tree from a token stream, tracking just enough state to
// implement the pragmatic subset described in the implementation plan: an
// open-element stack, two flags for whether <html> and <body> have been
// opened, and a foreign-content depth counter for <svg>/<math>. There is no
// scope-checking insertion-mode state machine.
//
// "Are we still routing content into <head>" is derived from the stack
// itself (the current insertion point is exactly document.head) rather than
// tracked as separate state, so it naturally stops being true the moment
// head is popped for any reason — an explicit </head>, or the head being
// closed to open body — without needing every call site to agree on a
// phase transition.
class TreeBuilder {
    #document = new Document();
    #stack = [];
    #htmlOpened = false;
    #bodyOpened = false;
    #foreignRootDepth = 0;
    #doctypeSet = false;
    #errors = [];

    // Text-merge tracking: the most recently appended Text node and the
    // parent it was appended to, so that a run of text tokens broken only
    // by a discarded token (a stray end tag, an implied auto-close) still
    // collapses into a single Text node rather than one per token.
    #openTextNode = null;
    #openTextParent = null;

    get document() {
        return this.#document;
    }

    get errors() {
        return this.#errors;
    }

    #recordError(code, message, offset) {
        this.#errors.push({ code, message, offset });
    }

    #currentParent() {
        return this.#stack.length > 0 ? this.#stack[this.#stack.length - 1] : this.#document;
    }

    #atHeadInsertionPoint() {
        return !this.#bodyOpened && this.#currentParent() === this.#document.head;
    }

    #invalidateTextMerge() {
        this.#openTextNode = null;
        this.#openTextParent = null;
    }

    #appendText(parent, data) {
        if (!data) {
            return;
        }

        if (this.#openTextNode && this.#openTextParent === parent) {
            this.#openTextNode.data += data;
            return;
        }

        const node = new Text(data);
        parent.appendChild(node);
        this.#openTextNode = node;
        this.#openTextParent = parent;
    }

    #appendNode(parent, node) {
        parent.appendChild(node);
        this.#invalidateTextMerge();
    }

    // Pops the top of the open-element stack. `implied` records an
    // implied-end-tag error, used when an element closes as a side effect
    // of auto-closing or an end tag scanning past it, rather than because
    // its own end tag (or a void/self-closing start tag) closed it.
    #popTopElement(implied, offset) {
        const element = this.#stack.pop();

        if (element.isForeign && FOREIGN_ROOT_ELEMENTS.has(element.localName)) {
            this.#foreignRootDepth -= 1;
        }

        if (implied) {
            this.#recordError('implied-end-tag', `"${ element.localName }" was closed implicitly.`, offset);
        }

        this.#invalidateTextMerge();
    }

    #ensureHtmlOpen(attributes) {
        if (this.#htmlOpened) {
            return;
        }

        const html = new Element('html', 'html', attributes ?? [], false);
        this.#document.appendChild(html);
        this.#document.setDocumentElement(html);
        this.#stack.push(html);

        const head = new Element('head', 'head', [], false);
        html.appendChild(head);
        this.#document.setHead(head);
        this.#stack.push(head);

        this.#htmlOpened = true;
        this.#invalidateTextMerge();
    }

    // Closes <head> (if it is the current insertion point) and opens
    // <body>. Every path that ends up needing a body — an explicit <body>
    // tag, a non-head start tag, non-whitespace text, or reaching the end
    // of the token stream — funnels through here.
    #openBody(attributes) {
        this.#ensureHtmlOpen();

        if (this.#bodyOpened) {
            return;
        }

        if (this.#atHeadInsertionPoint()) {
            this.#popTopElement(false, null);
        }

        const html = this.#document.documentElement;
        const body = new Element('body', 'body', attributes, false);
        html.appendChild(body);
        this.#document.setBody(body);
        this.#stack.push(body);
        this.#bodyOpened = true;
        this.#invalidateTextMerge();
    }

    #handleDoctype(token) {
        if (!this.#doctypeSet) {
            this.#document.setDoctype({ name: token.name, publicId: token.publicId, systemId: token.systemId });
            this.#doctypeSet = true;
        }
    }

    #handleComment(token) {
        const parent = this.#htmlOpened ? this.#currentParent() : this.#document;
        this.#appendNode(parent, new Comment(token.data));
    }

    #handleText(token) {
        const isWhitespaceOnly = WHITESPACE_ONLY_PATTERN.test(token.data);

        if (!this.#htmlOpened) {
            if (isWhitespaceOnly) {
                return;
            }
            this.#openBody([]);
            this.#appendText(this.#currentParent(), token.data);
            return;
        }

        if (this.#atHeadInsertionPoint() && !isWhitespaceOnly) {
            this.#openBody([]);
        }

        this.#appendText(this.#currentParent(), token.data);
    }

    #insertElement(token, isForeignNow) {
        const element = new Element(token.name, token.rawName, token.attributes, isForeignNow);
        this.#appendNode(this.#currentParent(), element);

        if (VOID_ELEMENTS.has(token.name)) {
            return;
        }

        if (isForeignNow) {
            if (token.selfClosing) {
                return;
            }
        } else if (token.selfClosing) {
            this.#recordError(
                'non-void-html-element-start-tag-with-trailing-solidus',
                `"${ token.name }" is not a void element; "/>" is ignored.`,
                token.offset,
            );
        }

        if (FOREIGN_ROOT_ELEMENTS.has(token.name)) {
            this.#foreignRootDepth += 1;
        }

        this.#stack.push(element);
    }

    #handleStartTag(token) {
        const { name } = token;
        const isForeignNow = this.#foreignRootDepth > 0 || FOREIGN_ROOT_ELEMENTS.has(name);

        if (name === 'html') {
            this.#ensureHtmlOpen(token.attributes);
            return;
        }

        this.#ensureHtmlOpen();

        if (name === 'body') {
            if (!this.#bodyOpened) {
                this.#openBody(token.attributes);
            }
            return;
        }

        if (this.#atHeadInsertionPoint()) {
            if (name === 'head') {
                return;
            }
            if (HEAD_ELEMENTS.has(name)) {
                this.#insertElement(token, isForeignNow);
                return;
            }
            this.#openBody([]);
        } else if (name === 'head') {
            return;
        }

        while (this.#stack.length > 0) {
            const top = this.#stack[this.#stack.length - 1];
            const closers = !top.isForeign && AUTO_CLOSED_BY.get(top.localName);

            if (closers && closers.has(name)) {
                this.#popTopElement(true, token.offset);
            } else {
                break;
            }
        }

        this.#insertElement(token, isForeignNow);
    }

    #handleEndTag(token) {
        const isForeignNow = this.#foreignRootDepth > 0;
        const matchKey = isForeignNow ? token.rawName : token.name;

        let matchIndex = -1;
        for (let index = this.#stack.length - 1; index >= 0; index -= 1) {
            const candidate = this.#stack[index];
            const key = candidate.isForeign ? candidate.rawName : candidate.localName;
            if (key === matchKey) {
                matchIndex = index;
                break;
            }
        }

        if (matchIndex === -1) {
            this.#recordError('stray-end-tag', `No open element matches end tag "${ token.name }".`, token.offset);
            return;
        }

        while (this.#stack.length > matchIndex + 1) {
            this.#popTopElement(true, token.offset);
        }
        this.#popTopElement(false, null);
    }

    consume(tokens) {
        for (const token of tokens) {
            switch (token.type) {
                case 'parseError':
                    this.#recordError(token.code, token.message, token.offset);
                    break;
                case 'doctype':
                    this.#handleDoctype(token);
                    break;
                case 'comment':
                    this.#handleComment(token);
                    break;
                case 'text':
                    this.#handleText(token);
                    break;
                case 'startTag':
                    this.#handleStartTag(token);
                    break;
                case 'endTag':
                    this.#handleEndTag(token);
                    break;
                default:
                    break;
            }
        }

        // Implied structure is always built, even for empty input.
        this.#openBody([]);
    }
}

/**
 * Consumes a token stream and returns the resulting `Document`, along with
 * the unresolved parse errors collected along the way (each `{code,
 * message, offset}`, without `line`/`column` — the caller resolves those
 * against the preprocessed source, since this module never reads source
 * text itself).
 * @param {Iterable<Object>} tokens - Tokens from `tokenize()`.
 * @returns {{document: Document, errors: {code: string, message: string, offset: number}[]}}
 */
export function buildTree(tokens) {
    const builder = new TreeBuilder();
    builder.consume(tokens);
    return { document: builder.document, errors: builder.errors };
}
