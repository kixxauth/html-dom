import { describe } from 'kixx-test';
import { assert, assertEqual, assertFalsy } from 'kixx-assert';
import { parseHTML } from '../../../lib/parse-html.js';

function tagNames(elements) {
    return elements.map((el) => el.tagName).join(',');
}

describe('tree-builder', ({ it, describe: describeGroup }) => {
    describeGroup('implied structure', ({ it: itImplied }) => {
        itImplied('always builds documentElement, head, and body', () => {
            const document = parseHTML('just text');
            assertEqual('HTML', document.documentElement.tagName);
            assertEqual('HEAD', document.head.tagName);
            assertEqual('BODY', document.body.tagName);
        });

        itImplied('discards whitespace-only text before <html>', () => {
            const document = parseHTML('   \n<html><body>x</body></html>');
            assertEqual(0, document.childNodes.filter((n) => n.nodeType === 3).length);
        });

        itImplied('keeps a comment before <html> as a Document child, not in children', () => {
            const document = parseHTML('<!--intro--><html><body>x</body></html>');
            const comment = document.childNodes.find((n) => n.nodeType === 8);
            assert(comment, 'expected a comment child on the Document');
            assertEqual('intro', comment.data);
            assertEqual(1, document.children.length);
        });

        itImplied('forces body open for non-whitespace text before <html>', () => {
            const document = parseHTML('hello<html></html>');
            assertEqual('hello', document.body.textContent);
        });

        itImplied('routes head elements into head until the first non-head token', () => {
            const document = parseHTML('<meta charset="utf-8"><title>T</title><p>content</p>');
            assertEqual('META,TITLE', tagNames(document.head.children));
            assertEqual('P', tagNames(document.body.children));
        });
    });

    describeGroup('auto-closing', ({ it: itAutoClose }) => {
        itAutoClose('produces sibling <p> elements, not nested, for <p>one<p>two', () => {
            const document = parseHTML('<p>one<p>two');
            const [ first, second ] = document.body.children;

            assertEqual('P,P', tagNames(document.body.children));
            assertEqual('one', first.textContent);
            assertEqual('two', second.textContent);
            assertEqual(0, first.children.length);

            const impliedEndTags = document.parseErrors.filter((e) => e.code === 'implied-end-tag');
            assertEqual(1, impliedEndTags.length);
        });

        itAutoClose('produces sibling <li> elements inside <ul>', () => {
            const document = parseHTML('<ul><li>a<li>b</ul>');
            const ul = document.body.children[0];
            assertEqual('LI,LI', tagNames(ul.children));
            assertEqual('a', ul.children[0].textContent);
            assertEqual('b', ul.children[1].textContent);
        });
    });

    describeGroup('void elements', ({ it: itVoid }) => {
        itVoid('appends <br> and <img> without pushing them as containers', () => {
            const document = parseHTML('<p><br>after<img src="x">tail</p>');
            const p = document.body.children[0];

            assertEqual('BR,IMG', tagNames(p.children));
            assertEqual(0, p.children[0].children.length);
            assertEqual('aftertail', p.textContent);
        });
    });

    describeGroup('self-closing and foreign content', ({ it: itForeign }) => {
        itForeign('opens a div and records an error for a trailing solidus outside foreign content', () => {
            const document = parseHTML('<div/>after');
            const div = document.body.children[0];

            assertEqual('DIV', div.tagName);
            assertEqual('after', div.textContent);
            assert(document.parseErrors.some((e) => e.code === 'non-void-html-element-start-tag-with-trailing-solidus'));
        });

        itForeign('self-closes <path/> inside <svg>', () => {
            const document = parseHTML('<svg><path/></svg>after');
            const svg = document.body.children[0];

            assertEqual('svg', svg.tagName);
            assertEqual(1, svg.children.length);
            assertEqual('path', svg.children[0].tagName);
            assertEqual(0, svg.children[0].children.length);
            assertEqual('after', document.body.textContent);
        });

        itForeign('preserves foreign tagName casing and attribute values', () => {
            const document = parseHTML('<svg viewBox="0 0 1 1"><clipPath></clipPath></svg>');
            const svg = document.body.children[0];

            assertEqual('svg', svg.tagName);
            assertEqual('0 0 1 1', svg.getAttribute('viewBox'));
            assertEqual('clipPath', svg.children[0].tagName);
        });
    });

    describeGroup('character data', ({ it: itText }) => {
        itText('merges adjacent text tokens broken by a discarded stray end tag', () => {
            const document = parseHTML('<p>abc</span>def</p>');
            const p = document.body.children[0];

            assertEqual(1, p.childNodes.length);
            assertEqual('abcdef', p.textContent);
        });
    });

    describeGroup('parse errors', ({ it: itErrors }) => {
        itErrors('records stray-end-tag for an unmatched end tag and keeps parsing', () => {
            const document = parseHTML('a</section>b');
            assert(document.parseErrors.some((e) => e.code === 'stray-end-tag'));
            assertEqual('ab', document.body.textContent);
        });
    });

    it('reports doctype name', () => {
        const document = parseHTML('<!DOCTYPE html><p>x</p>');
        assertEqual('html', document.doctype.name);
    });

    it('leaves doctype null when the source has none', () => {
        const document = parseHTML('<p>x</p>');
        assertFalsy(document.doctype);
    });
});
