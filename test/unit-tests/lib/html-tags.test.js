import { describe } from 'kixx-test';
import { assert, assertFalsy } from 'kixx-assert';
import {
    VOID_ELEMENTS,
    RAW_TEXT_ELEMENTS,
    RCDATA_ELEMENTS,
    FOREIGN_ROOT_ELEMENTS,
    HEAD_ELEMENTS,
    AUTO_CLOSED_BY,
} from '../../../lib/html-tags.js';

describe('html-tags', ({ it, describe: describeGroup }) => {
    it('lists void elements', () => {
        assert(VOID_ELEMENTS.has('br'));
        assert(VOID_ELEMENTS.has('img'));
        assertFalsy(VOID_ELEMENTS.has('div'));
    });

    it('lists raw text elements', () => {
        assert(RAW_TEXT_ELEMENTS.has('script'));
        assert(RAW_TEXT_ELEMENTS.has('style'));
        assertFalsy(RAW_TEXT_ELEMENTS.has('title'));
    });

    it('lists RCDATA elements', () => {
        assert(RCDATA_ELEMENTS.has('title'));
        assert(RCDATA_ELEMENTS.has('textarea'));
        assertFalsy(RCDATA_ELEMENTS.has('script'));
    });

    it('lists foreign root elements', () => {
        assert(FOREIGN_ROOT_ELEMENTS.has('svg'));
        assert(FOREIGN_ROOT_ELEMENTS.has('math'));
        assertFalsy(FOREIGN_ROOT_ELEMENTS.has('div'));
    });

    it('lists head elements', () => {
        assert(HEAD_ELEMENTS.has('title'));
        assert(HEAD_ELEMENTS.has('meta'));
        assertFalsy(HEAD_ELEMENTS.has('body'));
    });

    describeGroup('AUTO_CLOSED_BY', ({ it: itAutoClosed }) => {
        itAutoClosed('closes p for block-level start tags but not span', () => {
            const closers = AUTO_CLOSED_BY.get('p');

            assert(closers.has('div'));
            assert(closers.has('p'));
            assertFalsy(closers.has('span'));
        });

        itAutoClosed('closes li for a sibling li', () => {
            assert(AUTO_CLOSED_BY.get('li').has('li'));
        });

        itAutoClosed('closes td and th for tr, td, and th', () => {
            const tdClosers = AUTO_CLOSED_BY.get('td');
            const thClosers = AUTO_CLOSED_BY.get('th');

            assert(tdClosers.has('tr'));
            assert(tdClosers.has('th'));
            assert(thClosers.has('td'));
        });

        itAutoClosed('closes thead and tbody for tbody and tfoot', () => {
            assert(AUTO_CLOSED_BY.get('thead').has('tbody'));
            assert(AUTO_CLOSED_BY.get('tbody').has('tfoot'));
        });
    });
});
