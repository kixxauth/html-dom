import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe } from 'kixx-test';
import { assert, assertEqual } from 'kixx-assert';
import { parseHTML } from '../../lib/parse-html.js';

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/page.html', import.meta.url));
const FIXTURE_HTML = fs.readFileSync(FIXTURE_PATH, 'utf8');

function labelFor(node) {
    if (node.nodeType === 1) {
        return node.tagName;
    }
    if (node.nodeType === 3) {
        return node.data;
    }
    if (node.nodeType === 8) {
        return `#comment:${ node.data }`;
    }
    return `#${ node.nodeType }`;
}

// Walks a tree with an explicit stack (matching the style used by the
// serializer and matcher elsewhere in lib/) so this stays correct
// regardless of how deep any future fixture content gets.
function structureOf(root) {
    const labels = [];
    const stack = [ root ];

    while (stack.length > 0) {
        const node = stack.pop();
        labels.push(labelFor(node));

        if (node.childNodes) {
            for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
                stack.push(node.childNodes[index]);
            }
        }
    }

    return labels.join('|');
}

describe('integration: a realistic page', ({ describe: describeGroup }) => {
    const document = parseHTML(FIXTURE_HTML);

    describeGroup('tree shape', ({ it: itShape }) => {
        itShape('sorts head content into head and visible content into body', () => {
            assertEqual('META,TITLE,STYLE', document.head.children.map((el) => el.tagName).join(','));
            assert(document.body.children.length > 0);
        });

        itShape('reports the doctype name as "html"', () => {
            assertEqual('html', document.doctype.name);
        });

        itShape('keeps the comment before <html> as a Document child, not in documentElement', () => {
            const comment = document.childNodes.find((node) => node.nodeType === 8);
            assert(comment, 'expected a comment child on the Document');
            assertEqual('fixture header comment', comment.data);
            assertEqual(document.documentElement, document.children[0]);
        });

        itShape('produces sibling <p> elements for the two unclosed paragraphs', () => {
            const paragraphs = document.body.querySelectorAll('body > p');
            assert(paragraphs.length >= 2);
            assert(paragraphs[0].textContent.startsWith('Unclosed paragraph one'));
            assert(paragraphs[1].textContent.startsWith('Unclosed paragraph two'));
            assertEqual(0, paragraphs[0].children.length);
        });

        itShape('produces sibling <li> elements inside <ul>', () => {
            const items = document.querySelectorAll('ul > li');
            assertEqual(2, items.length);
            assert(items[0].textContent.startsWith('Item one'));
            assert(items[1].textContent.startsWith('Item two'));
        });

        itShape('builds table rows without a synthesized <tbody>, exercising the table auto-close rules', () => {
            const table = document.querySelector('table');
            assertEqual('TR,TR', table.children.map((el) => el.tagName).join(','));
            assertEqual('TD,TD', table.children[0].children.map((el) => el.tagName).join(','));
            assertEqual('Cell A', table.children[0].children[0].textContent);
        });

        itShape('reports svg tagName, retains viewBox casing, and leaves path childless', () => {
            const svg = document.querySelector('svg');
            assertEqual('svg', svg.tagName);
            assertEqual('0 0 10 10', svg.getAttribute('viewBox'));
            assertEqual('path', svg.children[0].tagName);
            assertEqual(0, svg.children[0].children.length);
        });

        itShape('keeps script content verbatim, including "<" and a string that looks like an end tag', () => {
            const script = document.querySelector('script');
            assert(script.textContent.includes('</not-a-real-tag>'));
            assert(script.textContent.includes('1 < 2'));
        });

        itShape('decodes named and numeric references and leaves an unknown one literal', () => {
            const lead = document.querySelector('p.lead');
            assertEqual('Named & numeric A and unknown &notaname; references.', lead.textContent);
        });

        itShape('carries multiple classes on the same element', () => {
            const lead = document.querySelector('p.lead');
            assertEqual(2, lead.classList.length);
            assert(lead.classList.contains('lead'));
            assert(lead.classList.contains('intro'));
        });

        itShape('parses single-quoted, valueless, and entity-quoted attributes', () => {
            const [ typed, boolAttr, titled ] = document.querySelectorAll('input');
            assertEqual('text', typed.getAttribute('type'));
            assertEqual('q', typed.getAttribute('name'));
            assertEqual('', boolAttr.getAttribute('disabled'));
            assertEqual('quote " here', titled.getAttribute('title'));
        });

        itShape('decodes a character reference inside <textarea>', () => {
            const textarea = document.querySelector('textarea');
            assertEqual('Value with & reference', textarea.textContent);
        });
    });

    describeGroup('parse errors', ({ it: itErrors }) => {
        itErrors('records a stray-end-tag with a line and column pointing at it', () => {
            const error = document.parseErrors.find((e) => e.code === 'stray-end-tag');
            assert(error, 'expected a stray-end-tag error');

            const lines = FIXTURE_HTML.split('\n');
            assertEqual('</section>', lines[error.line - 1].slice(error.column - 1, error.column - 1 + '</section>'.length));
        });
    });

    describeGroup('serialization round-trip', ({ it: itRoundTrip }) => {
        itRoundTrip('produces a structurally identical tree after outerHTML -> parseHTML', () => {
            const reparsed = parseHTML(document.documentElement.outerHTML);
            assertEqual(structureOf(document.documentElement), structureOf(reparsed.documentElement));
        });
    });

    describeGroup('selector queries', ({ it: itQuery }) => {
        itQuery('a descendant selector finds a <p> under <body>', () => {
            assert(document.querySelector('body p'));
        });

        itQuery('a child combinator finds a direct <tr> under <table>', () => {
            assert(document.querySelector('table > tr'));
        });

        itQuery('an attribute selector finds the svg by viewBox', () => {
            assertEqual('svg', document.querySelector('[viewBox]').tagName);
        });

        itQuery(':nth-child(2) finds the second <li>', () => {
            const [ second ] = document.querySelectorAll('li:nth-child(2)');
            assert(second.textContent.startsWith('Item two'));
        });

        itQuery('closest() walks from <path> up to its <svg>', () => {
            const path = document.querySelector('path');
            assertEqual('svg', path.closest('svg').tagName);
        });
    });
});
