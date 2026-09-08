import { describe } from 'kixx-test';
import { assert, assertEqual, assertFalsy } from 'kixx-assert';
import { Element } from '../../../lib/element.js';

function createElement(args) {
    const {
        localName,
        rawName = localName,
        attributes = [],
        isForeign = false,
    } = args;

    return new Element(localName, rawName, attributes, isForeign);
}

describe('element', ({ it, describe: describeGroup }) => {
    it('reports nodeType 1', () => {
        assertEqual(1, createElement({ localName: 'div' }).nodeType);
    });

    describeGroup('tagName', ({ it: itTagName }) => {
        itTagName('uppercases an HTML local name', () => {
            assertEqual('DIV', createElement({ localName: 'div' }).tagName);
        });

        itTagName('preserves rawName casing for a foreign element', () => {
            const svg = createElement({ localName: 'svg', rawName: 'svg', isForeign: true });
            assertEqual('svg', svg.tagName);

            const clipPath = createElement({ localName: 'clippath', rawName: 'clipPath', isForeign: true });
            assertEqual('clipPath', clipPath.tagName);
        });

        itTagName('matches nodeName', () => {
            const element = createElement({ localName: 'div' });
            assertEqual(element.tagName, element.nodeName);
        });
    });

    describeGroup('attribute access', ({ it: itAttr }) => {
        itAttr('returns null from getAttribute when absent', () => {
            assertEqual(null, createElement({ localName: 'div' }).getAttribute('data-x'));
        });

        itAttr('returns the value when present', () => {
            const element = createElement({
                localName: 'a',
                attributes: [ { name: 'href', rawName: 'href', value: '/x' } ],
            });
            assertEqual('/x', element.getAttribute('href'));
            assert(element.hasAttribute('href'));
            assertFalsy(element.hasAttribute('title'));
        });

        itAttr('returns "" from id when absent', () => {
            assertEqual('', createElement({ localName: 'div' }).id);
        });

        itAttr('returns the id attribute value', () => {
            const element = createElement({
                localName: 'div',
                attributes: [ { name: 'id', rawName: 'id', value: 'main' } ],
            });
            assertEqual('main', element.id);
        });

        itAttr('iterates attributes in source order via Symbol.iterator', () => {
            const element = createElement({
                localName: 'input',
                attributes: [
                    { name: 'type', rawName: 'type', value: 'text' },
                    { name: 'value', rawName: 'value', value: '' },
                ],
            });

            const names = [];
            for (const { name, value } of element.attributes) {
                names.push(`${ name }=${ value }`);
            }

            assertEqual('type=text,value=', names.join(','));
            assertEqual(2, element.attributes.length);
            assertEqual('type', element.attributes[0].name);
        });

        itAttr('getAttributeNames returns names in source order', () => {
            const element = createElement({
                localName: 'input',
                attributes: [
                    { name: 'type', rawName: 'type', value: 'text' },
                    { name: 'value', rawName: 'value', value: '' },
                ],
            });

            assertEqual('type,value', element.getAttributeNames().join(','));
        });
    });

    describeGroup('classList', ({ it: itClassList }) => {
        itClassList('dedupes tokens while preserving the raw value', () => {
            const element = createElement({
                localName: 'div',
                attributes: [ { name: 'class', rawName: 'class', value: 'a  b a' } ],
            });

            assertEqual(2, element.classList.length);
            assert(element.classList.contains('a'));
            assert(element.classList.contains('b'));
            assertFalsy(element.classList.contains('c'));
            assertEqual('a  b a', element.classList.value);
        });

        itClassList('is empty when the class attribute is absent', () => {
            assertEqual(0, createElement({ localName: 'div' }).classList.length);
        });
    });

    it('has no public setter for mutating structure', () => {
        const element = createElement({ localName: 'div' });
        assertFalsy(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'tagName').set);
    });
});
