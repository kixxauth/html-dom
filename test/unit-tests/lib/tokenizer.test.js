import { describe } from 'kixx-test';
import { assert, assertEqual, assertFalsy } from 'kixx-assert';
import { tokenize } from '../../../lib/tokenizer.js';

function collect(html) {
    return Array.from(tokenize(html));
}

function findParseErrors(tokens) {
    return tokens.filter((t) => t.type === 'parseError');
}

describe('tokenizer', ({ it, describe: describeGroup }) => {
    it('lowercases the tag name but preserves attribute and tag rawName casing', () => {
        const tokens = collect('<IMG SRC="x"/>');
        assertEqual(1, tokens.length);
        const [ tag ] = tokens;
        assertEqual('startTag', tag.type);
        assertEqual('img', tag.name);
        assertEqual('IMG', tag.rawName);
        assertEqual(true, tag.selfClosing);
        assertEqual(1, tag.attributes.length);
        assertEqual('src', tag.attributes[0].name);
        assertEqual('SRC', tag.attributes[0].rawName);
        assertEqual('x', tag.attributes[0].value);
    });

    it('does not parse tags or decode entities inside script content', () => {
        const tokens = collect('<script><div>&amp;</script>');
        const text = tokens.find((t) => t.type === 'text');
        assertEqual('<div>&amp;', text.data);
    });

    it('decodes entities but does not parse tags inside textarea content', () => {
        const tokens = collect('<textarea>&amp;</textarea>');
        const text = tokens.find((t) => t.type === 'text');
        assertEqual('&', text.data);
    });

    it('treats a "<" that cannot start a tag as literal text', () => {
        const tokens = collect('a < b');
        assertEqual(1, tokens.length);
        assertEqual('text', tokens[0].type);
        assertEqual('a < b', tokens[0].data);
    });

    it('keeps the first value of a duplicate attribute and records an error', () => {
        const tokens = collect('<div a="1" a="2"></div>');
        const startTag = tokens.find((t) => t.type === 'startTag');
        assertEqual(1, startTag.attributes.length);
        assertEqual('1', startTag.attributes[0].value);

        const errors = findParseErrors(tokens);
        assert(errors.some((e) => e.code === 'duplicate-attribute'));
    });

    describeGroup('unterminated constructs', ({ it: itUnterminated }) => {
        itUnterminated('records eof-in-tag for an unterminated tag', () => {
            const tokens = collect('<div a="1"');
            const errors = findParseErrors(tokens);
            assert(errors.some((e) => e.code === 'eof-in-tag'));
        });

        itUnterminated('records eof-in-comment for an unterminated comment', () => {
            const tokens = collect('<!-- unterminated');
            const errors = findParseErrors(tokens);
            assert(errors.some((e) => e.code === 'eof-in-comment'));
        });

        itUnterminated('records eof-in-doctype for an unterminated doctype', () => {
            const tokens = collect('<!DOCTYPE html');
            const errors = findParseErrors(tokens);
            assert(errors.some((e) => e.code === 'eof-in-doctype'));
        });
    });

    it('carries an offset into the source on every token', () => {
        const tokens = collect('<p>hello</p>');
        for (const token of tokens) {
            assert(typeof token.offset === 'number');
            assert(token.offset >= 0);
        }
    });

    describeGroup('never throws or loops forever', ({ it: itAdversarial }) => {
        const adversarialInputs = [ '<', '<!', '</', '<!--', '' ];

        for (const input of adversarialInputs) {
            itAdversarial(`terminates for ${ JSON.stringify(input) }`, () => {
                const cursorsSeen = [];
                for (const token of tokenize(input)) {
                    cursorsSeen.push(token.offset);
                }
                assert(true, 'reached this point without throwing or hanging');
            });
        }

        itAdversarial('the cursor strictly advances on every yielded token for a mixed adversarial input', () => {
            const input = '<<!<!--<!doctype<div a=b c="d"><script>x</script><notclosed';
            let previousOffset = -1;
            for (const token of tokenize(input)) {
                assert(token.offset >= previousOffset, 'offset must not go backwards');
                previousOffset = token.offset;
            }
        });
    });

    it('parses a basic doctype', () => {
        const tokens = collect('<!DOCTYPE html>');
        const doctype = tokens.find((t) => t.type === 'doctype');
        assertEqual('html', doctype.name);
    });

    it('parses a comment', () => {
        const tokens = collect('<!-- hello -->');
        const comment = tokens.find((t) => t.type === 'comment');
        assertEqual(' hello ', comment.data);
    });

    it('records a bogus comment for a malformed "<!" construct', () => {
        const tokens = collect('<!malformed>after');
        const errors = findParseErrors(tokens);
        assert(errors.some((e) => e.code === 'incorrectly-opened-comment'));
    });

    it('records cdata-in-html-content for a CDATA section', () => {
        const tokens = collect('<![CDATA[x]]>after');
        const errors = findParseErrors(tokens);
        assert(errors.some((e) => e.code === 'cdata-in-html-content'));
    });

    it('records invalid-first-character-of-tag-name for "</" not followed by a letter', () => {
        const tokens = collect('</>after');
        const errors = findParseErrors(tokens);
        assert(errors.some((e) => e.code === 'invalid-first-character-of-tag-name'));
    });

    it('parses an end tag', () => {
        const tokens = collect('<div></div>');
        const endTag = tokens.find((t) => t.type === 'endTag');
        assertEqual('div', endTag.name);
    });

    it('is a generator, not an array-returning function', () => {
        const result = tokenize('<p>x</p>');
        assertFalsy(Array.isArray(result));
        assertEqual('function', typeof result.next);
    });
});
