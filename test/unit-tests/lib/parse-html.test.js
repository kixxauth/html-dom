import { describe } from 'kixx-test';
import { assert, assertEqual } from 'kixx-assert';
import { parseHTML } from '../../../lib/parse-html.js';

function catchError(fn) {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return null;
}

describe('parseHTML', ({ it, describe: describeGroup }) => {
    it('returns a Document with non-null documentElement, head, and body for empty input', () => {
        const document = parseHTML('');
        assert(document.documentElement);
        assert(document.head);
        assert(document.body);
        assertEqual(0, document.parseErrors.length);
    });

    it('throws a TypeError for a non-string argument', () => {
        const caught = catchError(() => parseHTML(42));
        assert(caught, 'expected an error to be thrown');
        assertEqual('TypeError', caught.name);
    });

    describeGroup('never throws for malformed input', ({ it: itMalformed }) => {
        const malformedInputs = [
            '<',
            '<!',
            '</',
            '<div><span></div>',
            '<div a="1',
            '</div></span></p>',
        ];

        for (const input of malformedInputs) {
            itMalformed(`returns a Document for ${ JSON.stringify(input) }`, () => {
                const document = parseHTML(input);
                assert(document.documentElement);
            });
        }
    });

    it('strips a leading BOM before parsing', () => {
        const document = parseHTML('﻿<p>hi</p>');
        assertEqual('hi', document.body.children[0].textContent);
    });

    it('normalizes CRLF and lone CR to LF before recording offsets', () => {
        const document = parseHTML('<p>a</p>\r\n</section>\rmore');
        const error = document.parseErrors.find((e) => e.code === 'stray-end-tag');
        assertEqual(2, error.line);
    });

    describeGroup('parse error line and column resolution', ({ it: itErrors }) => {
        itErrors('points at the stray end tag', () => {
            const document = parseHTML('text</section>more');
            const error = document.parseErrors.find((e) => e.code === 'stray-end-tag');
            assertEqual(1, error.line);
            assertEqual(5, error.column);
        });

        itErrors('produces a frozen, empty array and skips the line index for a clean document', () => {
            const document = parseHTML('<p>clean</p>');
            assertEqual(0, document.parseErrors.length);
            assert(Object.isFrozen(document.parseErrors));
        });
    });

    it('exports parseHTML and all seven classes from mod.js', async () => {
        const mod = await import('../../../mod.js');
        for (const name of [ 'parseHTML', 'Node', 'ParentNode', 'CharacterData', 'Text', 'Comment', 'Element', 'Document' ]) {
            assert(mod[name], `expected mod.js to export ${ name }`);
        }
    });
});
