/**
 * @module tokenizer
 */

import { RAW_TEXT_ELEMENTS, RCDATA_ELEMENTS } from './html-tags.js';
import { decodeCharacterReferences } from './character-references.js';

function isAsciiLetter(char) {
    return Boolean(char) && /^[A-Za-z]$/.test(char);
}

function isAsciiWhitespace(char) {
    return char === ' ' || char === '\t' || char === '\n' || char === '\f' || char === '\r';
}

function skipWhitespace(source, cursor) {
    let index = cursor;

    while (index < source.length && isAsciiWhitespace(source[index])) {
        index += 1;
    }

    return index;
}

function parseErrorToken(code, message, offset) {
    return { type: 'parseError', code, message, offset };
}

// Scans a comment body starting where "<!--" ends and returns the closing
// delimiter's position, or -1 when the source runs out first.
function findCommentEnd(source, contentStart) {
    return source.indexOf('-->', contentStart);
}

function scanComment(source, index) {
    const contentStart = index + 4;
    const endIndex = findCommentEnd(source, contentStart);

    if (endIndex === -1) {
        return {
            tokens: [
                { type: 'comment', data: source.slice(contentStart), offset: index },
                parseErrorToken('eof-in-comment', 'Unexpected end of input inside a comment.', index),
            ],
            nextCursor: source.length,
        };
    }

    return {
        tokens: [
            { type: 'comment', data: source.slice(contentStart, endIndex), offset: index },
        ],
        nextCursor: endIndex + 3,
    };
}

// Consumes source up to (and including) the next ">" for markup this
// tokenizer treats as a bogus comment: malformed "<!...>", CDATA sections,
// and "</" not followed by a letter. All three degrade to a comment node
// carrying the raw text between the opening delimiter and ">".
function scanBogusComment(source, index, dataStart, code, message) {
    const gtIndex = source.indexOf('>', dataStart);

    if (gtIndex === -1) {
        return {
            tokens: [
                { type: 'comment', data: source.slice(dataStart), offset: index },
                parseErrorToken(code, message, index),
            ],
            nextCursor: source.length,
        };
    }

    return {
        tokens: [
            { type: 'comment', data: source.slice(dataStart, gtIndex), offset: index },
            parseErrorToken(code, message, index),
        ],
        nextCursor: gtIndex + 1,
    };
}

// Reads a single-quoted or double-quoted string starting at `cursor`, which
// must point at the opening quote. Returns null when the quote is never
// closed, so the caller can decide how to recover.
function scanQuotedString(source, cursor) {
    const quote = source[cursor];
    const contentStart = cursor + 1;
    const endIndex = source.indexOf(quote, contentStart);

    if (endIndex === -1) {
        return null;
    }

    return { value: source.slice(contentStart, endIndex), nextCursor: endIndex + 1 };
}

function scanDoctype(source, index) {
    let cursor = skipWhitespace(source, index + 9);

    let nameEnd = cursor;
    while (nameEnd < source.length && !isAsciiWhitespace(source[nameEnd]) && source[nameEnd] !== '>') {
        nameEnd += 1;
    }

    const name = source.slice(cursor, nameEnd).toLowerCase() || null;
    cursor = skipWhitespace(source, nameEnd);

    let publicId = null;
    let systemId = null;

    const keyword = source.slice(cursor, cursor + 6).toUpperCase();

    if (keyword === 'PUBLIC') {
        cursor = skipWhitespace(source, cursor + 6);
        if (source[cursor] === '"' || source[cursor] === '\'') {
            const quoted = scanQuotedString(source, cursor);
            if (quoted) {
                publicId = quoted.value;
                cursor = skipWhitespace(source, quoted.nextCursor);
            }
        }
        if (source[cursor] === '"' || source[cursor] === '\'') {
            const quoted = scanQuotedString(source, cursor);
            if (quoted) {
                systemId = quoted.value;
                cursor = quoted.nextCursor;
            }
        }
    } else if (keyword === 'SYSTEM') {
        cursor = skipWhitespace(source, cursor + 6);
        if (source[cursor] === '"' || source[cursor] === '\'') {
            const quoted = scanQuotedString(source, cursor);
            if (quoted) {
                systemId = quoted.value;
                cursor = quoted.nextCursor;
            }
        }
    }

    const gtIndex = source.indexOf('>', cursor);
    const doctypeToken = {
        type: 'doctype', name, publicId, systemId, offset: index,
    };

    if (gtIndex === -1) {
        return {
            tokens: [
                doctypeToken,
                parseErrorToken('eof-in-doctype', 'Unexpected end of input inside a doctype.', index),
            ],
            nextCursor: source.length,
        };
    }

    return { tokens: [ doctypeToken ], nextCursor: gtIndex + 1 };
}

function scanEndTag(source, index) {
    if (!isAsciiLetter(source[index + 2])) {
        return scanBogusComment(
            source,
            index,
            index + 2,
            'invalid-first-character-of-tag-name',
            'An end tag name must start with an ASCII letter.',
        );
    }

    let cursor = index + 2;
    const nameStart = cursor;

    while (cursor < source.length && !isAsciiWhitespace(source[cursor]) && source[cursor] !== '/' && source[cursor] !== '>') {
        cursor += 1;
    }

    const rawName = source.slice(nameStart, cursor);
    const name = rawName.toLowerCase();

    // Attributes on an end tag are non-standard and ignored, but their
    // quoted values may contain ">"; skip them without splitting the tag.
    while (cursor < source.length && source[cursor] !== '>') {
        if (source[cursor] === '"' || source[cursor] === '\'') {
            const quoted = scanQuotedString(source, cursor);
            cursor = quoted ? quoted.nextCursor : source.length;
        } else {
            cursor += 1;
        }
    }

    if (cursor >= source.length) {
        return {
            tokens: [
                parseErrorToken('eof-in-tag', 'Unexpected end of input inside a tag.', index),
            ],
            nextCursor: source.length,
        };
    }

    return {
        tokens: [
            { type: 'endTag', name, rawName, offset: index },
        ],
        nextCursor: cursor + 1,
    };
}

// Parses one attribute starting at `cursor`, which must not be whitespace,
// ">", or "/". Returns null only when the name is empty, which happens for
// a stray "=" the caller should skip past to keep the scan progressing.
function scanAttribute(source, cursor) {
    const nameStart = cursor;
    let index = cursor;

    while (index < source.length
        && !isAsciiWhitespace(source[index])
        && source[index] !== '/'
        && source[index] !== '>'
        && source[index] !== '=') {
        index += 1;
    }

    if (index === nameStart) {
        return null;
    }

    const rawName = source.slice(nameStart, index);
    const name = rawName.toLowerCase();

    index = skipWhitespace(source, index);

    let value = '';

    if (source[index] === '=') {
        index = skipWhitespace(source, index + 1);

        if (source[index] === '"' || source[index] === '\'') {
            const quoted = scanQuotedString(source, index);
            if (quoted) {
                value = quoted.value;
                index = quoted.nextCursor;
            } else {
                value = source.slice(index + 1);
                index = source.length;
            }
        } else {
            const valueStart = index;
            while (index < source.length && !isAsciiWhitespace(source[index]) && source[index] !== '>') {
                index += 1;
            }
            value = source.slice(valueStart, index);
        }

        value = decodeCharacterReferences(value);
    }

    return { name, rawName, value, nextCursor: index };
}

function scanStartTag(source, index) {
    let cursor = index + 1;
    const nameStart = cursor;

    while (cursor < source.length && !isAsciiWhitespace(source[cursor]) && source[cursor] !== '/' && source[cursor] !== '>') {
        cursor += 1;
    }

    const rawName = source.slice(nameStart, cursor);
    const name = rawName.toLowerCase();

    const attributes = [];
    const errors = [];
    let selfClosing = false;

    for (;;) {
        cursor = skipWhitespace(source, cursor);

        if (cursor >= source.length) {
            return {
                tokens: [
                    ...errors,
                    parseErrorToken('eof-in-tag', 'Unexpected end of input inside a tag.', index),
                ],
                nextCursor: source.length,
            };
        }

        if (source[cursor] === '>') {
            cursor += 1;
            break;
        }

        if (source[cursor] === '/') {
            if (source[cursor + 1] === '>') {
                selfClosing = true;
                cursor += 2;
                break;
            }
            cursor += 1;
            continue;
        }

        const attribute = scanAttribute(source, cursor);

        if (!attribute) {
            // A stray "=" with no name before it; skip one character so the
            // scan always makes progress.
            cursor += 1;
            continue;
        }

        if (attributes.some((existing) => existing.name === attribute.name)) {
            errors.push(parseErrorToken(
                'duplicate-attribute',
                `Attribute "${ attribute.name }" already appeared on this tag.`,
                cursor,
            ));
        } else {
            attributes.push({ name: attribute.name, rawName: attribute.rawName, value: attribute.value });
        }

        cursor = attribute.nextCursor;
    }

    const startTagToken = {
        type: 'startTag', name, rawName, attributes, selfClosing, offset: index,
    };

    return { tokens: [ ...errors, startTagToken ], nextCursor: cursor };
}

// Finds the next "</name" end tag for a raw text / RCDATA element,
// matching the name case-insensitively and requiring it be followed by
// whitespace, "/", ">", or end of input, per the tokenizer's raw text
// end tag open state.
function findRawTextEndTag(source, searchStart, name) {
    let searchIndex = searchStart;

    for (;;) {
        const candidate = source.indexOf('</', searchIndex);
        if (candidate === -1) {
            return null;
        }

        const nameStart = candidate + 2;
        const nameEnd = nameStart + name.length;
        const candidateName = source.slice(nameStart, nameEnd);
        const delimiter = source[nameEnd];
        const isDelimiterValid = delimiter === undefined
            || isAsciiWhitespace(delimiter)
            || delimiter === '/'
            || delimiter === '>';

        if (candidateName.toLowerCase() === name && isDelimiterValid) {
            return candidate;
        }

        searchIndex = candidate + 2;
    }
}

function scanRawTextContent(source, contentStart, name, decode) {
    const endTagIndex = findRawTextEndTag(source, contentStart, name);

    if (endTagIndex === null) {
        const data = source.slice(contentStart);
        return {
            tokens: data ? [ { type: 'text', data: decode ? decodeCharacterReferences(data) : data, offset: contentStart } ] : [],
            nextCursor: source.length,
        };
    }

    const data = source.slice(contentStart, endTagIndex);
    const tokens = data
        ? [ { type: 'text', data: decode ? decodeCharacterReferences(data) : data, offset: contentStart } ]
        : [];

    const endTag = scanEndTag(source, endTagIndex);
    tokens.push(...endTag.tokens);

    return { tokens, nextCursor: endTag.nextCursor };
}

// Classifies the markup construct starting at `index`, where
// source[index] === '<'. Returns null when nothing recognizable follows,
// so the caller treats the "<" as literal text.
function scanConstruct(source, index) {
    const next = source[index + 1];

    if (next === '!') {
        if (source.startsWith('<!--', index)) {
            return scanComment(source, index);
        }
        if (source.slice(index + 2, index + 9).toLowerCase() === 'doctype') {
            return scanDoctype(source, index);
        }
        if (source.startsWith('<![CDATA[', index)) {
            return scanBogusComment(
                source,
                index,
                index + 2,
                'cdata-in-html-content',
                'CDATA sections are only recognized inside foreign content.',
            );
        }
        return scanBogusComment(
            source,
            index,
            index + 2,
            'incorrectly-opened-comment',
            'Expected "<!--" to start a comment.',
        );
    }

    if (next === '/') {
        return scanEndTag(source, index);
    }

    if (isAsciiLetter(next)) {
        const startTag = scanStartTag(source, index);

        const tagToken = startTag.tokens[startTag.tokens.length - 1];
        const isRawText = RAW_TEXT_ELEMENTS.has(tagToken.name);
        const isRcdata = RCDATA_ELEMENTS.has(tagToken.name);

        if (isRawText || isRcdata) {
            const content = scanRawTextContent(source, startTag.nextCursor, tagToken.name, isRcdata);
            return {
                tokens: [ ...startTag.tokens, ...content.tokens ],
                nextCursor: content.nextCursor,
            };
        }

        return startTag;
    }

    return null;
}

/**
 * Scans an HTML string into a stream of tokens. Never throws: malformed
 * markup yields a `parseError` token describing the recovery and scanning
 * continues.
 * @param {string} source - Preprocessed HTML source (BOM stripped, line
 *   endings normalized).
 * @returns {Generator<Object>} Tokens in source order. See the module
 *   documentation for the shape of each `type`.
 */
export function* tokenize(source) {
    let cursor = 0;
    let textStart = 0;

    while (cursor < source.length) {
        const ltIndex = source.indexOf('<', cursor);

        if (ltIndex === -1) {
            break;
        }

        const construct = scanConstruct(source, ltIndex);

        if (!construct) {
            cursor = ltIndex + 1;
            continue;
        }

        if (ltIndex > textStart) {
            yield { type: 'text', data: decodeCharacterReferences(source.slice(textStart, ltIndex)), offset: textStart };
        }

        yield* construct.tokens;

        cursor = construct.nextCursor;
        textStart = cursor;
    }

    if (textStart < source.length) {
        yield { type: 'text', data: decodeCharacterReferences(source.slice(textStart)), offset: textStart };
    }
}
