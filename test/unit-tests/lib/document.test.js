import { describe } from 'kixx-test';
import { assert, assertEqual } from 'kixx-assert';
import { Document } from '../../../lib/document.js';
import { Element } from '../../../lib/element.js';
import { Comment } from '../../../lib/node.js';

function createElement(localName) {
    return new Element(localName, localName, [], false);
}

// A minimal document shaped like what T5's builder assembles:
// <!--intro--><html><head></head><body></body></html>
function createDocument() {
    const document = new Document();
    const intro = new Comment('intro');
    const html = createElement('html');
    const head = createElement('head');
    const body = createElement('body');

    document.appendChild(intro);
    document.appendChild(html);
    html.appendChild(head);
    html.appendChild(body);

    document.setDocumentElement(html);
    document.setHead(head);
    document.setBody(body);
    document.setDoctype({ name: 'html', publicId: null, systemId: null });
    document.setParseErrors([]);

    return { document, intro, html, head, body };
}

describe('document', ({ it }) => {
    it('reports nodeType 9 and nodeName #document', () => {
        const { document } = createDocument();
        assertEqual(9, document.nodeType);
        assertEqual('#document', document.nodeName);
    });

    it('exposes documentElement, head, and body', () => {
        const { document, html, head, body } = createDocument();
        assertEqual(html, document.documentElement);
        assertEqual(head, document.head);
        assertEqual(body, document.body);
    });

    it('exposes children as only [documentElement], excluding the leading comment', () => {
        const { document, html } = createDocument();
        assertEqual(1, document.children.length);
        assertEqual(html, document.children[0]);
        assertEqual(2, document.childNodes.length);
    });

    it('exposes the doctype as a frozen plain object, not a node', () => {
        const { document } = createDocument();
        assertEqual('html', document.doctype.name);
        assert(Object.isFrozen(document.doctype));
    });

    it('returns null for textContent', () => {
        const { document } = createDocument();
        assertEqual(null, document.textContent);
    });

    it('exposes a frozen, empty parseErrors array for a clean document', () => {
        const { document } = createDocument();
        assertEqual(0, document.parseErrors.length);
        assert(Object.isFrozen(document.parseErrors));
    });
});
