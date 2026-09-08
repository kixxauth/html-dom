import { describe } from 'kixx-test';
import { assert, assertEqual, assertFalsy } from 'kixx-assert';
import { Text, Comment, ParentNode } from '../../../lib/node.js';
import { Element } from '../../../lib/element.js';

function createElement(localName, attributes) {
    return new Element(localName, localName, attributes ?? [], false);
}

// <div id="root"><p class="a">one<b>two</b></p><!--note--></div>
function createTree() {
    const root = createElement('div', [ { name: 'id', rawName: 'id', value: 'root' } ]);
    const p = createElement('p', [ { name: 'class', rawName: 'class', value: 'a' } ]);
    const text1 = new Text('one');
    const b = createElement('b');
    const text2 = new Text('two');
    const comment = new Comment('note');

    root.appendChild(p);
    root.appendChild(comment);
    p.appendChild(text1);
    p.appendChild(b);
    b.appendChild(text2);

    return { root, p, text1, b, text2, comment };
}

describe('node', ({ it, describe: describeGroup }) => {
    it('has no children or getElementsByTagName on Text', () => {
        const text = new Text('hello');
        assertEqual(3, text.nodeType);
        assertEqual('#text', text.nodeName);
        assertEqual(undefined, text.children);
        assertEqual(undefined, text.getElementsByTagName);
    });

    it('reports Comment nodeType and nodeName', () => {
        const comment = new Comment('note');
        assertEqual(8, comment.nodeType);
        assertEqual('#comment', comment.nodeName);
    });

    it('separates children (elements only) from childNodes (everything)', () => {
        const { root } = createTree();

        assertEqual(2, root.childNodes.length);
        assertEqual(1, root.children.length);
        assertEqual('P', root.children[0].tagName);
    });

    it('returns the same frozen array instance across accesses', () => {
        const { root } = createTree();

        assert(root.children === root.children);
        assert(root.childNodes === root.childNodes);
        assert(Object.isFrozen(root.children));
        assert(Object.isFrozen(root.childNodes));
    });

    it('concatenates descendant text content and ignores comments', () => {
        const { root } = createTree();

        assertEqual('onetwo', root.textContent);
    });

    it('reports parentElement as the nearest Element ancestor, or null', () => {
        const { root, p, text1 } = createTree();

        assertEqual(p, text1.parentElement);
        assertEqual(null, root.parentElement);
    });

    describeGroup('getElementsByTagName', ({ it: itTagName }) => {
        itTagName('finds a descendant by tag name case-insensitively', () => {
            const { root } = createTree();
            const results = root.getElementsByTagName('P');

            assertEqual(1, results.length);
            assertEqual('P', results[0].tagName);
        });

        itTagName('matches every element for "*"', () => {
            const { root } = createTree();
            const results = root.getElementsByTagName('*');

            assertEqual(2, results.length);
        });
    });

    describeGroup('getElementsByClassName', ({ it: itClassName }) => {
        itClassName('requires every requested class', () => {
            const root = createElement('div');
            const a = createElement('span', [ { name: 'class', rawName: 'class', value: 'a b' } ]);
            const b = createElement('span', [ { name: 'class', rawName: 'class', value: 'a' } ]);
            root.appendChild(a);
            root.appendChild(b);

            const results = root.getElementsByClassName('a b');

            assertEqual(1, results.length);
            assertEqual(a, results[0]);
        });
    });

    it('does not expose a setter for children', () => {
        assertFalsy(Object.getOwnPropertyDescriptor(ParentNode.prototype, 'children').set);
    });
});
