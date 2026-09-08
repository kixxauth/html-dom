/**
 * @module html-tags
 *
 * Lookup tables that classify HTML element names. Every table is keyed (or,
 * for the auto-close table, valued) by lowercase element name. Consumers must
 * not mutate the exported `Set` and `Map` instances; ES module bindings keep
 * the exported names themselves from being reassigned, but the collections
 * are ordinary mutable objects by convention only.
 */

/**
 * Elements that never have children and never have an end tag.
 * @type {Set<string>}
 */
export const VOID_ELEMENTS = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'source',
    'track',
    'wbr',
]);

/**
 * Elements whose content is raw text: no tags and no character references
 * are recognized inside.
 * @type {Set<string>}
 */
export const RAW_TEXT_ELEMENTS = new Set([
    'script',
    'style',
]);

/**
 * Elements whose content is RCDATA: character references are recognized,
 * tags are not.
 * @type {Set<string>}
 */
export const RCDATA_ELEMENTS = new Set([
    'title',
    'textarea',
]);

/**
 * Elements that root a foreign-content subtree.
 * @type {Set<string>}
 */
export const FOREIGN_ROOT_ELEMENTS = new Set([
    'svg',
    'math',
]);

/**
 * Elements that belong in the implied `<head>` while it is still open.
 * @type {Set<string>}
 */
export const HEAD_ELEMENTS = new Set([
    'base',
    'link',
    'meta',
    'noscript',
    'script',
    'style',
    'template',
    'title',
]);

/**
 * Maps an open element's name to the set of start tag names that close it.
 * Read an entry as: "if this element is open and one of these start tags
 * arrives, close it first." The tree builder applies this repeatedly so
 * nested cases unwind correctly.
 * @type {Map<string, Set<string>>}
 */
export const AUTO_CLOSED_BY = new Map([
    [ 'p', new Set([
        'address',
        'article',
        'aside',
        'blockquote',
        'details',
        'div',
        'dl',
        'fieldset',
        'figcaption',
        'figure',
        'footer',
        'form',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'header',
        'hgroup',
        'hr',
        'main',
        'menu',
        'nav',
        'ol',
        'p',
        'pre',
        'section',
        'table',
        'ul',
    ]) ],
    [ 'li', new Set([ 'li' ]) ],
    [ 'dt', new Set([ 'dt', 'dd' ]) ],
    [ 'dd', new Set([ 'dt', 'dd' ]) ],
    [ 'option', new Set([ 'option', 'optgroup' ]) ],
    [ 'optgroup', new Set([ 'optgroup' ]) ],
    [ 'tr', new Set([ 'tr' ]) ],
    [ 'td', new Set([ 'td', 'th', 'tr' ]) ],
    [ 'th', new Set([ 'td', 'th', 'tr' ]) ],
    [ 'thead', new Set([ 'tbody', 'tfoot' ]) ],
    [ 'tbody', new Set([ 'tbody', 'tfoot' ]) ],
    [ 'caption', new Set([ 'thead', 'tbody', 'tfoot', 'tr' ]) ],
    [ 'colgroup', new Set([ 'thead', 'tbody', 'tfoot', 'tr' ]) ],
    [ 'rt', new Set([ 'rt', 'rp' ]) ],
    [ 'rp', new Set([ 'rt', 'rp' ]) ],
]);
