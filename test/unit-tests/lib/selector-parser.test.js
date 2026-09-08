import { describe } from 'kixx-test';
import { assert, assertEqual } from 'kixx-assert';
import { parseSelector, SelectorSyntaxError } from '../../../lib/selector-parser.js';

function catchError(fn) {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return null;
}

describe('selector-parser', ({ it, describe: describeGroup }) => {
    describeGroup('basic compounds', ({ it: itCompound }) => {
        itCompound('parses a type selector', () => {
            const [ ast ] = parseSelector('div');
            assertEqual('div', ast.compound.tag);
            assertEqual(null, ast.combinator);
            assertEqual(null, ast.left);
        });

        itCompound('parses the universal selector as a null tag', () => {
            const [ ast ] = parseSelector('*');
            assertEqual(null, ast.compound.tag);
        });

        itCompound('parses #id and .class', () => {
            const [ ast ] = parseSelector('div.a.b#main');
            assertEqual('div', ast.compound.tag);
            assertEqual('main', ast.compound.id);
            assertEqual('a,b', ast.compound.classes.join(','));
        });

        itCompound('lowercases the tag name', () => {
            const [ ast ] = parseSelector('DIV');
            assertEqual('div', ast.compound.tag);
        });
    });

    describeGroup('combinators', ({ it: itCombinator }) => {
        itCombinator('parses descendant, child, adjacent, and sibling combinators', () => {
            const cases = [
                [ 'div p', ' ' ],
                [ 'div > p', '>' ],
                [ 'div + p', '+' ],
                [ 'div ~ p', '~' ],
            ];

            for (const [ selector, expectedCombinator ] of cases) {
                const [ ast ] = parseSelector(selector);
                assertEqual('p', ast.compound.tag);
                assertEqual(expectedCombinator, ast.combinator);
                assertEqual('div', ast.left.compound.tag);
                assertEqual(null, ast.left.combinator);
                assertEqual(null, ast.left.left);
            }
        });
    });

    it('parses a comma-separated selector list', () => {
        const selectors = parseSelector('a, b, c');
        assertEqual(3, selectors.length);
        assertEqual('a,b,c', selectors.map((s) => s.compound.tag).join(','));
    });

    describeGroup(':nth-*() expressions', ({ it: itNth }) => {
        itNth('compiles 2n+1, odd, -n+3, and 3', () => {
            const cases = [
                [ ':nth-child(2n+1)', { a: 2, b: 1 } ],
                [ ':nth-child(odd)', { a: 2, b: 1 } ],
                [ ':nth-child(even)', { a: 2, b: 0 } ],
                [ ':nth-child(-n+3)', { a: -1, b: 3 } ],
                [ ':nth-child(3)', { a: 0, b: 3 } ],
            ];

            for (const [ selector, expected ] of cases) {
                const [ ast ] = parseSelector(selector);
                const [ pseudo ] = ast.compound.pseudos;
                assertEqual('nth-child', pseudo.name);
                assertEqual(expected.a, pseudo.argument.a);
                assertEqual(expected.b, pseudo.argument.b);
            }
        });
    });

    it('parses :not() with a multi-selector argument', () => {
        const [ ast ] = parseSelector(':not(.a, .b)');
        const [ pseudo ] = ast.compound.pseudos;
        assertEqual('not', pseudo.name);
        assertEqual(2, pseudo.argument.length);
        assertEqual('a', pseudo.argument[0].compound.classes[0]);
        assertEqual('b', pseudo.argument[1].compound.classes[0]);
    });

    describeGroup('attribute selectors', ({ it: itAttr }) => {
        itAttr('parses the prefix operator', () => {
            const [ ast ] = parseSelector('[href^="/docs"]');
            const [ attr ] = ast.compound.attributes;
            assertEqual('href', attr.name);
            assertEqual('^=', attr.operator);
            assertEqual('/docs', attr.value);
        });

        itAttr('parses a bare presence selector', () => {
            const [ ast ] = parseSelector('[data-x]');
            const [ attr ] = ast.compound.attributes;
            assertEqual('data-x', attr.name);
            assertEqual(null, attr.operator);
            assertEqual(null, attr.value);
        });

        itAttr('parses the case-insensitivity flag', () => {
            const [ ast ] = parseSelector('[type="TEXT" i]');
            const [ attr ] = ast.compound.attributes;
            assertEqual('=', attr.operator);
            assertEqual('TEXT', attr.value);
            assert(attr.caseInsensitive);
        });
    });

    it('decodes an escaped class name to a single token', () => {
        const [ ast ] = parseSelector('.foo\\.bar');
        assertEqual(1, ast.compound.classes.length);
        assertEqual('foo.bar', ast.compound.classes[0]);
    });

    describeGroup('syntax errors', ({ it: itError }) => {
        const invalidSelectors = [ '', 'div >', '[href', ':not(.a' ];

        for (const selector of invalidSelectors) {
            itError(`throws for ${ JSON.stringify(selector) }`, () => {
                const caught = catchError(() => parseSelector(selector));
                assert(caught, 'expected an error to be thrown');
                assertEqual('SyntaxError', caught.name);
                assert(typeof caught.position === 'number');
                assert(caught instanceof SelectorSyntaxError);
            });
        }

        itError('names the construct for :has()', () => {
            const caught = catchError(() => parseSelector(':has(p)'));
            assert(caught.message.includes('has'));
        });

        itError('names the construct for a state pseudo-class', () => {
            const caught = catchError(() => parseSelector(':hover'));
            assert(caught.message.includes('hover'));
        });
    });

    describeGroup('the compiled-selector cache', ({ it: itCache }) => {
        itCache('returns the identical AST for the same selector string', () => {
            assertEqual(parseSelector('div p'), parseSelector('div p'));
        });

        itCache('survives eviction past the cache cap', () => {
            const first = parseSelector('.survive-eviction');

            for (let index = 0; index < 505; index += 1) {
                parseSelector(`.filler-${ index }`);
            }

            const again = parseSelector('.survive-eviction');
            assertEqual('survive-eviction', again[0].compound.classes[0]);
            assertEqual(first[0].compound.classes[0], again[0].compound.classes[0]);
        });
    });
});
