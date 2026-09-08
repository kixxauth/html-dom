import { describe } from 'kixx-test';
import { assert, assertEqual } from 'kixx-assert';
import { parseHTML } from '../../../lib/parse-html.js';
import { SelectorSyntaxError } from '../../../lib/selector-parser.js';

function catchError(fn) {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return null;
}

function tagNames(elements) {
    return elements.map((el) => el.tagName).join(',');
}

describe('selector-matcher', ({ it, describe: describeGroup }) => {
    describeGroup('combinators', ({ it: itCombinator }) => {
        itCombinator('matches the descendant, child, adjacent, and sibling combinators', () => {
            const doc = parseHTML(`
                <div id="a">
                    <section>
                        <p id="descendant">x</p>
                    </section>
                    <p id="child">y</p>
                    <span id="before"></span>
                    <p id="adjacent">z</p>
                    <p id="sibling">w</p>
                </div>
            `);

            assertEqual('descendant', doc.querySelector('#a p').id);
            assertEqual('child', doc.querySelector('#a > p').id);
            assertEqual('adjacent', doc.querySelector('#before + p').id);
            assertEqual('sibling', doc.querySelector('#before ~ p:last-of-type').id);
        });

        itCombinator('skips intervening Text nodes for + and ~', () => {
            const doc = parseHTML('<div><a id="x"></a> text <b id="y"></b></div>');
            assertEqual('y', doc.querySelector('#x + b').id);
            assertEqual('y', doc.querySelector('#x ~ b').id);
        });
    });

    describeGroup('type selector casing', ({ it: itCasing }) => {
        itCasing('matches an HTML element regardless of selector casing', () => {
            const doc = parseHTML('<div></div>');
            assertEqual(doc.querySelector('div'), doc.querySelector('DIV'));
            assertEqual(doc.querySelector('div'), doc.querySelector('Div'));
        });

        itCasing('matches a foreign element only by exact casing', () => {
            const doc = parseHTML('<body><svg><clipPath></clipPath></svg></body>');
            assert(doc.querySelector('clipPath'));
            assertEqual(null, doc.querySelector('clippath'));
        });
    });

    it('matching evaluates against the real tree, not just the scope subtree', () => {
        const doc = parseHTML('<body class="theme"><div id="scope"><p>x</p></div></body>');
        const scope = doc.querySelector('#scope');
        const results = scope.querySelectorAll('body.theme p');
        assertEqual(1, results.length);
        assertEqual('x', results[0].textContent);
    });

    it('returns document order with no duplicates for a selector list', () => {
        const doc = parseHTML('<div><p id="p1"></p><span id="s1"></span><p id="p2"></p></div>');
        const results = doc.querySelectorAll('p, div, span');
        assertEqual('DIV,P,SPAN,P', tagNames(results));
    });

    it('returns null, not undefined, when nothing matches', () => {
        const doc = parseHTML('<p></p>');
        assertEqual(null, doc.querySelector('.nope'));
    });

    describeGroup('attribute operators', ({ it: itAttr }) => {
        itAttr('matches every operator', () => {
            const doc = parseHTML(`
                <a id="a1" href="/docs/intro"></a>
                <a id="a2" href="page.docs"></a>
                <a id="a3" href="a b c"></a>
                <a id="a4" href="en-US"></a>
                <a id="a5" href="english"></a>
                <a id="a6" data-x></a>
            `);

            assertEqual('a1', doc.querySelector('[href^="/docs"]').id);
            assertEqual('a2', doc.querySelector('[href$=".docs"]').id);
            assertEqual('a3', doc.querySelector('[href~="b"]').id);
            assertEqual('a4', doc.querySelector('[href|="en"]').id);
            assertEqual(null, doc.querySelector('[href|="en"]#a5'));
            assertEqual('a6', doc.querySelector('[data-x]').id);
            assertEqual('a1', doc.querySelector('[href*="docs"]').id);
        });

        itAttr('[a^=""] matches nothing', () => {
            const doc = parseHTML('<a href="x"></a>');
            assertEqual(null, doc.querySelector('[href^=""]'));
        });

        itAttr('[href|="en"] matches "en" and "en-US" but not "english"', () => {
            const doc = parseHTML('<a id="a1" href="en"></a><a id="a2" href="en-US"></a><a id="a3" href="english"></a>');
            const results = doc.querySelectorAll('[href|="en"]');
            assertEqual('a1,a2', results.map((el) => el.id).join(','));
        });
    });

    describeGroup('structural pseudo-classes', ({ it: itPseudo }) => {
        itPseudo('nth-child(2n) matches even positions', () => {
            const doc = parseHTML('<ul><li id="a"></li><li id="b"></li><li id="c"></li><li id="d"></li></ul>');
            const results = doc.querySelectorAll('li:nth-child(2n)');
            assertEqual('b,d', results.map((el) => el.id).join(','));
        });

        itPseudo('nth-of-type(1) matches the first of its tag among siblings', () => {
            const doc = parseHTML('<div><span id="s1"></span><p id="p1"></p><span id="s2"></span></div>');
            assertEqual('s1', doc.querySelector('span:nth-of-type(1)').id);
        });

        itPseudo('first-child, last-child, and only-child', () => {
            const doc = parseHTML('<ul><li id="a"></li><li id="b"></li></ul><ol><li id="only"></li></ol>');
            assertEqual('a', doc.querySelector('li:first-child').id);
            assertEqual(2, doc.querySelectorAll('li:last-child').length);
            assertEqual('only', doc.querySelector('li:only-child').id);
        });

        itPseudo(':empty is true for no children and false otherwise', () => {
            const doc = parseHTML('<div id="empty"></div><div id="full">x</div>');
            assertEqual('empty', doc.querySelector('div:empty').id);
            assertEqual(null, doc.querySelector('#full:empty'));
        });

        itPseudo(':root matches only documentElement', () => {
            const doc = parseHTML('<p>x</p>');
            assertEqual(doc.documentElement, doc.querySelector(':root'));
            assertEqual(null, doc.querySelector('p:root'));
        });
    });

    describeGroup(':not(), :is(), and :where()', ({ it: itLogical }) => {
        itLogical('work with multi-selector arguments', () => {
            const doc = parseHTML('<p id="a" class="x"></p><p id="b" class="y"></p><p id="c"></p>');
            assertEqual('c', doc.querySelector('p:not(.x, .y)').id);
            assertEqual('a,b', doc.querySelectorAll('p:is(.x, .y)').map((el) => el.id).join(','));
            assertEqual('a,b', doc.querySelectorAll('p:where(.x, .y)').map((el) => el.id).join(','));
        });
    });

    describeGroup('closest', ({ it: itClosest }) => {
        itClosest('finds the element itself when it matches', () => {
            const doc = parseHTML('<div class="x"></div>');
            const div = doc.querySelector('.x');
            assertEqual(div, div.closest('.x'));
        });

        itClosest('walks ancestors otherwise', () => {
            const doc = parseHTML('<section class="scope"><p><b>x</b></p></section>');
            const b = doc.querySelector('b');
            assertEqual('SECTION', b.closest('.scope').tagName);
        });

        itClosest('returns null at the top when nothing matches', () => {
            const doc = parseHTML('<p>x</p>');
            assertEqual(null, doc.querySelector('p').closest('.nope'));
        });
    });

    it('document.querySelector behaves like an element\'s', () => {
        const doc = parseHTML('<p class="x">hi</p>');
        assertEqual('hi', doc.querySelector('.x').textContent);
    });

    describeGroup('invalid selectors', ({ it: itInvalid }) => {
        itInvalid('throws SelectorSyntaxError from querySelector', () => {
            const doc = parseHTML('<p></p>');
            const caught = catchError(() => doc.querySelector(':hover'));
            assert(caught instanceof SelectorSyntaxError);
        });

        itInvalid('throws SelectorSyntaxError from querySelectorAll', () => {
            const doc = parseHTML('<p></p>');
            const caught = catchError(() => doc.querySelectorAll(':hover'));
            assert(caught instanceof SelectorSyntaxError);
        });

        itInvalid('throws SelectorSyntaxError from closest', () => {
            const doc = parseHTML('<p></p>');
            const p = doc.querySelector('p');
            const caught = catchError(() => p.closest(':hover'));
            assert(caught instanceof SelectorSyntaxError);
        });
    });
});
