/**
 * @module parse-html
 */

import { tokenize } from './tokenizer.js';
import { buildTree } from './tree-builder.js';

const BOM = '﻿';

// Normalizes line endings to LF and strips a leading BOM before tokenizing,
// so every offset the tokenizer and tree builder record indexes into this
// normalized string rather than the caller's original one.
function preprocess(html) {
    let source = html;

    if (source.startsWith(BOM)) {
        source = source.slice(1);
    }

    return source.replace(/\r\n?/g, '\n');
}

// Builds a sorted index of the offset just after every "\n" in `source`, so
// that resolveErrorPositions() can turn a byte offset into a 1-based line
// and column with a binary search instead of rescanning the source once per
// error.
function buildLineStartIndex(source) {
    const lineStarts = [ 0 ];

    for (let index = 0; index < source.length; index += 1) {
        if (source[index] === '\n') {
            lineStarts.push(index + 1);
        }
    }

    return lineStarts;
}

function findLineIndex(lineStarts, offset) {
    let low = 0;
    let high = lineStarts.length - 1;

    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (lineStarts[mid] <= offset) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    return low;
}

// Resolving line/column is deferred until we know at least one error
// happened, so a clean document never pays for the line-start scan.
function resolveErrorPositions(errors, source) {
    if (errors.length === 0) {
        return [];
    }

    const lineStarts = buildLineStartIndex(source);

    return errors.map((error) => {
        const lineIndex = findLineIndex(lineStarts, error.offset);
        return Object.freeze({
            code: error.code,
            message: error.message,
            offset: error.offset,
            line: lineIndex + 1,
            column: error.offset - lineStarts[lineIndex] + 1,
        });
    });
}

/**
 * Parses an HTML string into a read-only `Document`. Never throws for
 * malformed markup — recoveries are recorded on the returned document's
 * `parseErrors` — but does throw for a caller error: a non-string argument.
 * @param {string} html - The HTML source to parse.
 * @returns {Document} The parsed document. `documentElement`, `head`, and
 *   `body` are always non-null, even for empty input.
 * @throws {TypeError} When `html` is not a string.
 */
export function parseHTML(html) {
    if (typeof html !== 'string') {
        throw new TypeError(`parseHTML() expects a string, received ${ typeof html }.`);
    }

    const source = preprocess(html);
    const { document, errors } = buildTree(tokenize(source));

    document.setParseErrors(resolveErrorPositions(errors, source));

    return document;
}
