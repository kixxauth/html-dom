/**
 * @module selector-parser
 */

const CACHE_CAPACITY = 500;
const cache = new Map();

const SUPPORTED_SIMPLE_PSEUDOS = new Set([
    'first-child',
    'last-child',
    'only-child',
    'first-of-type',
    'last-of-type',
    'only-of-type',
    'empty',
    'root',
]);

const SUPPORTED_NTH_PSEUDOS = new Set([
    'nth-child',
    'nth-last-child',
    'nth-of-type',
    'nth-last-of-type',
]);

const SUPPORTED_SELECTOR_LIST_PSEUDOS = new Set([ 'not', 'is', 'where' ]);

const ATTRIBUTE_OPERATORS = [ '~=', '|=', '^=', '$=', '*=' ];

/**
 * Thrown for a malformed selector string. `name` is `'SyntaxError'` — not
 * the class name `SelectorSyntaxError` — so that generic error handling
 * written against `error.name` (matching what a browser's `DOMException`
 * reports) still works.
 */
export class SelectorSyntaxError extends SyntaxError {
    /**
     * @param {string} message - Description of what went wrong.
     * @param {string} selector - The full selector string being parsed.
     * @param {number} position - 0-based index into `selector`.
     */
    constructor(message, selector, position) {
        super(message);
        this.name = 'SyntaxError';
        this.selector = selector;
        this.position = position;
    }
}

// Thrown internally during parsing and always caught at the top of
// parseSelector(), which has the full selector string needed to build a
// SelectorSyntaxError. Keeping parse failures lightweight (message +
// position only) avoids threading the original string through every
// recursive-descent function.
class ParseFailure extends Error {
    constructor(message, position) {
        super(message);
        this.position = position;
    }
}

function fail(message, position) {
    throw new ParseFailure(message, position);
}

function isWhitespace(char) {
    return char === ' ' || char === '\t' || char === '\n' || char === '\f' || char === '\r';
}

function skipWhitespace(str, pos) {
    let index = pos;
    while (index < str.length && isWhitespace(str[index])) {
        index += 1;
    }
    return index;
}

function isHexDigit(char) {
    return Boolean(char) && /^[0-9A-Fa-f]$/.test(char);
}

function isIdentStartChar(char) {
    return Boolean(char) && (/^[A-Za-z_-]$/.test(char) || char.codePointAt(0) > 0x7F || char === '\\');
}

function isIdentChar(char) {
    return Boolean(char) && (/^[A-Za-z0-9_-]$/.test(char) || char.codePointAt(0) > 0x7F || char === '\\');
}

// Consumes one CSS escape starting at str[pos] === '\\': either one to six
// hex digits (plus one optional trailing whitespace character) naming a
// code point, or a single literal character.
function scanEscape(str, pos) {
    const first = str[pos + 1];

    if (isHexDigit(first)) {
        let index = pos + 1;
        let hex = '';
        while (index < str.length && hex.length < 6 && isHexDigit(str[index])) {
            hex += str[index];
            index += 1;
        }
        if (isWhitespace(str[index])) {
            index += 1;
        }
        return { value: String.fromCodePoint(parseInt(hex, 16)), nextPos: index };
    }

    if (first === undefined) {
        return { value: '', nextPos: pos + 1 };
    }

    return { value: first, nextPos: pos + 2 };
}

// Scans an identifier (element name, id, class name, attribute name,
// pseudo-class name, or attribute value), decoding escapes as it goes. This
// is what makes ".foo\.bar" scan to a single class named "foo.bar".
function scanIdentifier(str, pos) {
    let result = '';
    let index = pos;

    while (index < str.length) {
        const char = str[index];
        if (char === '\\') {
            const escape = scanEscape(str, index);
            result += escape.value;
            index = escape.nextPos;
        } else if (isIdentChar(char)) {
            result += char;
            index += 1;
        } else {
            break;
        }
    }

    return { value: result, nextPos: index };
}

function parseNth(str, pos) {
    const index = skipWhitespace(str, pos);

    if (str.slice(index, index + 3).toLowerCase() === 'odd' && !isIdentChar(str[index + 3])) {
        return { value: { a: 2, b: 1 }, nextPos: index + 3 };
    }
    if (str.slice(index, index + 4).toLowerCase() === 'even' && !isIdentChar(str[index + 4])) {
        return { value: { a: 2, b: 0 }, nextPos: index + 4 };
    }

    let cursor = index;
    let sign = 1;

    if (str[cursor] === '+') {
        cursor += 1;
    } else if (str[cursor] === '-') {
        sign = -1;
        cursor += 1;
    }

    let digits = '';
    while (/[0-9]/.test(str[cursor])) {
        digits += str[cursor];
        cursor += 1;
    }

    if (str[cursor] === 'n' || str[cursor] === 'N') {
        const a = sign * (digits === '' ? 1 : parseInt(digits, 10));
        cursor += 1;

        const afterN = skipWhitespace(str, cursor);
        if (str[afterN] === '+' || str[afterN] === '-') {
            const bSign = str[afterN] === '-' ? -1 : 1;
            const bStart = skipWhitespace(str, afterN + 1);
            let bDigits = '';
            let bCursor = bStart;
            while (/[0-9]/.test(str[bCursor])) {
                bDigits += str[bCursor];
                bCursor += 1;
            }
            if (bDigits === '') {
                fail('Expected digits after the sign in an nth expression.', bCursor);
            }
            return { value: { a, b: bSign * parseInt(bDigits, 10) }, nextPos: bCursor };
        }

        return { value: { a, b: 0 }, nextPos: cursor };
    }

    if (digits === '') {
        fail('Expected a number or "n" in an nth expression.', cursor);
    }

    return { value: { a: 0, b: sign * parseInt(digits, 10) }, nextPos: cursor };
}

function parseAttributeSelector(str, pos) {
    let index = skipWhitespace(str, pos + 1);

    const nameIdent = scanIdentifier(str, index);
    if (nameIdent.nextPos === index) {
        fail('Expected an attribute name.', index);
    }
    const name = nameIdent.value.toLowerCase();
    index = skipWhitespace(str, nameIdent.nextPos);

    if (str[index] === ']') {
        return { attribute: { name, operator: null, value: null, caseInsensitive: false }, nextPos: index + 1 };
    }

    let operator = null;
    const twoChar = str.slice(index, index + 2);

    if (ATTRIBUTE_OPERATORS.includes(twoChar)) {
        operator = twoChar;
        index += 2;
    } else if (str[index] === '=') {
        operator = '=';
        index += 1;
    } else {
        fail('Expected an attribute operator.', index);
    }

    index = skipWhitespace(str, index);

    let value;
    if (str[index] === '"' || str[index] === '\'') {
        const quote = str[index];
        const end = str.indexOf(quote, index + 1);
        if (end === -1) {
            fail('Unterminated attribute value.', index);
        }
        value = str.slice(index + 1, end);
        index = end + 1;
    } else {
        const valueIdent = scanIdentifier(str, index);
        if (valueIdent.nextPos === index) {
            fail('Expected an attribute value.', index);
        }
        value = valueIdent.value;
        index = valueIdent.nextPos;
    }

    index = skipWhitespace(str, index);

    let caseInsensitive = false;
    if ((str[index] === 'i' || str[index] === 'I') && !isIdentChar(str[index + 1])) {
        caseInsensitive = true;
        index = skipWhitespace(str, index + 1);
    }

    if (str[index] !== ']') {
        fail('Expected "]" to close an attribute selector.', index);
    }

    return { attribute: { name, operator, value, caseInsensitive }, nextPos: index + 1 };
}

function parsePseudo(str, pos) {
    const start = pos + 1;

    if (str[start] === ':') {
        fail('Pseudo-elements ("::") are not supported.', pos);
    }

    const nameIdent = scanIdentifier(str, start);
    if (nameIdent.nextPos === start) {
        fail('Expected a pseudo-class name after ":".', start);
    }
    const name = nameIdent.value.toLowerCase();
    let index = nameIdent.nextPos;

    if (str[index] === '(') {
        index = skipWhitespace(str, index + 1);

        if (SUPPORTED_NTH_PSEUDOS.has(name)) {
            const nth = parseNth(str, index);
            index = skipWhitespace(str, nth.nextPos);
            if (str[index] !== ')') {
                fail(`Expected ")" to close ":${ name }()".`, index);
            }
            return { pseudo: { name, argument: nth.value }, nextPos: index + 1 };
        }

        if (SUPPORTED_SELECTOR_LIST_PSEUDOS.has(name)) {
            const list = parseSelectorListInternal(str, index, ')');
            index = skipWhitespace(str, list.nextPos);
            if (str[index] !== ')') {
                fail(`Expected ")" to close ":${ name }()".`, index);
            }
            return { pseudo: { name, argument: list.selectors }, nextPos: index + 1 };
        }

        fail(`":${ name }()" is a recognized but unsupported pseudo-class.`, pos);
    }

    if (SUPPORTED_SIMPLE_PSEUDOS.has(name)) {
        return { pseudo: { name, argument: null }, nextPos: index };
    }

    fail(`":${ name }" is a recognized but unsupported pseudo-class.`, pos);
    return null;
}

// Parses one compound selector (a type/universal selector plus any run of
// #id, .class, [attr], and :pseudo pieces with no combinator between them).
// Returns null when `pos` is not the start of a compound at all, which
// happens at the end of input or just before a combinator/comma/")".
function parseCompound(str, pos) {
    let index = pos;
    let tag = null;
    let rawTag = null;
    let matchedAnything = false;

    if (str[index] === '*') {
        index += 1;
        matchedAnything = true;
    } else if (isIdentStartChar(str[index])) {
        const ident = scanIdentifier(str, index);
        tag = ident.value.toLowerCase();
        rawTag = ident.value;
        index = ident.nextPos;
        matchedAnything = true;
    }

    let id = null;
    const classes = [];
    const attributes = [];
    const pseudos = [];

    for (;;) {
        const char = str[index];

        if (char === '#') {
            const ident = scanIdentifier(str, index + 1);
            if (ident.nextPos === index + 1) {
                fail('Expected an id after "#".', index);
            }
            id = ident.value;
            index = ident.nextPos;
        } else if (char === '.') {
            const ident = scanIdentifier(str, index + 1);
            if (ident.nextPos === index + 1) {
                fail('Expected a class name after ".".', index);
            }
            classes.push(ident.value);
            index = ident.nextPos;
        } else if (char === '[') {
            const result = parseAttributeSelector(str, index);
            attributes.push(result.attribute);
            index = result.nextPos;
        } else if (char === ':') {
            const result = parsePseudo(str, index);
            pseudos.push(result.pseudo);
            index = result.nextPos;
        } else {
            break;
        }

        matchedAnything = true;
    }

    if (!matchedAnything) {
        return null;
    }

    return { compound: { tag, rawTag, id, classes, attributes, pseudos }, nextPos: index };
}

// Parses one complex selector — a chain of compounds joined by combinators —
// stopping at end of input or at any character in `stopChars` (a comma at
// the top level, or ")" inside a pseudo-class argument list). Returns the
// chain already anchored at the rightmost compound: see the module's
// SelectorAst typedef.
function parseComplexSelector(str, pos, stopChars) {
    let index = skipWhitespace(str, pos);
    const first = parseCompound(str, index);

    if (!first) {
        fail('Expected a selector.', index);
    }

    const nodes = [ { compound: first.compound, combinator: null } ];
    index = first.nextPos;

    for (;;) {
        const beforeWhitespace = index;
        const afterWhitespace = skipWhitespace(str, index);

        if (afterWhitespace >= str.length || stopChars.includes(str[afterWhitespace])) {
            index = afterWhitespace;
            break;
        }

        let combinator;
        let compoundStart;

        if (str[afterWhitespace] === '>' || str[afterWhitespace] === '+' || str[afterWhitespace] === '~') {
            combinator = str[afterWhitespace];
            compoundStart = skipWhitespace(str, afterWhitespace + 1);
        } else if (afterWhitespace > beforeWhitespace) {
            combinator = ' ';
            compoundStart = afterWhitespace;
        } else {
            fail('Unexpected character in selector.', afterWhitespace);
        }

        const next = parseCompound(str, compoundStart);
        if (!next) {
            fail('Expected a selector after combinator.', compoundStart);
        }

        nodes.push({ compound: next.compound, combinator });
        index = next.nextPos;
    }

    let chain = null;
    for (const node of nodes) {
        chain = { compound: node.compound, combinator: node.combinator, left: chain };
    }

    return { chain, nextPos: index };
}

function parseSelectorListInternal(str, pos, stopChar) {
    const stopChars = [ ',', stopChar ];
    const selectors = [];
    let index = pos;

    for (;;) {
        const result = parseComplexSelector(str, index, stopChars);
        selectors.push(result.chain);
        index = skipWhitespace(str, result.nextPos);

        if (str[index] === ',') {
            index = skipWhitespace(str, index + 1);
            continue;
        }
        break;
    }

    return { selectors, nextPos: index };
}

function freezeChain(node) {
    if (!node) {
        return;
    }

    const { compound } = node;
    Object.freeze(compound.classes);
    for (const attribute of compound.attributes) {
        Object.freeze(attribute);
    }
    Object.freeze(compound.attributes);
    for (const pseudo of compound.pseudos) {
        if (Array.isArray(pseudo.argument)) {
            pseudo.argument.forEach(freezeChain);
            Object.freeze(pseudo.argument);
        } else if (pseudo.argument) {
            Object.freeze(pseudo.argument);
        }
        Object.freeze(pseudo);
    }
    Object.freeze(compound.pseudos);
    Object.freeze(compound);

    freezeChain(node.left);
    Object.freeze(node);
}

/**
 * @typedef {Object} AttributeMatcher
 * @property {string} name - Lowercase attribute name.
 * @property {string|null} operator - One of `=`, `~=`, `|=`, `^=`, `$=`,
 *   `*=`, or `null` for a bare `[name]` presence check.
 * @property {string|null} value - The comparison value, or `null` for a
 *   presence check.
 * @property {boolean} caseInsensitive - Whether the trailing `i` flag was
 *   given.
 */

/**
 * @typedef {Object} PseudoMatcher
 * @property {string} name - Lowercase pseudo-class name.
 * @property {null|{a: number, b: number}|SelectorAst[]} argument - `null`
 *   for an argument-less pseudo-class, a compiled `{a, b}` for an `:nth-*()`
 *   one, or a selector list for `:not()`/`:is()`/`:where()`.
 */

/**
 * @typedef {Object} Compound
 * @property {string|null} tag - Lowercase type selector, or `null` for `*`
 *   or when no type selector was given. Matched case-insensitively against
 *   an HTML element's local name.
 * @property {string|null} rawTag - The type selector exactly as written, or
 *   `null` alongside `tag`. Matched case-sensitively against a foreign
 *   element's `rawName`, since foreign tag names (`clipPath`) are
 *   case-sensitive.
 * @property {string|null} id - `#id`, or `null`.
 * @property {string[]} classes - `.class` tokens.
 * @property {AttributeMatcher[]} attributes - `[attr...]` selectors.
 * @property {PseudoMatcher[]} pseudos - `:pseudo` selectors.
 */

/**
 * @typedef {Object} SelectorAst
 * @property {Compound} compound - The rightmost compound of this selector
 *   (or sub-selector, when nested inside a pseudo-class argument).
 * @property {string|null} combinator - One of `' '`, `'>'`, `'+'`, `'~'`
 *   connecting `compound` to `left`, or `null` when `compound` is the
 *   leftmost (first-written) compound in the chain.
 * @property {SelectorAst|null} left - The chain continuing to the left, or
 *   `null` when `compound` is the leftmost compound.
 */

/**
 * Parses a CSS selector string into a selector list — one `SelectorAst` per
 * comma-separated alternative — right-anchored so matching can test the
 * rightmost compound first. Selectors Level 3 structural subset: type,
 * universal, id, class, attribute (all six operators, with the `i` flag),
 * the four combinators, `:not()`/`:is()`/`:where()`, the child/type/index
 * structural pseudo-classes and their `:nth-*()` forms, `:empty`, and
 * `:root`. Not supported: `:has()`, state pseudo-classes (`:hover`,
 * `:checked`, ...), pseudo-elements, and namespace syntax — each throws
 * naming what was rejected, distinct from a generic syntax error.
 *
 * Results are cached by selector string (capped at 500 entries, cleared
 * wholesale past the cap) and returned frozen, so parsing the same string
 * twice returns the identical array.
 * @param {string} selectorText - The selector to parse.
 * @returns {SelectorAst[]} One entry per comma-separated selector.
 * @throws {SelectorSyntaxError} When `selectorText` is not a valid selector
 *   in the supported grammar.
 */
export function parseSelector(selectorText) {
    const cached = cache.get(selectorText);
    if (cached) {
        return cached;
    }

    let selectors;
    try {
        const result = parseSelectorListInternal(selectorText, 0, '');
        const end = skipWhitespace(selectorText, result.nextPos);
        if (end !== selectorText.length) {
            fail('Unexpected trailing content in selector.', end);
        }
        selectors = result.selectors;
    } catch (error) {
        if (error instanceof ParseFailure) {
            throw new SelectorSyntaxError(error.message, selectorText, error.position);
        }
        throw error;
    }

    selectors.forEach(freezeChain);
    const ast = Object.freeze(selectors);

    if (cache.size >= CACHE_CAPACITY) {
        cache.clear();
    }
    cache.set(selectorText, ast);

    return ast;
}
