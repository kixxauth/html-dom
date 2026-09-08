/**
 * @module character-references
 */

import { CHARACTER_REFERENCE_TABLE } from './character-reference-table.js';

const REPLACEMENT_CHARACTER = '�';

// The HTML spec's "numeric character reference end state" remaps this
// Windows-1252 C1 control range onto Unicode punctuation, because that is
// what every browser actually does with a numeric reference in this range.
// A code point in the range with no entry here (0x81, 0x8D, 0x8F, 0x90, 0x9D)
// is used as-is.
const WINDOWS_1252_C1_REMAP = new Map([
    [ 0x80, 0x20AC ],
    [ 0x82, 0x201A ],
    [ 0x83, 0x0192 ],
    [ 0x84, 0x201E ],
    [ 0x85, 0x2026 ],
    [ 0x86, 0x2020 ],
    [ 0x87, 0x2021 ],
    [ 0x88, 0x02C6 ],
    [ 0x89, 0x2030 ],
    [ 0x8A, 0x0160 ],
    [ 0x8B, 0x2039 ],
    [ 0x8C, 0x0152 ],
    [ 0x8E, 0x017D ],
    [ 0x91, 0x2018 ],
    [ 0x92, 0x2019 ],
    [ 0x93, 0x201C ],
    [ 0x94, 0x201D ],
    [ 0x95, 0x2022 ],
    [ 0x96, 0x2013 ],
    [ 0x97, 0x2014 ],
    [ 0x98, 0x02DC ],
    [ 0x99, 0x2122 ],
    [ 0x9A, 0x0161 ],
    [ 0x9B, 0x203A ],
    [ 0x9C, 0x0153 ],
    [ 0x9E, 0x017E ],
    [ 0x9F, 0x0178 ],
]);

function isAsciiAlphanumeric(char) {
    return /^[A-Za-z0-9]$/.test(char);
}

function isAsciiDigit(char) {
    return char >= '0' && char <= '9';
}

function isAsciiHexDigit(char) {
    return /^[0-9A-Fa-f]$/.test(char);
}

function codePointToString(codePoint) {
    if (codePoint === 0 || (codePoint >= 0xD800 && codePoint <= 0xDFFF) || codePoint > 0x10FFFF) {
        return REPLACEMENT_CHARACTER;
    }

    if (codePoint >= 0x80 && codePoint <= 0x9F) {
        const remapped = WINDOWS_1252_C1_REMAP.get(codePoint);
        return String.fromCodePoint(remapped === undefined ? codePoint : remapped);
    }

    return String.fromCodePoint(codePoint);
}

// Numeric references are required to carry a trailing ";" in this project,
// matching the named-reference rule below. Returns null when the text at
// ampersandIndex is not a well-formed "&#...;" reference so the caller can
// fall back to literal text.
function decodeNumericReference(text, ampersandIndex) {
    const isHex = text[ampersandIndex + 2] === 'x' || text[ampersandIndex + 2] === 'X';
    const digitsStart = ampersandIndex + (isHex ? 3 : 2);
    const isDigit = isHex ? isAsciiHexDigit : isAsciiDigit;

    let cursor = digitsStart;

    while (cursor < text.length && isDigit(text[cursor])) {
        cursor += 1;
    }

    if (cursor === digitsStart || text[cursor] !== ';') {
        return null;
    }

    const digits = text.slice(digitsStart, cursor);
    const codePoint = parseInt(digits, isHex ? 16 : 10);

    return {
        text: codePointToString(codePoint),
        nextIndex: cursor + 1,
    };
}

// Named references are required to carry a trailing ";" in this project.
// Every entity name is ASCII alphanumeric, so the run of alphanumeric
// characters after "&" up to the first ";" is the only possible name
// boundary — no shorter or longer candidate needs to be tried.
function decodeNamedReference(text, ampersandIndex) {
    let cursor = ampersandIndex + 1;

    while (cursor < text.length && isAsciiAlphanumeric(text[cursor])) {
        cursor += 1;
    }

    if (text[cursor] !== ';') {
        return null;
    }

    const name = text.slice(ampersandIndex + 1, cursor + 1);
    const replacement = CHARACTER_REFERENCE_TABLE[name];

    if (replacement === undefined) {
        return null;
    }

    return {
        text: replacement,
        nextIndex: cursor + 1,
    };
}

/**
 * Decodes HTML character references (named, decimal, and hexadecimal) in a
 * string of text. A malformed or unknown reference is left as literal text
 * rather than raising an error, matching how a browser recovers from one.
 * @param {string} text - Text that may contain character references.
 * @returns {string} The text with every well-formed reference replaced.
 */
export function decodeCharacterReferences(text) {
    if (!text.includes('&')) {
        return text;
    }

    let result = '';
    let index = 0;

    while (index < text.length) {
        const ampersandIndex = text.indexOf('&', index);

        if (ampersandIndex === -1) {
            result += text.slice(index);
            break;
        }

        result += text.slice(index, ampersandIndex);

        const decoded = text[ampersandIndex + 1] === '#'
            ? decodeNumericReference(text, ampersandIndex)
            : decodeNamedReference(text, ampersandIndex);

        if (decoded) {
            result += decoded.text;
            index = decoded.nextIndex;
        } else {
            result += '&';
            index = ampersandIndex + 1;
        }
    }

    return result;
}
