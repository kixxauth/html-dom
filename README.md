HTML DOM
========

Parse an HTML string into a virtual [Document Object Model](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model).

Zero dependencies. Runs unmodified on Node.js and Deno.

Supported Environments
----------------------

| Env     | Version    |
|---------|------------|
| ECMA    | >= ES2022  |
| Node.js | >= 18.3.0  |
| Deno    | >= 1.42.0  |

Usage
-----

```javascript
import { parseHTML } from 'html-dom';

const document = parseHTML('<p class="lead">Hello <b>world</b>');

document.body.querySelector('p.lead').textContent; // 'Hello world'
document.body.querySelector('p.lead').innerHTML;   // 'Hello <b>world</b>'
document.parseErrors;                              // recorded recoveries
```

`parseHTML()` never throws for malformed markup — it recovers and records what it did in `document.parseErrors` — but does throw a `TypeError` when given a non-string argument.

### Supported API

**Entry point**

| Member | Description |
|---|---|
| `parseHTML(html)` | Parses an HTML string and returns a `Document` |

**`Document`**

| Member | Description |
|---|---|
| `documentElement` | The `<html>` element (always non-null) |
| `head` | The `<head>` element (always non-null) |
| `body` | The `<body>` element (always non-null) |
| `doctype` | `{name, publicId, systemId}`, or `null` |
| `parseErrors` | Recoveries recorded while parsing |

**`Element`**

| Member | Description |
|---|---|
| `tagName` | Uppercase local name for HTML elements; `rawName` for foreign elements |
| `localName` | Lowercase tag name |
| `rawName` | Tag name exactly as written in the source |
| `isForeign` | Whether the element is inside an `svg` or `math` subtree |
| `id` | The `id` attribute, or an empty string |
| `classList` | Read-only, iterable view of the `class` attribute's tokens, deduplicated |
| `attributes` | Frozen, iterable collection of `{name, value}` in source order |
| `getAttribute(name)` | Attribute value, or `null` |
| `hasAttribute(name)` | Whether the attribute is present |
| `getAttributeNames()` | Frozen Array of attribute names, in source order |
| `innerHTML` | Serialized child nodes |
| `outerHTML` | Serialized element, including itself |
| `querySelector(selector)` | First matching descendant, or `null` |
| `querySelectorAll(selector)` | Every matching descendant, in document order |
| `closest(selector)` | This element or its nearest matching ancestor, or `null` |
| `getElementsByTagName(name)` | Descendants with this local name, or all for `'*'` |
| `getElementsByClassName(names)` | Descendants carrying all the given class names |

**Members shared by nodes**

| Member | Available on |
|---|---|
| `nodeType` | `Text`, `Comment`, `Element`, `Document` |
| `nodeName` | `Text`, `Comment`, `Element`, `Document` |
| `parentNode` | `Text`, `Comment`, `Element`, `Document` |
| `parentElement` | `Text`, `Comment`, `Element`, `Document` |
| `textContent` | `Text`, `Comment`, `Element`, `Document` |
| `childNodes` | `Element`, `Document` |
| `children` | `Element`, `Document` |

**Exported classes**

| Export | Purpose |
|---|---|
| `Node`, `ParentNode`, `CharacterData`, `Text`, `Comment`, `Element`, `Document` | Available for `instanceof` checks |
| `SelectorSyntaxError` | Thrown for an invalid selector |

The tree is read-only: nothing returned by `parseHTML()` has a public setter, and no collection is a live `HTMLCollection`/`NodeList`. Node collections (`children`, `childNodes`, `querySelectorAll()` results, `getElementsBy*()` results, `getAttributeNames()`) are frozen Arrays. `classList` and `attributes` are frozen, iterable, array-like objects instead — indexed with `[0]` and a `length`, but not Arrays, so they carry their own helpers (`classList.contains()`, `classList.value`, `attributes.getNamedItem()`) and no Array methods. Spread them (`[ ...element.classList ]`) when you need one.

This is a **pragmatic subset** of WHATWG HTML tree construction and CSS Selectors, not a full implementation — see [`agents/plans/html-dom-v1.md`](./agents/plans/html-dom-v1.md) ("Conformance boundary") for exactly what is and is not implemented, and why.

Development
-----------

Run the linter over the project's JavaScript sources:

```
npm run lint
```

Run the unit test suite:

```
node run-tests.js
```

`run-tests.js` runs every `*.test.js` file under `test/unit-tests/`. Pass pathnames to run a subset, or `--skip <path>` (repeatable) to exclude one:

```
node run-tests.js test/unit-tests/lib
node run-tests.js --skip test/unit-tests/lib/config-loader.test.js
```

Run both, linter first:

```
npm test
```

Copyright and License
---------------------
Copyright: (c) 2026 by Kris Walker (www.kriswalker.me)

Unless otherwise indicated, all source code is licensed under the MIT license. See LICENSE for details.
