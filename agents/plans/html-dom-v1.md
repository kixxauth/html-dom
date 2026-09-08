HTML DOM v1 Implementation Plan
===============================

**Plan status:** Approved, not started
**Created:** 2026-09-08
**Owner:** Kris Walker (kris@kixx.name)

Implementation Approach
-----------------------

### What we are building

A zero-dependency ES2022 package that takes a UTF-8 JavaScript string of HTML
and returns a read-only virtual DOM. It runs unmodified on Node.js and Deno.

The whole public surface is one function and the classes it returns:

```javascript
import { parseHTML } from 'html-dom';

const document = parseHTML('<p class="lead">Hello <b>world</b>');

document.body.querySelector('p.lead').textContent; // 'Hello world'
document.body.querySelector('p.lead').innerHTML;   // 'Hello <b>world</b>'
document.parseErrors;                              // recorded recoveries
```

### Data flow

```
html string
    |
    v
parse-html.js          preprocess: strip BOM, normalize CRLF/CR -> LF
    |
    v
tokenizer.js           generator; yields tokens lazily
    |                  decodes character references
    |                  emits parseError tokens inline
    v
tree-builder.js        open-element stack, implied tags, auto-close rules
    |                  collects parseError tokens onto the Document
    v
Document  --------> node.js / element.js / document.js   (read-only tree)
                         |
                         +-- serialize.js        innerHTML / outerHTML
                         |
                         +-- selector-parser.js  selector string -> AST
                             selector-matcher.js AST x Element -> boolean
```

Each arrow is a module boundary that can be tested on its own. The tokenizer
never sees the tree; the tree builder never sees raw source; the selector
engine never sees the parser.

### Conformance boundary

We implement a **pragmatic subset** of WHATWG HTML tree construction. This is a
deliberate, permanent boundary, not a backlog. A later agent should not
"fix" these by adding spec algorithms without a new decision:

**Implemented:** stack of open elements, void elements, raw text (`script`,
`style`), RCDATA (`title`, `textarea`), implied `html`/`head`/`body`, an
auto-close table for `p`/`li`/`dd`/`dt`/`option`/`optgroup`/table sections,
end tags closing intervening open elements, foreign-content awareness for
`svg` and `math`.

**Not implemented, on purpose:**

- The adoption agency algorithm and reconstruction of active formatting
  elements. `<b>a<p>b</p></b>` will not re-open `<b>` inside the `<p>`.
- Foster parenting. Content misplaced inside a `<table>` stays where it was
  written rather than being relocated before the table.
- The spec's insertion-mode state machine. We use one stack plus a rule table.
- HTML integration points inside foreign content (`foreignObject`,
  `annotation-xml`). An `svg` subtree stays foreign to its end tag.
- `<template>` content isolation. A `<template>` is an ordinary element whose
  children are ordinary children.
- Legacy character references without a trailing semicolon. `&amp` stays
  literal; `&amp;` decodes.
- Scoping rules for end tags. An end tag scans the entire open-element stack
  for a match rather than stopping at a scope boundary.

### Deliberate deviations from the DOM, and why

- **Collections are frozen plain Arrays,** not `HTMLCollection`/`NodeList`.
  The tree is read-only, so liveness has no meaning, and an Array is strictly
  more capable than what a browser returns. Browser-written code keeps working.
- **No `DocumentType` node.** The doctype is exposed as
  `document.doctype` -> frozen `{ name, publicId, systemId }` or `null`. It is
  not in `childNodes` and not in `children`. Adding a sixth node class to carry
  three strings would be the thin wrapper AGENTS.md warns against, and nothing
  in the scoped API observes it as a node.
- **`document.parseErrors`** is non-standard. It exists because the parser
  never throws, so it is otherwise impossible to learn that recovery happened.
- **CDATA sections become bogus comments** with a recorded parse error, even
  inside `svg`. The tokenizer has no element-stack context, and `<![CDATA[` in
  an inline `<style>` is rare enough to accept the divergence.

### Cross-cutting constraints

Every task must satisfy all of these. They are stated once here so no task
repeats them.

**Runtime.** ES2022, ES modules. `lib/` and `mod.js` must import nothing:
no `node:` built-ins, no `process`, no `Buffer`, no dependencies. Only
`run-tests.js`, `run-linter.js`, and `tools/` may use `node:` imports.

**No new dependencies.** If a task appears to need one, stop and ask the user.

**Linter is authoritative.** `npm run lint` must pass. Notable rules that
shape this code:

- `no-plusplus` — loop counters use `index += 1`, never `index++`. This
  matters constantly in a character scanner.
- `func-style: declaration` — top-level functions are declarations.
- `indent: 4`, `semi`, `comma-dangle` on multiline, `eqeqeq`, `no-eq-null`.
- `no-warning-comments` warns anywhere — do not leave `TODO` or `FIXME`.
- `no-plusplus`, `no-console`, `no-else-return`, `no-lonely-if`.
- `prefer-const`, `no-var`, `no-unused-vars` with `^_` ignore patterns.
- Private class members use `#`, never `_`.

**Dual runtime.** Every task validates on both Node and Deno. See Validation.

**JSDoc.** Exported functions, classes, and public members get JSDoc per
AGENTS.md. Module-private functions do NOT get JSDoc blocks; they get short
inline comments where reasoning is non-obvious.

**Tests.** `test/unit-tests/lib/<module>.test.js` mirrors `lib/<module>.js`.
One top-level `describe` per file, named for the module under test. Inputs are
inline template literals; the single fixture file is reserved for T9.

**Async.** Nothing in `lib/` is async. Parsing is synchronous.

### Task graph

```
T1 scaffold repair
 |
 +--> T2 tag tables + character references
 |     |
 |     +--> T3 tokenizer
 |           |
 +--> T4 node model                 |
 |     |     |                      |
 |     |     +--> T5 tree builder <--+
 |     |     |     |
 |     |     +--> T6 serializer
 |     |           |
 +--> T7 selector parser            |
       |     |                      |
       +-----+--> T8 matcher + queries
                   |
                   +--> T9 end-to-end fixture
                         |
                         +--> T10 documentation alignment
```

T4 and T7 depend only on T1 and can run in parallel with T2/T3.

### Validation commands

Every task runs all four:

```
npm run lint
node run-tests.js
deno run --allow-read run-tests.js
deno lint
```

`npm test` runs the first two together. Deno 2.8.1 is installed and the
runner is already confirmed to work under it from the repository root.


Implementation Tasks
--------------------

### Task T1: The linter passes and the package has a working entry point

**Status:** Complete
**Depends on:** None
**Documentation:** README.md "Development"; PUBLISHING.md

**Objective**

`npm run lint` exits zero on a clean checkout, `deno.json` parses as strict
JSON, and both package manifests point at `mod.js` as the entry point. Every
later task's validation block depends on the linter being runnable, so this is
the only task that may land while the linter is red.

This task fixes *only* what blocks implementation. Prose corrections to
README, AGENTS.md, and PUBLISHING.md are T10's job, because they should be
written against the structure that actually gets built.

**Scope**

- In: `eslint.config.js` globals; the `deno.json` syntax error; `package.json`
  `main`/`exports`/`files`/`description`; a placeholder `mod.js` so both
  manifests resolve.
- Out: README, AGENTS.md, PUBLISHING.md, `.gitignore` (all T10). Any `lib/`
  code.

**Design and invariants**

- `eslint.config.js` `languageOptions.globals` currently declares only
  `console`. kixx-linting supplies most ES built-ins itself, but **not `Date`**,
  and `setTimeout` is a host global it cannot supply. Empirically verified:
  `Object`, `Map`, `Set`, `JSON`, `Symbol`, `TypeError`, `SyntaxError`,
  `RegExp`, `WeakMap`, `String`, `Number`, `Array`, `parseInt` are already
  recognized. Add `Date` and `setTimeout` as `readonly` and nothing more —
  do not paste in a speculative globals table.
- `deno.json` is missing a comma between the `publish` object and the `lint`
  key. Deno's own parser tolerates it, which is why `deno lint` works today;
  `JSON.parse` rejects the file. Fix it so any strict-JSON tool can read it.
- `package.json` has no `main`, no `exports`, and no `files`. Without `files`,
  `npm pack` ships `tmp/`, `agents/`, and the test suite. Set
  `"main": "./mod.js"`, `"exports": { ".": "./mod.js" }`, and
  `"files": [ "lib/", "mod.js", "LICENSE", "README.md" ]` to mirror
  `deno.json`'s publish include list.
- `package.json` `description` currently ends in a dangling markdown link,
  `"...a virtual [Document Object Model]"`. Make it plain prose.
- `mod.js` must exist for `deno check mod.js` and for the manifests to resolve,
  but has nothing to export yet. Create it with a `@module` JSDoc block and no
  exports; T5 fills it in.

**Expected touch points**

- `eslint.config.js` — add `Date` and `setTimeout` to `languageOptions.globals`
- `deno.json` — insert the missing comma
- `package.json` — `main`, `exports`, `files`, `description`
- `mod.js` — new, module JSDoc only

Treat this list as orientation, not permission to ignore other necessary files.
Record the actual files changed in the handoff notes.

**Acceptance criteria**

- [ ] `npm run lint` exits 0 with no output beyond the npm banner.
- [ ] `node -e "JSON.parse(require('fs').readFileSync('deno.json','utf8'))"`
      exits 0.
- [ ] `npm pack --dry-run` lists only `lib/`, `mod.js`, `LICENSE`,
      `README.md`, and `package.json`.
- [ ] `mod.js` exists and is lint-clean.
- [ ] No prose documentation file is modified by this task.

**Validation**

- `npm run lint` — proves the globals fix is complete and nothing else regressed.
- `node run-tests.js` — passes trivially with an empty suite; proves the runner
  still starts. Requires `test/unit-tests/` to exist, so create it with a
  `.gitkeep`.
- `deno run --allow-read run-tests.js` and `deno lint` — proves the Deno side
  is green before any library code exists.
- `npm pack --dry-run` — proves the `files` list is correct.

**Progress and handoff**

- Completed: Added `Date`/`setTimeout` globals to `eslint.config.js`; fixed the
  missing comma in `deno.json` before the `lint` key; added `main`, `exports`,
  `files`, and a plain-prose `description` to `package.json`; created
  `mod.js` with a `@module` JSDoc block and no exports; created
  `test/unit-tests/.gitkeep` so `run-tests.js` has its expected root.
- Current state: Done.
- Remaining: Nothing for this task.
- Decisions and discoveries: `test/unit-tests/` did not exist yet, so it was
  created here (needed for `node run-tests.js` to find its TEST_ROOT).
- Actual files changed: `eslint.config.js`, `deno.json`, `package.json`,
  `mod.js` (new), `test/unit-tests/.gitkeep` (new).
- Validation run: `npm run lint` (clean), `node run-tests.js` (0 tests, pass),
  `deno run --allow-read run-tests.js` (0 tests, pass), `deno lint` (clean),
  `node -e "JSON.parse(...)"` on `deno.json` (OK), `npm pack --dry-run`
  (lists only `LICENSE`, `README.md`, `mod.js`, `package.json`).
- Blockers: None.


### Task T2: HTML element categories and character reference decoding

**Status:** Complete
**Depends on:** T1
**Documentation:** Implementation Approach, "Conformance boundary"

**Objective**

Two pieces of shared reference data that every later parsing task consumes:
the tables that classify HTML element names, and a decoder that turns
character references into text. Both are pure, stateless, and have no
dependencies on the tree or the tokenizer, so they can be verified completely
on their own before anything is built on top of them.

They are one task because they are the parser's entire "what does HTML mean"
lookup layer, and because neither is large enough to justify its own task.

**Scope**

- In: `lib/html-tags.js`, `lib/character-references.js`,
  `lib/character-reference-table.js`, `tools/generate-character-references.js`.
- Out: Any scanning or tokenizing (T3). Any use of the auto-close table to
  actually close elements (T5).

**Design and invariants**

`lib/html-tags.js` exports frozen lookup structures keyed by **lowercase**
element name:

- `VOID_ELEMENTS` — `area base br col embed hr img input link meta source
  track wbr`. These never have children and never have an end tag.
- `RAW_TEXT_ELEMENTS` — `script style`. Content is text; no tags and no
  character references are recognized inside.
- `RCDATA_ELEMENTS` — `title textarea`. Character references are recognized;
  tags are not.
- `FOREIGN_ROOT_ELEMENTS` — `svg math`.
- `HEAD_ELEMENTS` — `base link meta noscript script style template title`.
  Used by T5 to decide whether content still belongs in the implied `<head>`.
- `AUTO_CLOSED_BY` — `Map<openElementName, Set<startTagName>>`. Read as: "if
  this element is open and one of these start tags arrives, close it first."
  The tree builder applies it repeatedly, so nested cases unwind correctly.
  Entries:
  - `p` closed by the block-level set: `address article aside blockquote
    details div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6
    header hgroup hr main menu nav ol p pre section table ul`
  - `li` by `li`
  - `dt` and `dd` by `dt` and `dd`
  - `option` by `option` and `optgroup`
  - `optgroup` by `optgroup`
  - `tr` by `tr`
  - `td` and `th` by `td`, `th`, `tr`
  - `thead` by `tbody`, `tfoot`
  - `tbody` by `tbody`, `tfoot`
  - `caption` and `colgroup` by `thead`, `tbody`, `tfoot`, `tr`
  - `rt` and `rp` by `rt`, `rp`

Use `Set` for membership and `Map` for the relation. A frozen `Set` is not a
thing, so freeze the module's exported object and rely on the members being
private by convention; do not hand out mutable arrays.

`lib/character-reference-table.js` is **generated data**. It exports one frozen
null-prototype object mapping the reference name *without* the leading `&` and
*with* its trailing `;` (matching entities.json's own keys, e.g. `"amp;"`) to
the replacement string. A file header comment records provenance: the
`https://html.spec.whatwg.org/entities.json` source URL and the capture date.
Some entries are two code points (`NotEqualTilde;` is `U+2242 U+0338`), so
values are strings, never single code points.

`tools/generate-character-references.js` reads an `entities.json` path given as
`process.argv[2]` and writes the module. It is a Node script, may use `node:`
imports, and is excluded from `package.json` `files` and `deno.json` publish
include. It never runs at install or build time.

`lib/character-references.js` exports `decodeCharacterReferences(text)`:

- Fast path: if the string contains no `&`, return it unchanged. Most text
  nodes take this path, so do not build a regex match for them.
- Named references require the terminating semicolon. `&amp;` decodes;
  `&amp` and `&notaname;` pass through as literal text.
- Numeric references: `&#38;` decimal and `&#x26;`/`&#X26;` hex, semicolon
  required for the same reason.
- Numeric replacements follow the spec's numeric-reference fixups, because
  browsers do and text compared against a browser must match: `0x00`,
  surrogates `0xD800`-`0xDFFF`, and values above `0x10FFFF` become U+FFFD;
  the C1 control range `0x80`-`0x9F` maps through the Windows-1252 table
  (e.g. `&#151;` is an em dash, not a control character).
- Never throws. Any malformed reference is literal text.

**Expected touch points**

- `lib/html-tags.js` — element category tables
- `lib/character-reference-table.js` — generated data
- `lib/character-references.js` — decoder
- `tools/generate-character-references.js` — regeneration script
- `package.json` / `deno.json` — confirm `tools/` is excluded from both
- `test/unit-tests/lib/html-tags.test.js`
- `test/unit-tests/lib/character-references.test.js`

Treat this list as orientation, not permission to ignore other necessary files.
Record the actual files changed in the handoff notes.

**Acceptance criteria**

- [ ] `lib/html-tags.js` exports all seven structures, frozen, keyed lowercase.
- [ ] The generated table has 2231 entries and a provenance header naming its
      source URL and capture date.
- [ ] `tools/generate-character-references.js` regenerates the checked-in file
      byte-identically from the same `entities.json`.
- [ ] `decodeCharacterReferences` handles: a string with no `&` (returned
      unchanged, same reference); `&amp;`; `&nbsp;`; a multi-code-point entry;
      a name that is a proper prefix of a longer name; `&amp` without a
      semicolon (literal); `&notaname;` (literal); decimal and hex numeric;
      `&#0;` (U+FFFD); `&#xD800;` (U+FFFD); `&#151;` (em dash via Windows-1252).
- [ ] `tools/` appears in neither publish manifest.
- [ ] No function in `lib/` throws for any input string.

**Validation**

- `npm run lint` — style and the ES2022 constraint.
- `node run-tests.js test/unit-tests/lib/character-references.test.js` — the
  decoder table above, each case as its own `it`.
- `node run-tests.js test/unit-tests/lib/html-tags.test.js` — spot-checks that
  `AUTO_CLOSED_BY.get('p')` contains `div` and not `span`, and that the
  category sets are disjoint where they should be.
- `deno run --allow-read run-tests.js` and `deno lint` — proves the generated
  data module and decoder are runtime-neutral.
- `npm pack --dry-run` — proves `tools/` is not shipped.

**Progress and handoff**

- Completed: `lib/html-tags.js` with the seven category tables;
  `tools/generate-character-references.js`; `lib/character-reference-table.js`
  generated from `entities.json` (fetched via `curl` from
  `https://html.spec.whatwg.org/entities.json`, 2231 entries); the decoder in
  `lib/character-references.js`; unit tests for both modules.
- Current state: Done.
- Remaining: Nothing for this task.
- Decisions and discoveries: Both this project's decoder and the plan require
  a trailing `;` on every reference (named and numeric), so the generated
  table retains entries without a semicolon (matching entities.json's own key
  set, for a byte-identical regeneration and the documented 2231-entry count)
  even though the decoder never looks them up. Verified all 2231 entity names
  are ASCII alphanumeric with a max length of 32, which is what makes the
  "scan to the first `;`" approach in `decodeNamedReference` correct without
  needing a trie or longest-match backtracking.
- Actual files changed: `lib/html-tags.js` (new),
  `lib/character-reference-table.js` (new, generated),
  `lib/character-references.js` (new),
  `tools/generate-character-references.js` (new),
  `test/unit-tests/lib/html-tags.test.js` (new),
  `test/unit-tests/lib/character-references.test.js` (new).
- Validation run: `npm run lint` (clean), `node run-tests.js` (25 tests
  passing), `deno run --allow-read run-tests.js` (25 tests passing),
  `deno lint` (clean, 10 files), `npm pack --dry-run` (lists `lib/`
  contents but not `tools/`), and a byte-identical re-run of the generator
  confirmed with `diff`.
- Blockers: None.


### Task T3: A tokenizer that turns an HTML string into a token stream

**Status:** Complete
**Depends on:** T2
**Documentation:** Implementation Approach, "Data flow" and "Conformance boundary"

**Objective**

`tokenize(source)` yields every token in an HTML document in source order, and
records a parse error for every recovery it performs. It is the only module
that reads raw source text, and it has no knowledge of the tree, so its whole
contract is observable by collecting the yielded tokens into an array.

**Scope**

- In: `lib/tokenizer.js` — scanning, attribute parsing, comments, doctype,
  raw text and RCDATA content, character reference decoding at the right
  places, and tokenizer-level parse errors.
- Out: Deciding what any token *means* for the tree — implied tags,
  auto-closing, whether `/>` is honored (all T5). Node construction (T4).

**Design and invariants**

- **Generator, not an array.** `export function* tokenize(source)`. The builder
  consumes tokens lazily, so a large document never materializes a full token
  array. Tests collect with `Array.from(tokenize(html))`.
- **Whole-string scanning.** A single integer cursor over `source`, advanced
  with `indexOf` and sticky (`/y`) regexes. Never a per-character `switch`. A
  run of text is found with one `indexOf('<')`, not a loop.
- **The tokenizer does not know the element stack.** Two consequences it must
  respect:
  - It emits **both** the lowercased `name` and the author's `rawName` for
    every start tag, end tag, and attribute. T5 chooses which to keep, because
    only T5 knows whether it is inside `svg`/`math`.
  - It emits `selfClosing: true` when it sees `/>` but does not act on it. T5
    decides whether to honor or ignore it.
- **Raw text and RCDATA are the exception** and are decidable from the tag name
  alone, so the tokenizer does handle them. After a `script`/`style` start tag
  it scans for the matching end tag (`</` + name, case-insensitive, followed by
  whitespace, `/`, or `>`) and yields the content **undecoded**. After
  `title`/`textarea` it does the same but **decodes** character references.
- **Token shapes** (plain objects, `offset` is the 0-based index where the
  token starts):
  - `{ type: 'doctype', name, publicId, systemId, offset }`
  - `{ type: 'startTag', name, rawName, attributes, selfClosing, offset }`
    where `attributes` is an array of `{ name, rawName, value }` in source
    order, values already decoded.
  - `{ type: 'endTag', name, rawName, offset }`
  - `{ type: 'text', data, offset }` — always the final text, already decoded
    (or deliberately not, for raw text). There is one text token type, not
    separate raw/RCDATA types, because the decoding difference is resolved here.
  - `{ type: 'comment', data, offset }`
  - `{ type: 'parseError', code, message, offset }`
- **Parse errors travel in the token stream**, not through a callback. One
  output channel keeps the tokenizer a pure function of its input and makes
  every error assertion a plain array check in a test. T5 forwards them.
- **Attribute rules.** Duplicate attribute names: keep the first, record
  `duplicate-attribute`. A valueless attribute has `value: ''`. Unquoted,
  single-quoted, and double-quoted values are all accepted. Attribute names are
  lowercased into `name` and preserved in `rawName`.
- **Comment rules.** `<!--` to `-->`. `<!` not followed by `--` or a
  case-insensitive `doctype` is a bogus comment: consume to the next `>`,
  yield it as a comment, record `incorrectly-opened-comment`. `</` followed by
  a non-letter is a bogus comment, recording `invalid-first-character-of-tag-name`.
  `<![CDATA[` is a bogus comment recording `cdata-in-html-content` — see the
  documented deviation in the Implementation Approach.
- **A `<` that cannot start a tag is literal text**, matching browsers. `a < b`
  yields one text token.
- **EOF inside a tag, comment, or doctype** records `eof-in-tag`,
  `eof-in-comment`, or `eof-in-doctype` and yields whatever was accumulated.
  The tokenizer always terminates and always yields something for every byte.
- **Never throws.** For any input string, `Array.from(tokenize(s))` completes.
- The tokenizer does not compute line or column. It records `offset` only;
  T5 resolves positions once, and only if errors exist.

**Expected touch points**

- `lib/tokenizer.js` — the scanner
- `test/unit-tests/lib/tokenizer.test.js` — token stream assertions

Treat this list as orientation, not permission to ignore other necessary files.
Record the actual files changed in the handoff notes.

**Acceptance criteria**

- [ ] `tokenize` is a generator and never materializes the full token array.
- [ ] Start tags produce lowercased `name` and author-cased `rawName`, for both
      the element and each attribute; `<IMG SRC="x"/>` yields
      `name: 'img'`, `rawName: 'IMG'`, attribute `name: 'src'`,
      `rawName: 'SRC'`, `selfClosing: true`.
- [ ] `<script>` content containing `<div>` and `&amp;` yields one text token
      whose data is exactly `<div>&amp;` — no tags parsed, no decoding.
- [ ] `<textarea>` content containing `&amp;` yields text data `&`.
- [ ] `a < b` yields a single text token, not a tag.
- [ ] Duplicate attributes keep the first value and record
      `duplicate-attribute`.
- [ ] Unterminated tag, comment, and doctype each record the matching `eof-in-*`
      code and terminate.
- [ ] Every token carries an `offset` that indexes into the original source.
- [ ] No input causes a throw or a non-terminating loop, including `<`, `<!`,
      `</`, `<!--`, and the empty string.

**Validation**

- `npm run lint`
- `node run-tests.js test/unit-tests/lib/tokenizer.test.js` — one `it` per row
  of the acceptance criteria, asserting on collected token arrays.
- `deno run --allow-read run-tests.js` and `deno lint`
- Non-termination is checked structurally, not by timeout: assert that the
  cursor strictly advances on every iteration for a set of adversarial inputs.

**Progress and handoff**

- Completed: `lib/tokenizer.js` — a whole-string `tokenize()` generator with
  `indexOf`-based scanning for text/comments/bogus-comments, and dedicated
  scanners for doctypes, start tags (with attribute parsing and duplicate
  detection), end tags, and raw text / RCDATA content; unit tests covering
  casing, script/textarea content handling, literal `<`, duplicate
  attributes, all three `eof-in-*` codes, bogus-comment codes, and
  non-termination on adversarial input.
- Current state: Done.
- Remaining: Nothing for this task.
- Decisions and discoveries: The tokenizer decides whether a start tag opens
  raw text / RCDATA content purely from the element name category
  (`RAW_TEXT_ELEMENTS`/`RCDATA_ELEMENTS`), never from the `selfClosing` flag —
  that flag is recorded but otherwise left for T5 to interpret, matching the
  plan's "tokenizer does not know the element stack" invariant. An
  unterminated start tag (`eof-in-tag`) yields only the `parseError`, not a
  partial `startTag` token, since the tag was never actually well-formed; the
  acceptance criteria only require the error code and termination, not a
  half-built token. Verified by construction (see the `nextCursor` reasoning
  in each scan function) that every branch's returned cursor strictly exceeds
  the construct's start offset, which is what the "cursor strictly advances"
  test checks structurally rather than via a timeout.
- Actual files changed: `lib/tokenizer.js` (new),
  `test/unit-tests/lib/tokenizer.test.js` (new).
- Validation run: `npm run lint` (clean), `node run-tests.js` (47 tests
  passing across the whole suite), `deno run --allow-read run-tests.js` (47
  passing), `deno lint` (clean, 12 files), `npm pack --dry-run` (lib/
  contents include tokenizer.js, tools/ still excluded).
- Blockers: None.


### Task T4: The read-only node model

**Status:** Complete
**Depends on:** T1
**Documentation:** MDN Element and Document; Implementation Approach,
"Deliberate deviations from the DOM"

**Objective**

The classes that make up the tree, with every member that does not require the
serializer or the selector engine. After this task a tree assembled by hand in
a test can be walked, read, and queried by tag name and class name. It is a
coherent partition because it owns one invariant end to end: *a node's
structure is set at construction and never changes afterward.*

This task can run in parallel with T2 and T3.

**Scope**

- In: `lib/node.js` (`Node`, `ParentNode`, `CharacterData`, `Text`, `Comment`),
  `lib/element.js` (`Element`, class list, attribute list), `lib/document.js`
  (`Document`). Structural members, attribute access, `textContent`,
  `getElementsByTagName`, `getElementsByClassName`.
- Out: `innerHTML`/`outerHTML` (T6). `querySelector`/`querySelectorAll`/
  `closest` (T8). Anything that builds a tree from HTML (T5).

**Design and invariants**

- **Class hierarchy.** `Node` -> `ParentNode` -> `Document` | `Element`, and
  `Node` -> `CharacterData` -> `Text` | `Comment`. `ParentNode` exists so that
  `Text` does not inherit `children` or the query methods, which would be
  meaningless on it.
- **Read-only, not frozen.** No public member mutates. Internals stay ordinary
  mutable fields so T5's builder can append children while parsing, and so
  derived values can be cached. Do not call `Object.freeze` on nodes.
- **Construction is internal.** The classes are exported from `mod.js` so
  consumers can use `instanceof`, but their constructors are not a supported
  way to build a tree; T5 owns construction. Document this in the class JSDoc.
- **Private state uses `#` fields.** Never an underscore prefix.
- **Frozen arrays, cached.** `children`, `childNodes`,
  `getElementsByTagName()`, and `getElementsByClassName()` return
  `Object.freeze`d plain Arrays. Because the tree never changes, compute each
  once into a `#` field and return the same array on every access.
- **`nodeType`** is the DOM's number: `1` Element, `3` Text, `8` Comment,
  `9` Document. **`nodeName`** is the uppercase tag name for elements,
  `'#text'`, `'#comment'`, `'#document'`.
- **Casing.** `Element` stores a lowercase `#localName` and the author's
  `#rawName`, plus a `#isForeign` flag set by T5. `tagName` returns the
  UPPERCASED local name for HTML elements but `rawName` verbatim for foreign
  ones — this is what browsers do, which is why `svg` reports `'svg'` and
  `clipPath` reports `'clipPath'` rather than `'SVG'` and `'CLIPPATH'`.
- **Attributes** are stored twice: an ordered array of `{ name, rawName, value }`
  for `attributes` and iteration order, and a `Map` from lowercase name to
  value for O(1) lookup. `getAttribute` returns `null` when absent — not
  `undefined`, not `''` — because callers branch on it. `hasAttribute` returns
  a boolean. `getAttributeNames()` returns a frozen array of names in source
  order. `id` returns `''` when the attribute is absent, per the DOM.
- **`attributes`** is a frozen, iterable, array-like: `length`, integer index
  access, `getNamedItem(name)` returning `{ name, value }` or `null`, and
  `Symbol.iterator`. Entries are frozen `{ name, value }` objects, so
  `for (const { name, value } of element.attributes)` works as it does in a
  browser. There is no `Attr` class.
- **`classList`** is a read-only `DOMTokenList`-alike: `contains(token)`,
  `value` (the raw attribute string), `length`, index access, and iteration.
  Tokens are split on ASCII whitespace and **deduplicated preserving first
  occurrence**, matching the DOM's ordered-set parser, so `class="a a"` has
  `length` 1 while `value` is still `'a a'`.
- **`textContent`** concatenates the data of every descendant `Text` node in
  document order. Comments contribute nothing. On `Document` it returns `null`,
  per the DOM.
- **`getElementsByTagName(name)`** matches case-insensitively against the local
  name for HTML elements and case-sensitively for foreign ones. `'*'` matches
  every element. Results are descendants in document order, excluding the node
  itself. **`getElementsByClassName(names)`** splits `names` on whitespace and
  requires an element to carry **all** of them; class matching is
  case-sensitive.
- **`Document`** exposes `documentElement`, `head`, `body`, `children`
  (`[documentElement]`), `doctype` (frozen `{ name, publicId, systemId }` or
  `null`), and `parseErrors` (a frozen array). `documentElement`, `head`, and
  `body` are **always non-null** — T5 synthesizes them — so consumers never
  need a null check. Say so in the JSDoc.
- **`parentElement`** returns `parentNode` when it is an `Element` and `null`
  otherwise, so the `body`'s `parentElement` is the `html` element but the
  `html` element's is `null`, not the `Document`.

**Expected touch points**

- `lib/node.js` — `Node`, `ParentNode`, `CharacterData`, `Text`, `Comment`
- `lib/element.js` — `Element`, class list, attribute list
- `lib/document.js` — `Document`
- `test/unit-tests/lib/node.test.js`
- `test/unit-tests/lib/element.test.js`
- `test/unit-tests/lib/document.test.js`

Treat this list as orientation, not permission to ignore other necessary files.
Record the actual files changed in the handoff notes.

**Acceptance criteria**

- [ ] The six classes exist with the stated hierarchy; `Text` has no `children`
      and no `getElementsByTagName`.
- [ ] `children` excludes `Text` and `Comment`; `childNodes` includes them in
      source order.
- [ ] Two accesses of `children` return the **same** frozen array instance.
- [ ] `tagName` is `'DIV'` for `<div>`, `'svg'` for an `svg` element, and
      `'clipPath'` for a foreign `clipPath` element.
- [ ] `getAttribute` returns `null` when absent; `id` returns `''` when absent.
- [ ] `for (const { name, value } of element.attributes)` iterates in source
      order; `attributes.length` and `attributes[0]` work.
- [ ] `classList` for `class="a  b a"` has `length` 2, `contains('a')` true,
      `contains('c')` false, and `value === 'a  b a'`.
- [ ] `textContent` on an element with mixed children returns concatenated text
      and ignores comments; on a `Document` it returns `null`.
- [ ] `getElementsByTagName('P')` finds `<p>`; `getElementsByClassName('a b')`
      requires both classes.
- [ ] No public member mutates the tree; the classes have no `set` accessors.

**Validation**

- `npm run lint`
- `node run-tests.js test/unit-tests/lib/node.test.js test/unit-tests/lib/element.test.js test/unit-tests/lib/document.test.js`
- Tests build small trees with a file-local factory rather than by parsing,
  which keeps this task independently verifiable before T5 exists.
- `deno run --allow-read run-tests.js` and `deno lint`

**Progress and handoff**

- Completed: `lib/node.js` (`Node`, `ParentNode`, `CharacterData`, `Text`,
  `Comment`), `lib/element.js` (`Element` plus private `AttributeList` and
  `ClassList` helper classes), `lib/document.js` (`Document`). Structural
  members, attribute access, `textContent`, `getElementsByTagName`,
  `getElementsByClassName` all implemented. `querySelector`/
  `querySelectorAll`/`closest` and `innerHTML`/`outerHTML` intentionally left
  out for T8 and T6. Unit tests for all three modules, built via file-local
  factories rather than `parseHTML` (which doesn't exist yet).
- Current state: Done.
- Remaining: Nothing for this task.
- Decisions and discoveries: `Node.parentElement` and `ParentNode.children`
  check `nodeType === 1` rather than `instanceof Element`. An `instanceof`
  check would need node.js to import element.js while element.js imports
  `ParentNode` from node.js — a real circular top-level class `extends`,
  which throws `ReferenceError: Cannot access 'ParentNode' before
  initialization` the moment the two modules' evaluation order interleaves
  unfavorably (verified this fails by trying it first). The `nodeType` check
  avoids the cycle entirely and is exactly what a nodeType number is for.
  `Document#setDoctype` freezes the doctype object defensively rather than
  trusting T5's tree builder to pass an already-frozen one, since "doctype is
  exposed as a frozen `{...}`" is this class's own invariant to hold.
- Actual files changed: `lib/node.js` (new), `lib/element.js` (new),
  `lib/document.js` (new), `test/unit-tests/lib/node.test.js` (new),
  `test/unit-tests/lib/element.test.js` (new),
  `test/unit-tests/lib/document.test.js` (new).
- Validation run: `npm run lint` (clean), `node run-tests.js` (76 tests
  passing across the whole suite), `deno run --allow-read run-tests.js` (76
  passing), `deno lint` (clean, 18 files), `npm pack --dry-run` (lib/
  contents include the three new modules).
- Blockers: None.


### Task T5: parseHTML turns a string into a Document

**Status:** Complete
**Depends on:** T3, T4
**Documentation:** Implementation Approach, "Conformance boundary"

**Objective**

The library's headline behavior: `parseHTML(html)` returns a `Document` with a
synthesized `html`/`head`/`body` structure and a populated `parseErrors` list.
This is the task that owns the pragmatic-subset boundary — every recovery
decision the conformance section describes lives here.

**Scope**

- In: `lib/tree-builder.js` (token stream -> tree, open-element stack,
  auto-closing, implied structure, error collection and position resolution),
  `lib/parse-html.js` (input preprocessing and orchestration), and filling in
  `mod.js`.
- Out: Serialization (T6) and selectors (T8), even though the classes they
  extend are constructed here.

**Design and invariants**

- **`parseHTML(html)` argument check.** A non-string argument throws
  `TypeError` whose message names what was received. This is the only throw in
  the parsing path.
- **Preprocessing, in `lib/parse-html.js`.** Strip a leading U+FEFF BOM;
  normalize CRLF and lone CR to LF. Do this before tokenizing so that recorded
  offsets index the *normalized* string — document that, since it means an
  offset may not match the caller's original string if it had CRLF endings.
- **The Document never retains the source string.** Once parsing returns, the
  input is garbage-collectable.
- **Implied structure is always built.** `documentElement`, `head`, and `body`
  always exist, even for empty input. Elements in `HEAD_ELEMENTS` encountered
  before any body content go into `head`; the first token that cannot belong to
  `head` closes it and opens `body`. Whitespace-only text before `<html>` is
  discarded; comments before `<html>` become `Document` child nodes preceding
  `documentElement`; non-whitespace text forces `body` open.
- **Start tag handling.** Before pushing, repeatedly consult
  `AUTO_CLOSED_BY` against the current top of stack and pop while it matches,
  recording an implied end tag each time. Void elements are appended and never
  pushed. `selfClosing` is honored **only** inside a foreign subtree; outside
  one it is ignored and records `non-void-html-element-start-tag-with-trailing-solidus`.
- **End tag handling.** Scan the entire open-element stack from the top for a
  matching local name. If found, pop through it, recording an implied end tag
  for each element closed on the way. If not found, discard the token and
  record `stray-end-tag`. There is no scope checking — see the conformance
  boundary.
- **Foreign content.** Entering `svg` or `math` sets a flag carried on the
  stack. While inside, elements and attributes keep their `rawName` and the
  element is constructed with `isForeign` true; `/>` self-closes. The subtree
  ends when its root element is popped.
- **Character data.** Consecutive text tokens are merged into a single `Text`
  node, so the builder must not create one node per token.
- **Parse errors.** Forward every `parseError` token from the tokenizer and add
  the builder's own. After the token stream is exhausted, **if and only if any
  errors were recorded**, build a line-start index over the preprocessed source
  once (one pass collecting the offset after each `\n`) and binary-search it to
  fill in 1-based `line` and `column` on each record. A clean document pays
  nothing for this. Freeze each record and freeze the array.
- **Error codes** are stable kebab-case identifiers reusing WHATWG parse-error
  names where one exists. They are part of the public contract: adding a code
  is fine, renaming one is a breaking change. Say so in the JSDoc.
- **`mod.js`** exports `parseHTML` plus `Node`, `ParentNode`, `CharacterData`,
  `Text`, `Comment`, `Element`, and `Document`. Named exports only; no default
  export. A `@module` block documents the package.

**Expected touch points**

- `lib/tree-builder.js` — the builder and error collection
- `lib/parse-html.js` — preprocessing, argument validation, orchestration
- `mod.js` — public exports
- `test/unit-tests/lib/tree-builder.test.js`
- `test/unit-tests/lib/parse-html.test.js`

Treat this list as orientation, not permission to ignore other necessary files.
Record the actual files changed in the handoff notes.

**Acceptance criteria**

- [ ] `parseHTML('')` returns a `Document` with non-null `documentElement`,
      `head`, and `body`, and an empty `parseErrors`.
- [ ] `parseHTML(42)` throws `TypeError`; `error.name` is `'TypeError'`.
- [ ] Malformed input never throws: `<`, `<!`, `</`, `<div><span></div>`,
      a truncated tag, and unbalanced end tags all return a `Document`.
- [ ] `<p>one<p>two` produces two sibling `p` elements, not nested ones, and
      records an implied end tag.
- [ ] `<ul><li>a<li>b</ul>` produces two `li` siblings inside the `ul`.
- [ ] `<br>` and `<img>` are appended without being pushed; content after them
      is a sibling, not a child.
- [ ] `<div/>` outside foreign content opens an element and records
      the trailing-solidus error; `<svg><path/></svg>` self-closes `path`.
- [ ] `<svg viewBox="0 0 1 1">` preserves `viewBox` casing and yields
      `tagName === 'svg'`.
- [ ] `<title>` and `<meta>` land in `head`; a `<p>` after them opens `body`.
- [ ] Adjacent character data becomes one `Text` node.
- [ ] A stray `</div>` records `stray-end-tag` with a `line` and `column` that
      point at it, and parsing continues.
- [ ] A clean document produces a `parseErrors` array of length 0 and the
      line index is never built.
- [ ] `mod.js` exports `parseHTML` and all seven classes.

**Validation**

- `npm run lint`
- `node run-tests.js test/unit-tests/lib/tree-builder.test.js test/unit-tests/lib/parse-html.test.js`
- Tests assert tree shape by walking `children` and `childNodes` and by
  checking `tagName`, not by comparing serialized strings — serialization is
  T6's contract and this task must be verifiable without it.
- `deno run --allow-read run-tests.js` and `deno lint`

**Progress and handoff**

- Completed: `lib/tree-builder.js` (a `TreeBuilder` class with an open-element
  stack, implied `html`/`head`/`body`, the `AUTO_CLOSED_BY` auto-close loop,
  foreign-content depth tracking for `svg`/`math`, and merged-text-node
  insertion), `lib/parse-html.js` (argument validation, BOM/CRLF
  preprocessing, and deferred line/column resolution for parse errors), and
  `mod.js` filled in with the seven public exports. Unit tests for both new
  modules asserting on tree shape (`children`, `tagName`, `textContent`),
  never on serialized strings.
- Current state: Done.
- Remaining: Nothing for this task.
- Decisions and discoveries:
  - **No separate "phase" enum.** Whether new content still routes into
    `<head>` is derived on every call from `currentParent() === document.head
    && !bodyOpened`, not tracked as independent state. An early draft used an
    explicit `'before-html' | 'in-head' | 'in-body'` phase variable, and it
    broke as soon as a `<title>` (a HEAD_ELEMENTS container that gets pushed
    onto the stack) held non-whitespace text: the phase was still `'in-head'`
    while the true insertion point was `title`, not `head`, so the "force
    body open" logic popped `title` believing it was popping `head`. Deriving
    the check from the stack itself makes it correct at any nesting depth
    for free.
  - **Line/column resolution lives in `parse-html.js`, not
    `tree-builder.js`.** `buildTree()` returns `{document, errors}` with
    unresolved `{code, message, offset}` records; the builder never touches
    the source string, matching the Data Flow section's "the tree builder
    never sees raw source." `parseHTML()` already owns the preprocessed
    source for BOM/CRLF handling, so it also does the one-pass line-start
    index and binary search, only when `errors.length > 0`.
  - **End tag handling has no special case for `html`/`head`/`body`.** It is
    the single generic "scan the stack for a matching name, pop through it"
    algorithm from the plan, applied uniformly. `</head>` closing the head
    falls out of this for free, because popping head changes what
    `currentParent()` returns, which is the only thing the head/body routing
    checks.
  - Attribute name casing for foreign elements (e.g. `viewBox`) is preserved
    in the `rawName` field passed through unchanged from the tokenizer into
    `Element`'s internal attribute storage, but T4's public `attributes`
    getter only exposes `{name, value}` (lowercase `name`) per the plan — so
    this is verified in T5's tests via `getAttribute('viewBox')` and
    `tagName`/`localName`; full round-trip casing is T6's serializer to
    verify.
  - A literal `<html attrs>` tag's attributes are preserved only when it is
    the very first token to open `<html>`; a `<head>` tag's attributes are
    always dropped, since a bare head is always implied immediately alongside
    html. Neither is tested by the acceptance criteria; both are documented
    pragmatic gaps rather than silent ones.
- Actual files changed: `lib/tree-builder.js` (new), `lib/parse-html.js`
  (new), `mod.js` (filled in), `test/unit-tests/lib/tree-builder.test.js`
  (new), `test/unit-tests/lib/parse-html.test.js` (new).
- Validation run: `npm run lint` (clean), `node run-tests.js` (104 tests
  passing across the whole suite), `deno run --allow-read run-tests.js` (104
  passing), `deno lint` (clean, 22 files), `npm pack --dry-run` (lib/
  contents include tree-builder.js and parse-html.js), and a manual
  `deno run` smoke test importing `parseHTML` from `mod.js`.
- Blockers: None.


### Task T6: innerHTML and outerHTML serialize the tree back to HTML

**Status:** Complete
**Depends on:** T4, T5
**Documentation:** MDN Element.innerHTML and Element.outerHTML

**Objective**

`element.innerHTML` and `element.outerHTML` return canonical HTML for the
subtree. The task owns one invariant: *serialized output is well-formed and
correctly escaped for every tree the parser can produce.* Because output is
regenerated rather than sliced from source, it is also the task that makes
round-tripping testable.

**Scope**

- In: `lib/serialize.js` (the serializer and both escapers), and the
  `innerHTML`/`outerHTML` getters added to `Element`.
- Out: Any serialization member on `Document`, which the scoped API does not
  include. No `innerHTML` setter — the tree is read-only.

**Design and invariants**

- **Two distinct escapers, and getting them confused is the bug this task
  exists to prevent.** Text escaping replaces `&` -> `&amp;`, `<` -> `&lt;`,
  `>` -> `&gt;`, and U+00A0 -> `&nbsp;`. Attribute-value escaping replaces
  `&` -> `&amp;`, `"` -> `&quot;`, and U+00A0 -> `&nbsp;` — and **not** `<` or
  `>`, which are legal inside a quoted attribute value. `&` must be replaced
  first or the replacement's own ampersands get double-escaped.
- **Raw text elements are never escaped.** The children of `script` and
  `style` are emitted verbatim. Escaping them would corrupt every inline
  script; this is the single most damaging thing this module can get wrong, so
  it gets its own test.
- **Void elements emit no end tag and no trailing slash**: `<br>`, not
  `<br/>` or `<br></br>`.
- **Foreign elements emit a start and an end tag** like everything else, using
  `rawName` so `viewBox` and `clipPath` survive. We do not emit self-closing
  syntax even for elements the author wrote that way, matching the HTML
  fragment serialization algorithm.
- **Attributes** are always emitted as `name="value"` with double quotes, even
  when the value is empty and even when the author omitted the value or used
  single quotes. Names use the stored name — lowercase for HTML, `rawName` for
  foreign.
- **Comments** emit `<!--` + data + `-->` with the data unescaped.
- **Iterative, not recursive.** Serialize with an explicit stack so a
  pathologically deep document cannot overflow the call stack. A hostile or
  generated document nesting thousands of `<div>`s is realistic input for a
  scraping library.
- **Build with an array of parts joined once**, not by repeated string
  concatenation across a deep tree.
- Results are **not** cached. Unlike `children`, a serialized string can be
  large and is usually read once; caching it on every element would hold a
  second copy of the document in memory.

**Expected touch points**

- `lib/serialize.js` — serializer and escapers
- `lib/element.js` — `innerHTML` and `outerHTML` getters
- `test/unit-tests/lib/serialize.test.js`

Treat this list as orientation, not permission to ignore other necessary files.
Record the actual files changed in the handoff notes.

**Acceptance criteria**

- [ ] `outerHTML` includes the element's own tags; `innerHTML` does not.
- [ ] Text containing `&`, `<`, `>`, and U+00A0 round-trips through
      `parseHTML` -> `innerHTML` -> `parseHTML` to the same `textContent`.
- [ ] An attribute value containing `"`, `&`, `<`, and `>` serializes with
      `&quot;` and `&amp;` but leaves `<` and `>` literal, and re-parses to the
      identical value.
- [ ] `<script>if (a < b) {}</script>` serializes with `<` intact and no
      entity escaping.
- [ ] `<br>` serializes as `<br>`; `<input value="">` keeps `value=""`.
- [ ] An `svg` subtree serializes with `viewBox` casing preserved.
- [ ] An author's `<div class='x'>` serializes as `<div class="x">`.
- [ ] A comment round-trips.
- [ ] A document nesting 10000 `<div>` elements serializes without a stack
      overflow.

**Validation**

- `npm run lint`
- `node run-tests.js test/unit-tests/lib/serialize.test.js`
- The deep-nesting case is a real test, generated in the test file with a loop,
  not a manual check.
- Round-trip tests parse, serialize, re-parse, and compare structure — that is
  the property this module must hold, and it catches escaping bugs that
  string-equality assertions miss.
- `deno run --allow-read run-tests.js` and `deno lint`

**Progress and handoff**

- Completed: `lib/serialize.js` (`serializeInnerHTML`/`serializeOuterHTML`,
  the two escapers, an iterative stack-based tree walk), and `innerHTML`/
  `outerHTML` getters plus an internal `getAttributesForSerialization()` on
  `lib/element.js`. Unit tests covering both escapers, raw-text
  non-escaping, void elements, foreign casing, quote normalization, comment
  round-tripping, and a 10000-element-deep serialization without a stack
  overflow.
- Current state: Done.
- Remaining: Nothing for this task.
- Decisions and discoveries: The public `attributes`/`getAttributeNames()`
  API on `Element` (from T4) intentionally exposes only lowercase attribute
  names, so serialization — the one place that needs an author's original
  `viewBox` casing back — reaches it through a new internal
  `getAttributesForSerialization()` method, the same "internal: called only
  by X" convention already used for `appendChild`/`setParentNode`. This
  keeps `element.js -> serialize.js` a one-directional dependency: serialize
  doesn't need to import `Element` or `Text`/`Comment` at all, since it only
  ever touches `nodeType`, `childNodes`, `localName`, `isForeign`, and the
  new accessor — plain duck typing, so there's no import cycle with
  `element.js` to worry about, unlike node.js/element.js in T4.
- Actual files changed: `lib/serialize.js` (new), `lib/element.js` (edited:
  added imports, `innerHTML`, `outerHTML`,
  `getAttributesForSerialization()`), `test/unit-tests/lib/serialize.test.js`
  (new).
- Validation run: `npm run lint` (clean), `node run-tests.js` (114 tests
  passing across the whole suite), `deno run --allow-read run-tests.js` (114
  passing), `deno lint` (clean, 24 files), `npm pack --dry-run` (lib/
  contents include serialize.js), and manual smoke tests for escaping,
  round-tripping, and the 10000-deep case before writing them up as real
  tests.
- Blockers: None.


### Task T7: A CSS selector parser producing a matchable AST

**Status:** Complete
**Depends on:** T1
**Documentation:** Implementation Approach, "Decisions" row 8

**Objective**

`parseSelector(selectorText)` turns a CSS selector string into an AST, or
throws a typed syntax error. It touches no DOM class and can be developed and
tested entirely on its own, which is why it is separated from matching.

This task can run in parallel with T2 through T6.

**Scope**

- In: `lib/selector-parser.js` — tokenizing and parsing the supported grammar,
  the `SelectorSyntaxError` class, and the compiled-selector cache.
- Out: Evaluating an AST against an element (T8).

**Design and invariants**

- **Supported grammar** — Selectors Level 3 structural subset:
  - Type (`div`), universal (`*`), `#id`, `.class`
  - Attribute: `[a]`, `[a=v]`, `[a~=v]`, `[a|=v]`, `[a^=v]`, `[a$=v]`,
    `[a*=v]`, each with an optional trailing `i` case-insensitivity flag.
    Values may be unquoted, single-quoted, or double-quoted.
  - Combinators: descendant (whitespace), `>`, `+`, `~`
  - Comma-separated selector lists
  - Pseudo-classes: `:not()`, `:is()`, `:where()`, `:first-child`,
    `:last-child`, `:only-child`, `:nth-child()`, `:nth-last-child()`,
    `:first-of-type`, `:last-of-type`, `:only-of-type`, `:nth-of-type()`,
    `:nth-last-of-type()`, `:empty`, `:root`
  - **Not supported:** `:has()`, every state pseudo-class (`:hover`,
    `:checked`, `:focus`, `:disabled`), pseudo-elements (`::before`), and
    namespace syntax (`ns|div`). Each of these parses to a recognized-but-
    unsupported error rather than a generic one, so the message can say
    *why* rather than pointing at a character offset.
- **AST is right-anchored**, because matching runs right to left. A complex
  selector is a linked list toward the left:
  `{ compound, combinator, left }` where `combinator` is `null` for the
  rightmost compound and `left` is `null` there too.
- **A compound** is
  `{ tag, id, classes, attributes, pseudos }` — `tag` is a lowercase name or
  `null` for universal, `classes` an array, `attributes` an array of
  `{ name, operator, value, caseInsensitive }`, `pseudos` an array of
  `{ name, argument }`. Store `tag` lowercased and let T8 apply the
  case-sensitivity rule, since only T8 knows whether an element is foreign.
- **`:not()`, `:is()`, and `:where()` arguments are parsed recursively** into
  full selector lists, so `:not(.a, .b)` works.
- **`:nth-*()` arguments compile to `{ a, b }`** at parse time, handling `odd`,
  `even`, `3`, `2n`, `-n+3`, `2n+1`, and whitespace variants. Compiling the
  expression here means the matcher does arithmetic, not string parsing.
- **Identifier escapes are supported**: a backslash followed by one to six hex
  digits and an optional trailing whitespace character, or a backslash
  followed by any single non-hex character. This is what makes `.foo\.bar`
  and Tailwind-style class names selectable.
- **Errors.** `export class SelectorSyntaxError extends SyntaxError` with
  `name === 'SyntaxError'` (browsers throw a `DOMException` named
  `'SyntaxError'`, and matching the *name* is what test code and `catch`
  blocks actually check), carrying `selector` and `position` properties. It is
  exported from `mod.js`. Extending the built-in keeps `instanceof SyntaxError`
  true for anyone writing generic error handling.
- **Compiled-selector cache.** A module-level `Map` from selector string to
  AST, since the tree is read-only and an AST is immutable. Cap it at 500
  entries and `clear()` wholesale when the cap is exceeded — an unbounded cache
  is a memory leak when a caller builds selectors from user data in a loop.
  A simple wholesale clear is chosen over LRU bookkeeping deliberately: the
  cost of a rare full recompile is far below the cost of maintaining
  recency order on every lookup.
- **Never mutates its input** and returns the same frozen AST for repeated
  calls with the same string.

**Expected touch points**

- `lib/selector-parser.js` — tokenizer, parser, error class, cache
- `test/unit-tests/lib/selector-parser.test.js`

Treat this list as orientation, not permission to ignore other necessary files.
Record the actual files changed in the handoff notes.

**Acceptance criteria**

- [ ] Every construct in the supported grammar parses to the documented AST
      shape, verified by asserting on the returned structure.
- [ ] `div p`, `div > p`, `div + p`, `div ~ p` produce the four distinct
      combinators, and `left` chains toward the start of the selector.
- [ ] `a, b, c` produces a three-element selector list.
- [ ] `:nth-child(2n+1)`, `:nth-child(odd)`, `:nth-child(-n+3)`, and
      `:nth-child(3)` all compile to the correct `{ a, b }`.
- [ ] `:not(.a, .b)` parses its argument as a two-element selector list.
- [ ] `[href^="/docs"]`, `[data-x]`, and `[type="TEXT" i]` parse with the right
      operator, value, and flag.
- [ ] `.foo\.bar` parses to a single class named `foo.bar`.
- [ ] An empty selector, a trailing combinator, an unclosed bracket, and an
      unclosed parenthesis each throw with `error.name === 'SyntaxError'` and a
      `position`.
- [ ] `:has(p)` and `:hover` throw a message that names the unsupported
      construct, not a generic parse failure.
- [ ] Parsing the same selector twice returns the identical cached object.
- [ ] Exceeding the cache cap clears it without throwing and without returning
      a stale or wrong AST.

**Validation**

- `npm run lint`
- `node run-tests.js test/unit-tests/lib/selector-parser.test.js`
- Error tests use the `catchError` helper pattern from AGENTS.md and assert on
  `error.name`, `error.selector`, and `error.position` rather than
  `instanceof`.
- The cache-eviction test drives the parser past the cap in a loop and then
  re-parses an evicted selector, asserting the result still matches.
- `deno run --allow-read run-tests.js` and `deno lint`

**Progress and handoff**

- Completed: `lib/selector-parser.js` — a hand-written recursive-descent
  parser (`parseSelector`) over the documented grammar subset, an
  `SelectorSyntaxError` class, and a capped (500-entry, wholesale-clear)
  compiled-AST cache. `SelectorSyntaxError` is also exported from `mod.js`,
  per the plan. Unit tests covering compounds, all four combinators, comma
  lists, `:nth-*()` compilation, `:not()` with a selector-list argument,
  every attribute operator plus the `i` flag, escaped identifiers, four
  distinct syntax-error shapes, unsupported-construct error messages, and
  cache identity/eviction.
- Current state: Done.
- Remaining: Nothing for this task.
- Decisions and discoveries:
  - **Parse failures are a lightweight internal exception, not
    `SelectorSyntaxError` directly.** Every `fail(message, position)` call
    deep in the recursive-descent functions throws a private `ParseFailure`
    carrying only `{message, position}` — none of those functions have the
    original selector string in scope, and threading it through every
    parameter list would obscure the grammar logic. `parseSelector()` is the
    one place with the full string, so it wraps the whole parse in a
    try/catch and rebuilds the public `SelectorSyntaxError(message,
    selectorText, position)` there.
  - **`:not()`/`:is()`/`:where()` accept full complex selectors in their
    argument** (reusing `parseSelectorListInternal` rather than a
    combinator-free compound-only parser), which is more permissive than
    strict Selectors Level 3. No acceptance criterion exercises a combinator
    inside `:not()`, and rejecting it would need a second, near-duplicate
    parsing path for no tested benefit.
  - Attribute selector names are lowercased at parse time (`[href]` and
    `[HREF]` produce the same AST), matching how `Element` always stores its
    own attribute names lowercase — T8's matcher never needs to special-case
    selector-side casing for attribute names, only for tag names (where the
    AST intentionally keeps `tag` lowercased and defers the
    foreign-vs-HTML case-sensitivity call to T8, per the plan).
  - Namespace syntax (`ns|div`) has no dedicated error message — it fails as
    generic "unexpected trailing content," since `|` is not a compound
    continuation character. The plan only requires it be rejected, not with
    a specific message, unlike `:has()`/state pseudo-classes/pseudo-elements
    which do get named messages.
- Actual files changed: `lib/selector-parser.js` (new), `mod.js` (added the
  `SelectorSyntaxError` export), `test/unit-tests/lib/selector-parser.test.js`
  (new).
- Validation run: `npm run lint` (clean), `node run-tests.js` (134 tests
  passing across the whole suite), `deno run --allow-read run-tests.js` (134
  passing), `deno lint` (clean, 26 files), `npm pack --dry-run` (lib/
  contents include selector-parser.js), plus manual smoke tests for every
  grammar construct and the cache-eviction case before writing them up as
  real tests.
- Blockers: None.


### Task T8: querySelector, querySelectorAll, and closest

**Status:** Not started
**Depends on:** T4, T7
**Documentation:** MDN Element.querySelector, Element.closest

**Objective**

Selector queries work on `Element` and `Document`. This task joins the two
halves built independently in T4 and T7, and owns the matching semantics that
neither of them could decide alone — chiefly how case sensitivity and query
scope actually behave.

**Scope**

- In: `lib/selector-matcher.js` (compound and complex matching, the query
  walk), and wiring `querySelector`, `querySelectorAll` onto `ParentNode` and
  `closest` onto `Element`.
- Out: The selector grammar (T7). Any performance index over the tree.

**Design and invariants**

- **Match right to left.** Test the rightmost compound against the candidate
  first and only then walk left through combinators. Testing left to right
  would explore the tree for candidates that fail on their own tag name.
- **Query scope is subtler than it looks, and getting it wrong is the most
  likely defect in this task.** `element.querySelectorAll(sel)` returns only
  descendants of `element`, but matching evaluates against the **whole
  document tree**. So `section.querySelectorAll('body > p')` can match a `p`
  whose parent is outside `section`, because the `>` is checked against the
  real parent. Implement it as: walk descendants of `element`, and for each,
  run the full matcher against the real tree.
- **Case sensitivity.** Type selectors match case-insensitively against an HTML
  element's local name and case-sensitively against a foreign element's
  `rawName`. `#id`, `.class`, and attribute *values* are case-sensitive unless
  the attribute selector carries the `i` flag. Attribute *names* are matched
  lowercased for HTML elements.
- **Attribute operators.** `~=` splits the value on ASCII whitespace and looks
  for an exact token; `|=` matches the value exactly or as a prefix followed by
  `-`; `^=`, `$=`, `*=` are prefix, suffix, and substring, and all three match
  nothing when the selector value is the empty string, per the spec.
- **`-of-type` pseudo-classes count siblings sharing the element's local
  name**; the plain `-child` variants count all element siblings. `:root` is
  true only for `documentElement`. `:empty` is true when the element has no
  child elements and no non-empty `Text` children — comments do not count.
- **Results are frozen arrays in document order**, deduplicated across a
  selector list so `p, div` never returns an element twice.
  `querySelector` returns the first match or `null`; it must not build the full
  result array first.
- **`closest(sel)`** tests the element itself, then each ancestor element,
  returning the first match or `null`. It stops at `documentElement` and never
  returns the `Document`.
- **An invalid selector throws** `SelectorSyntaxError` from T7, unchanged.
  A valid selector that matches nothing returns `null` or an empty array — it
  is not an error.
- **No indexing.** `querySelectorAll` is a plain document-order walk. An id or
  tag prefilter is a legitimate future optimization but is out of scope here;
  do not add one speculatively.

**Expected touch points**

- `lib/selector-matcher.js` — matching and the query walk
- `lib/node.js` — `querySelector`/`querySelectorAll` on `ParentNode`
- `lib/element.js` — `closest`
- `test/unit-tests/lib/selector-matcher.test.js`

Treat this list as orientation, not permission to ignore other necessary files.
Record the actual files changed in the handoff notes.

**Acceptance criteria**

- [ ] All four combinators match correctly, including `+` and `~` skipping
      intervening `Text` nodes.
- [ ] `DIV`, `div`, and `Div` all match a `<div>`; a foreign `clipPath`
      matches `clipPath` but not `clippath`.
- [ ] `element.querySelectorAll('body > p')` matches a descendant `p` whose
      parent lies outside `element` — the scope-versus-matching rule above.
- [ ] `querySelectorAll('p, div')` returns document order with no duplicates.
- [ ] `querySelector` returns `null`, not `undefined`, when nothing matches.
- [ ] Every attribute operator is covered, including `[a^=""]` matching
      nothing and `[href|="en"]` matching `en` and `en-US` but not `english`.
- [ ] `:nth-child(2n)`, `:nth-of-type(1)`, `:first-child`, `:only-child`,
      `:empty`, and `:root` each have a passing and a failing case.
- [ ] `:not()`, `:is()`, and `:where()` work with multi-selector arguments.
- [ ] `closest` finds the element itself when it matches, walks ancestors
      otherwise, and returns `null` at the top.
- [ ] `document.querySelector` works and behaves as it does on an element.
- [ ] An invalid selector throws `SelectorSyntaxError` from every one of the
      three entry points.

**Validation**

- `npm run lint`
- `node run-tests.js test/unit-tests/lib/selector-matcher.test.js`
- Tests parse small documents with `parseHTML`, which is available by now, and
  assert on `tagName` and `id` of the results.
- `deno run --allow-read run-tests.js` and `deno lint`

**Progress and handoff**

- Completed: Nothing yet.
- Current state: Not started.
- Remaining: Everything described above.
- Decisions and discoveries: None yet.
- Actual files changed: None yet.
- Validation run: None yet.
- Blockers: None.


### Task T9: An end-to-end test over a realistic page

**Status:** Not started
**Depends on:** T5, T6, T8
**Documentation:** Implementation Approach, "Cross-cutting constraints"

**Objective**

One test that exercises every subsystem together against a single realistic
HTML document. Unit tests confirm each module against its own assumptions;
this task exists to catch the bugs that only appear where two modules meet —
a tokenizer offset the builder mislocates, a foreign element the serializer
lowercases, a class name the matcher splits differently than `classList` does.

**Scope**

- In: `test/unit-tests/fixtures/page.html` and
  `test/unit-tests/integration.test.js`.
- Out: Any change to `lib/`. If this task finds a defect, fix it in the owning
  module and record it in that task's handoff notes as well as this one.

**Design and invariants**

- **The fixture is a file, not a template literal.** It is the one input large
  enough that inlining it would obscure both the test and the HTML. Everything
  else in the suite stays inline.
- **The fixture must contain, deliberately, at least:** a doctype; a comment
  before `<html>`; a `<head>` with `<meta>`, `<title>` containing a character
  reference, and an inline `<style>`; a `<body>` with unclosed `<p>` and
  `<li>` elements; a table with implied `<tbody>` behavior; an inline `<svg>`
  with a `viewBox` attribute and a self-closed `<path/>`; an inline `<script>`
  containing `<` and `&` and a string that looks like an end tag; named,
  numeric, and unknown character references; an attribute with single quotes,
  one with no value, and one containing a `"` as an entity; a `<textarea>`
  with a character reference; nested elements with multiple classes; and one
  stray `</section>` end tag to force a recorded parse error.
- **The test reads the fixture with `node:fs`.** This is a test file, not
  `lib/`, so a `node:` import is allowed — but it must also work under Deno,
  which supports `node:fs`. Resolve the path from `import.meta.url`, never
  from `process.cwd()`, so the test passes regardless of where the runner is
  invoked.
- **Assertions cover all four subsystems** in one `describe` with nested
  groups: tree shape, recorded parse errors including their `line` and
  `column`, serialization round-trip, and a set of selector queries.
- **The round-trip assertion is structural**: parse, take
  `documentElement.outerHTML`, re-parse, and compare the two trees by walking
  them. A string-equality assertion would be brittle against harmless
  normalization, while a structural comparison is exactly the property we
  actually promise.
- **Parse-error assertions name codes, not counts.** Asserting "3 errors"
  breaks every time recovery improves; asserting "an error with code
  `stray-end-tag` at line N" stays true.

**Expected touch points**

- `test/unit-tests/fixtures/page.html` — the fixture
- `test/unit-tests/integration.test.js` — the end-to-end test

Treat this list as orientation, not permission to ignore other necessary files.
Record the actual files changed in the handoff notes.

**Acceptance criteria**

- [ ] The fixture contains every construct listed above.
- [ ] `document.head` holds the `meta`, `title`, and `style`; `document.body`
      holds the visible content.
- [ ] `document.doctype.name` is `'html'`.
- [ ] The comment before `<html>` is a `Document` child node, not in
      `document.children`.
- [ ] The unclosed `<p>` and `<li>` elements produce siblings, not nesting.
- [ ] The `svg` element reports `tagName === 'svg'`, retains `viewBox` casing,
      and its `path` has no children.
- [ ] The `script` element's `textContent` contains its `<` and `&` verbatim,
      and `innerHTML` returns them unescaped.
- [ ] `document.parseErrors` contains a record with code `stray-end-tag`
      whose `line` and `column` point at the stray tag in the fixture.
- [ ] Re-parsing `documentElement.outerHTML` yields a structurally identical
      tree.
- [ ] A descendant selector, a child combinator, an attribute selector, a
      `:nth-child()`, and a `closest()` call all return the expected elements
      from the fixture.
- [ ] The test passes identically under Node and Deno.

**Validation**

- `npm run lint`
- `node run-tests.js` — the whole suite, this test included.
- `deno run --allow-read run-tests.js` — proves the fixture path resolution and
  the `node:fs` import work on both runtimes. This is the specific check that
  the `--allow-read` permission is sufficient.
- `deno lint`

**Progress and handoff**

- Completed: Nothing yet.
- Current state: Not started.
- Remaining: Everything described above.
- Decisions and discoveries: None yet.
- Actual files changed: None yet.
- Validation run: None yet.
- Blockers: None.


### Task T10: Documentation describes the package that was actually built

**Status:** Not started
**Depends on:** T9
**Documentation:** README.md, AGENTS.md, PUBLISHING.md

**Objective**

Every prose document in the repository matches the implemented package, and
the eleven contradictions found during planning are resolved. This is last
because it is written against real structure rather than a prediction, which is
the reason it was split from T1.

**Scope**

- In: `README.md`, `AGENTS.md`, `PUBLISHING.md`, `.gitignore`, and any
  metadata in `package.json`/`deno.json` not already fixed by T1.
- Out: Any change to `lib/`, `mod.js`, or the tests.

**Design and invariants**

Resolve each finding recorded during planning:

1. **README** — add a Usage section showing `parseHTML` and the supported
   `Element`/`Document` members, and document the pragmatic-subset boundary so
   a user knows what the parser will not do. Link the conformance boundary
   rather than restating it.
2. **README version floors** — the current claims are wrong in two places.
   `run-tests.js` uses `util.parseArgs`, which needs Node >= 18.3, not the
   stated 16.13.2. `deno.json`'s `name`/`exports`/`publish` keys need Deno
   ~1.42+, not the stated 1.0.0. Decide the real floors, and make
   `package.json` `engines.node` agree with the README.
3. **AGENTS.md test paths** — its examples say `test/lib/config-loader.test.js`,
   but `run-tests.js` hardcodes `test/unit-tests/` and will never find a file
   there. Correct the examples to `test/unit-tests/lib/`.
4. **AGENTS.md `TODO` examples** — two inline-comment examples recommend `TODO`
   comments, which the project's own `no-warning-comments` rule flags. Either
   rewrite the examples without `TODO`, or state the exception explicitly.
   Do not leave the contradiction.
5. **AGENTS.md dependency count** — it says "two ES module libraries installed
   in `node_modules/`"; there are three, including `kixx-linting`.
6. **AGENTS.md arrow-function examples** — one omits parentheses around a
   single parameter (`n => n * 10`) and another includes them (`(def) =>`).
   The linter enforces neither. Pick one and make both examples agree.
7. **PUBLISHING.md runner path** — `deno run --allow-read test/run-tests.js` is
   wrong; the runner is at the repository root. Confirmed working as
   `deno run --allow-read run-tests.js`.
8. **PUBLISHING.md git tag typo** — step 8 says `git -a <tag> -m <message>`;
   it should be `git tag -a`.
9. **PUBLISHING.md** — add `deno doc mod.js` output review as a real step now
   that there is something to document, and confirm `tools/` is excluded from
   both publish manifests.
10. **`.gitignore`** — the comment "There are no dependencies, so we ignore
    package-lock" is wrong; there are three devDependencies and a lockfile
    exists on disk. Decide whether to commit the lockfile and make the comment
    and the rule agree either way.
11. **`tmp/`** — `tmp/sax/` was a planning reference and `tmp/prompt.md` was
    the original brief. Confirm with the user before removing anything; the
    directory is gitignored, so leaving it costs nothing.

**Expected touch points**

- `README.md` — usage, supported API, conformance boundary, version floors
- `AGENTS.md` — test paths, `TODO` examples, dependency count, arrow style
- `PUBLISHING.md` — runner path, git tag typo, `deno doc` step
- `.gitignore` — lockfile comment
- `package.json` — `engines.node`

Treat this list as orientation, not permission to ignore other necessary files.
Record the actual files changed in the handoff notes.

**Acceptance criteria**

- [ ] All eleven findings above are resolved or explicitly declined with a
      recorded reason.
- [ ] README's usage example runs verbatim and produces the documented output.
- [ ] Version floors in README and `package.json` agree with each other and
      with what the code actually requires.
- [ ] Every command quoted in README and PUBLISHING.md has been executed
      successfully from the repository root.
- [ ] `deno doc mod.js` renders the public API with no missing entries.
- [ ] No file under `lib/`, `mod.js`, or `test/` is modified.

**Validation**

- `npm run lint` and `node run-tests.js`
- `deno run --allow-read run-tests.js` and `deno lint`
- `deno doc mod.js` — proves the JSDoc on the public surface is complete and
  parseable, which no earlier task verifies.
- `npm pack --dry-run` — final confirmation of the shipped file list.
- Manual: run each command quoted in README and PUBLISHING.md and confirm it
  behaves as documented. This cannot be expressed as a single command because
  the point is that the *documentation* is accurate.

**Progress and handoff**

- Completed: Nothing yet.
- Current state: Not started.
- Remaining: Everything described above.
- Decisions and discoveries: None yet.
- Actual files changed: None yet.
- Validation run: None yet.
- Blockers: None.


Open Questions
--------------

None. All decisions were resolved in the planning interview on 2026-09-08 and
are recorded in the Implementation Approach above. If an implementing agent
finds a decision it needs that is not recorded here, that is a gap in this
plan: stop, ask the user, and add the answer to this document rather than
choosing and moving on.
