HTML DOM
========

Parse an HTML string into a virtual [Document Object Model](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model).

Zero dependencies. Runs unmodified on Node.js and Deno.

Usage
-----

```javascript
import { parseHTML } from 'html-dom';

const document = parseHTML('<p class="lead">Hello <b>world</b>');

document.body.querySelector('p.lead').textContent; // 'Hello world'
document.body.querySelector('p.lead').innerHTML;   // 'Hello <b>world</b>'
document.parseErrors;                              // recorded recoveries
```

`parseHTML()` never throws for malformed markup — it recovers and records
what it did in `document.parseErrors` — but does throw a `TypeError` when
given a non-string argument.

### Supported API

- **`parseHTML(html)`** returns a `Document`.
- **`Document`**: `documentElement`, `head`, and `body` (always non-null),
  `doctype` (`{name, publicId, systemId}` or `null`), `parseErrors`.
- **`Element`**: `tagName`, `localName`, `rawName`, `isForeign`, `id`,
  `classList`, `attributes`, `getAttribute()`, `hasAttribute()`,
  `getAttributeNames()`, `innerHTML`, `outerHTML`, `querySelector()`,
  `querySelectorAll()`, `closest()`, `getElementsByTagName()`,
  `getElementsByClassName()`.
- Every node (`Text`, `Comment`, `Element`, `Document`) exposes `nodeType`,
  `nodeName`, `parentNode`, `parentElement`, `textContent`; container nodes
  (`Element`, `Document`) also expose `childNodes` and `children`.
- All exported classes (`Node`, `ParentNode`, `CharacterData`, `Text`,
  `Comment`, `Element`, `Document`) are available for `instanceof` checks,
  and `SelectorSyntaxError` is thrown for an invalid selector.

The tree is read-only: nothing returned by `parseHTML()` has a public
setter, and collections (`children`, `childNodes`, `querySelectorAll()`
results, ...) are frozen Arrays rather than live `HTMLCollection`/`NodeList`
objects.

This is a **pragmatic subset** of WHATWG HTML tree construction and CSS
Selectors, not a full implementation — see
[`agents/plans/html-dom-v1.md`](./agents/plans/html-dom-v1.md) ("Conformance
boundary") for exactly what is and is not implemented, and why.

Supported Environments
----------------------

| Env     | Version    |
|---------|------------|
| ECMA    | >= ES2022  |
| Node.js | >= 18.3.0  |
| Deno    | >= 1.42.0  |

Node's floor is set by `run-tests.js`, which uses `util.parseArgs()`. Deno's
is set by `deno.json`'s `name`/`exports`/`publish` keys.

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
