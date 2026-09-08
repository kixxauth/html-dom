import { describe } from 'kixx-test';
import { assertEqual } from 'kixx-assert';
import { decodeCharacterReferences } from '../../../lib/character-references.js';

describe('character-references', ({ it }) => {
    it('returns a string with no & unchanged', () => {
        const input = 'plain text';
        assertEqual(input, decodeCharacterReferences(input));
    });

    it('decodes a common named reference', () => {
        assertEqual('&', decodeCharacterReferences('&amp;'));
    });

    it('decodes &nbsp;', () => {
        assertEqual(' ', decodeCharacterReferences('&nbsp;'));
    });

    it('decodes a multi-code-point named reference', () => {
        assertEqual('≂̸', decodeCharacterReferences('&NotEqualTilde;'));
    });

    it('decodes a name that is a proper prefix of a longer name', () => {
        assertEqual('⋒', decodeCharacterReferences('&Cap;'));
    });

    it('decodes the longer name rather than stopping early', () => {
        assertEqual('ⅅ', decodeCharacterReferences('&CapitalDifferentialD;'));
    });

    it('leaves an unterminated named reference literal', () => {
        assertEqual('&amp no semicolon', decodeCharacterReferences('&amp no semicolon'));
    });

    it('leaves an unknown named reference literal', () => {
        assertEqual('&notaname;', decodeCharacterReferences('&notaname;'));
    });

    it('decodes a decimal numeric reference', () => {
        assertEqual('&', decodeCharacterReferences('&#38;'));
    });

    it('decodes a hexadecimal numeric reference', () => {
        assertEqual('&', decodeCharacterReferences('&#x26;'));
        assertEqual('&', decodeCharacterReferences('&#X26;'));
    });

    it('replaces &#0; with U+FFFD', () => {
        assertEqual('�', decodeCharacterReferences('&#0;'));
    });

    it('replaces a surrogate code point with U+FFFD', () => {
        assertEqual('�', decodeCharacterReferences('&#xD800;'));
    });

    it('maps &#151; through the Windows-1252 C1 table to an em dash', () => {
        assertEqual('—', decodeCharacterReferences('&#151;'));
    });

    it('replaces a code point above U+10FFFF with U+FFFD', () => {
        assertEqual('�', decodeCharacterReferences('&#x110000;'));
    });

    it('leaves an unterminated numeric reference literal', () => {
        assertEqual('&#38 no semicolon', decodeCharacterReferences('&#38 no semicolon'));
    });

    it('never throws for a lone ampersand or empty string', () => {
        assertEqual('&', decodeCharacterReferences('&'));
        assertEqual('', decodeCharacterReferences(''));
    });
});
