HTML DOM
========

Parse an HTML string into a virtual [Document Object Model](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model).

Supported Environments
----------------------

| Env     | Version    |
|---------|------------|
| ECMA    | >= ES2022  |
| Node.js | >= 16.13.2 |
| Deno    | >= 1.0.0   |

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
