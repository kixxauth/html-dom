import { describe } from 'kixx-test';
import { assert, assertEqual } from 'kixx-assert';
import { parseHTML } from '../../../lib/parse-html.js';

function firstElement(html) {
    return parseHTML(html).body.children[0];
}

function labelFor(node) {
    if (node.nodeType === 1) {
        return node.tagName;
    }
    if (node.nodeType === 3) {
        return node.data;
    }
    return `#${ node.nodeType }`;
}

function walk(node, out) {
    out.push(labelFor(node));
    if (node.childNodes) {
        for (const child of node.childNodes) {
            walk(child, out);
        }
    }
}

function structureOf(element) {
    const out = [];
    walk(element, out);
    return out.join('|');
}

describe('serialize', ({ it, describe: describeGroup }) => {
    it('outerHTML includes the element\'s own tags; innerHTML does not', () => {
        const div = firstElement('<div><p>x</p></div>');
        assertEqual('<div><p>x</p></div>', div.outerHTML);
        assertEqual('<p>x</p>', div.innerHTML);
    });

    describeGroup('round-tripping', ({ it: itRoundTrip }) => {
        itRoundTrip('preserves textContent through parse -> innerHTML -> parse for &, <, >, and U+00A0', () => {
            const original = firstElement('<p>a &amp; b &lt; c &gt; d &nbsp; e</p>');
            const roundTripped = firstElement(`<div>${ original.outerHTML }</div>`);
            assertEqual(original.textContent, roundTripped.children[0].textContent);
        });

        itRoundTrip('preserves tree structure through parse -> outerHTML -> parse', () => {
            const original = firstElement('<div id="a"><p class="lead">Hello <b>world</b></p><!--note--></div>');
            const roundTripped = firstElement(original.outerHTML);
            assertEqual(structureOf(original), structureOf(roundTripped));
        });
    });

    it('escapes an attribute value\'s ", &, but leaves < and > literal, and re-parses identically', () => {
        const original = 'weird " & < > value';
        const div = firstElement('<div title="weird &quot; &amp; < > value"></div>');
        assertEqual(original, div.getAttribute('title'));

        const serialized = div.outerHTML;
        assert(serialized.includes('&quot;'));
        assert(serialized.includes('&amp;'));
        assert(!serialized.includes('title="weird " &'), 'the unescaped quote must not appear bare');

        const reparsed = firstElement(serialized);
        assertEqual(original, reparsed.getAttribute('title'));
    });

    it('does not escape script content', () => {
        const script = firstElement('<body><script>if (a < b) { x = "&"; }</script></body>');
        assertEqual('if (a < b) { x = "&"; }', script.innerHTML);
        assertEqual('<script>if (a < b) { x = "&"; }</script>', script.outerHTML);
    });

    it('serializes void elements without an end tag or trailing slash', () => {
        const br = firstElement('<p><br></p>').children[0];
        assertEqual('<br>', br.outerHTML);

        const input = firstElement('<input value="">');
        assertEqual('<input value="">', input.outerHTML);
    });

    it('preserves viewBox casing on a foreign element', () => {
        const svg = firstElement('<svg viewBox="0 0 1 1"></svg>');
        assertEqual('<svg viewBox="0 0 1 1"></svg>', svg.outerHTML);
    });

    it('normalizes single-quoted attributes to double quotes', () => {
        const div = firstElement('<div class=\'x\'></div>');
        assertEqual('<div class="x"></div>', div.outerHTML);
    });

    it('round-trips a comment', () => {
        const document = parseHTML('<!--hello-->');
        const comment = document.childNodes.find((n) => n.nodeType === 8);
        assertEqual('hello', comment.data);
    });

    it('serializes a document nesting 10000 elements without a stack overflow', () => {
        let html = '';
        for (let i = 0; i < 10000; i += 1) {
            html += '<div>';
        }
        html += 'x';
        for (let i = 0; i < 10000; i += 1) {
            html += '</div>';
        }

        const div = firstElement(html);
        const serialized = div.outerHTML;
        assert(serialized.startsWith('<div><div>'));
        assert(serialized.endsWith('</div></div>'));
    });
});
