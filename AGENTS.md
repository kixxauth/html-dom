Read the @README.md for the project overview, including what this project is and why it exists.

Code Quality Guidelines
-----------------------

**Owners of responsibility**

Shift your focus from *how* an operation is performed to *what* object, method, or function is responsible for doing it.

- A class is useful when there is durable state, a lifecycle, caching, or an API that benefits from grouping related operations.
- A module is enough when the responsibility needs private helpers but no per-instance state.
- A plain helper function is enough when the behavior is stateless, has no hidden invariants, and can be named precisely.
- Data that carries important invariants should usually be manipulated through the module or object that owns those invariants.

**Lean into Object Oriented Programming (OOP)**

Consider the owners of responsibility for your logic, but do not blindly follow the "one class per noun" methodology.

**Smaller modules, classes, and methods are not always better**

Creating small classes, methods, and functions is NOT your goal when writing or refactoring code; making the code simpler is your goal. There are times when you should bring code together to make it simpler when breaking it apart would make it more complex:

- Code that shares information; for example, both pieces of code might depend on information about a common protocol.
- They are used together: anyone using one of the pieces of code is likely to use the other as well.
- They overlap conceptually, in that there is a simple higher-level category that includes both of the pieces of code.
- It is hard to understand one of the pieces of code without looking at the other.

**Avoid thin wrapper classes**

Avoid writing classes which are just wrappers over data, with getters and setters.

Code Style Guidelines
---------------------

This project uses JavaScript in the **ECMAScript 2022** standard using **ES modules** (no CommonJS, no `"use strict"`).

**The Linter is Authoritative**

The ESLint config in `eslint.config.js` enforces the code style rules beyond what this guide explicitly includes. If the linter reports an error, fix it, even if it isn't covered by this document.

### Naming Conventions

- **Files**: kebab-case (`user-service.js`, not `UserService.js`)
- **Functions**: camelCase, verb-first (`createUser`, `validateToken`)
- **Classes**: PascalCase with descriptive suffixes (`UserCreateInput`, `AuthResponse`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_RETRY_COUNT`)
- **Boolean variables**: is/has/can prefix (`isActive`, `hasPermission`)


### Use whitespace to organize code

Let the reader of the code breathe. Add empty lines between logical blocks of code.

### Arrow Functions

Single-expression bodies go on one line:

```javascript
[1, 2, 3].map(n => n * 10);
```

Multi-statement or complex bodies use a block on multiple lines:

```javascript
const isConst = variable.defs.some((def) => {
    return def.type === 'Variable' &&
        def.parent &&
        def.parent.kind === 'const';
});
```

### Function Argument Objects

Destructure object arguments inside the function body, not in the parameter list. This keeps defaults and `args ?? {}` handling consistent:

```javascript
// Correct
function runSubProcess(args) {
    const {
        argv = [],
        cwd = process.cwd(),
        stderr = process.stderr,
    } = args ?? {};
}

// Wrong
function runSubProcess({ argv = [], cwd = process.cwd() } = {}) { ... }
```

### Unused Variables (`no-unused-vars`)

Every declared variable, import, and function argument must be used. If a positional argument is required by a callback signature but not needed, prefix it with `_`:

```javascript
button.addEventListener('click', (_event) => {
    submitForm();
});
```

The `_` prefix works for variables, function arguments, and destructured array elements. It does **not** work for caught error bindings or unused object destructuring keys. Remove unused object keys entirely.

For `catch` blocks where the error object is not needed, omit the binding entirely:

```javascript
try {
    parse(input);
} catch {
    return null;
}
```

### Private Class Members

Use ES2022 `#` private fields and methods instead of underscore prefixes:

```javascript
// Correct
class Foo {
    #privateField;
    #privateMethod() { ... }
}

// Wrong
class Foo {
    _privateField;
    _privateMethod() { ... }
}
```

### Async Code

Rule: When an async function or method delegates its return value to another Promise-returning operation, await that operation before returning. Do not return the delegated Promise directly.

Awaiting the Promise causes a rejection to pass through the current function, preserving that function as an async frame in the error stack. Accordingly, Promise-forwarding wrappers should generally be declared `async` and use `return await`.

This is correct:

```js
export async function getObjectListing(baseUrl) {
    const res = await fetch(`${ baseUrl }/objects`);
    return await res.json();
}
```

This is incorrect because `getObjectListing()` may be omitted from the error stack if the delegated Promise rejects:

```js
export async function getObjectListing(baseUrl) {
    const res = await fetch(`${ baseUrl }/objects`);
    return res.json();
}
```

### Inline Code Comments

Use inline comments to explain intent, constraints, context, and decisions that the code cannot express clearly by itself. Be opportunistic: when you had to reason about why code belongs in its current shape, leave a short comment so the next reader does not have to rediscover that reasoning.

Focus on why the code exists and why it does what it does, especially when it seems counterintuitive or requires domain knowledge:

Good inline comments often capture:

- why this logic branch exists
- why this order matters
- why this default is safe or required
- why a value is cloned, frozen, normalized, or rewrapped
- why an error is caught, translated, hidden, or allowed to propagate
- why a simpler-looking implementation would be wrong in this runtime

Prefer one or two focused lines near the decision. A useful comment does not need to justify the whole function.

**Use Guide Comments to Break Up Complex Logic**

Use short guide comments to separate phases in longer logic when the section boundaries help readers scan intent.

```javascript
async function processPayment(order, paymentMethod) {
    // Validate payment details and customer eligibility.
    await validatePaymentMethod(paymentMethod);
    await checkCustomerCredit(order.customerId);

    // Calculate final amounts including taxes and fees.
    const taxAmount = calculateTax(order);
    const finalAmount = order.total + taxAmount + calculateFee(paymentMethod, order.total);

    // Process payment and update order status.
    const transaction = await chargePayment(paymentMethod, finalAmount);
    await updateOrderStatus(order.id, 'paid', transaction.id);

    return transaction;
}
```

**Document State Transitions and Side Effects**

```javascript
// After this call, the connection state changes to 'authenticating'
// and subsequent messages are queued until auth completes.
await connection.startAuthentication(credentials);
```

**Use Teacher Comments for Domain Knowledge**

```javascript
// JWT exp claim uses NumericDate format in seconds since epoch.
// JavaScript Date.now() returns milliseconds, so divide by 1000.
const expiry = Math.floor(Date.now() / 1000) + (60 * 60 * 24);
```

**Document Workarounds and Hacks**

```javascript
// Workaround: Some legacy clients send timestamps as strings.
// TODO: Remove this once all clients upgrade to v2.
const timestamp = typeof data.timestamp === 'string'
    ? parseInt(data.timestamp, 10)
    : data.timestamp;
```

**Explain Performance or Memory Considerations**

```javascript
// Pre-allocate the buffer to avoid repeated reallocations during
// high-frequency writes.
const buffer = Buffer.allocUnsafe(expectedSize);

// Process in chunks to avoid blocking the event loop.
for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    await processChunk(chunk);

    // Yield control back to the event loop between chunks.
    await setImmediate();
}
```

**Explain Protocol, Security, and Compatibility Decisions**

Use inline comments for decisions that encode HTTP rules, browser behavior, platform limits, security posture, or compatibility with external clients. These comments should explain the consequence, not just restate the operation.

```javascript
// Content-Length is measured in bytes, not JavaScript characters; using
// string length can truncate UTF-8 responses containing multi-byte characters.
const contentLength = new Blob([ body ]).size;
```

**Flag Coordinated Change Points**

```javascript
const EVENT_TYPES = {
    USER_LOGIN: 'user:login',
    USER_LOGOUT: 'user:logout',
    // WARNING: When adding event types here, also update:
    // - src/analytics/event-handlers.js
    // - test/fixtures/events.json
};
```

Code Documentation Guidelines
-----------------------------

Our primary method of code documentation is JSDoc comments.

Code documentation should answer two questions without requiring the reader to inspect the implementation: "What does this do?" and "How do I use it?"

JSDoc block comments are the formal API contract: types, parameters, return values, errors, and events.

### Supported JSDoc Tags

- **@async**: mark a function or method as asynchronous when it returns a Promise but does not use the `async` keyword.
- **@readonly**: mark a symbol as readonly, meaning that it cannot be overwritten.
- **@module**: define a top-level file comment instead of documenting the subsequent symbol. A value can be specified to identify the module.
- **@see**: define an external reference related to the symbol.
- **@callback**: define a callback.
- **@property**: define a property on a symbol.
- **@typedef**: define a type.
- **@param**: define a parameter on a function.
- **@emits**: denote an event which an object or class emits.
- **@returns**: define the return type and/or comment of a function.
- **@throws**: define what a function throws when called.
- **@enum**: define an object to be an enum.
- **@extends**: define a type that a function extends.
- **@implements**: define an interface or type that a class or object implements.
- **@name**: explicitly define the name of a symbol which may otherwise be difficult to discern.
- **@public**: mark public members when a surrounding class or module already uses explicit visibility tags.
- **@type**: define the type of a symbol.
- **@default**: define the default value for a variable, property, or field.


### Document the Contract

Call out observable behavior that a caller must preserve:

- mutation of arguments or instance state
- return values used for control flow, such as `false`, `null`, or `this`
- ordering requirements, one-shot consumption, immutability, or lifecycle timing
- defaults that affect security, protocol behavior, persistence, or caching

```javascript
/**
 * Calculates the total price including tax and discounts.
 * @param {number} basePrice - The original price before adjustments
 * @param {number} taxRate - Tax rate as a decimal, such as 0.08 for 8%
 * @param {number} [discount=0] - Discount amount to subtract
 * @returns {number} The final price after tax and discount
 */
function calculateTotal(basePrice, taxRate, discount = 0) {}
```

For chainable methods, mutating methods, and cascade-style handlers, make the return contract explicit:

```javascript
/**
 * Attempts to handle an error using registered handlers in order.
 * @param {Error} error - Error to handle
 * @returns {ServerResponse|false} Response when handled, or false to continue the cascade
 */
function handleError(error) {}
```

Be specific about object shapes, array contents, and union types. Use `@typedef` blocks for complex data structures:

```javascript
/**
 * @typedef {Object} UserProfile
 * @property {string} id - Unique user identifier
 * @property {string} email - User's email address
 * @property {string[]} roles - Array of role names
 */

/**
 * @param {string} id - The UUID for the user
 * @returns {UserProfile} The full UserProfile object
 */
function getUser(id) {}
```

Show the relative JSDoc import path to external type definitions when they exist:

```javascript
/**
 * @typedef {import('../config/config.js').default} Config
 */
```

Only include an import path like `import('../config/config.js').default` when the file path can be positively located. If the file path cannot be verified, use only the type name, such as `Config`.

Use dotted `@param` notation for function and method arguments/options. Do not introduce a `@typedef` just to describe an `options` argument shape; document it inline with dotted params instead:

```javascript
/**
 * @param {Object} options - Context initialization options
 * @param {AppRuntime} options.runtime - Runtime configuration
 * @param {Config} options.config - Application configuration manager instance
 * @param {Logger} options.logger - Logger instance for application logging
 */
createContext({ runtime, config, logger }) {}
```

**Do Not Use JSDoc for Module-Private Functions**

JSDoc documents a module's public contract — the exported functions, classes, and types that other modules call. Functions that are private to a module (those that are not exported) do not get JSDoc block comments. They have no external callers, and a JSDoc block above an internal helper only adds ceremony that drifts out of sync with the code.

When a private helper needs explanation — a non-obvious decision, a constraint, or a surprising return value — use a short inline comment instead. Place it where the reasoning lives, not as a header block.

```javascript
function isPlainObject(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }

    // A null prototype (e.g. Object.create(null) dictionaries) also counts as
    // plain, alongside ordinary object literals.
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
```

A well-named helper whose behavior is obvious from its name and body needs neither JSDoc nor an inline comment:

```javascript
function isEven(n) {
    return n % 2 === 0;
}
```

This rule is about module-private *functions*. Class members declared with `#private` syntax are covered separately under "Document Classes" below.

### Document Events

Document events using the `@emits` tag. Use `@typedef` blocks to document event object structures:

```javascript
/**
 * @typedef {Object} FileChangeEvent
 * @property {string} filepath - Absolute path to the changed file
 * @property {string} eventType - Type of change, either 'rename' or 'change'
 */

/**
 * Monitors a directory for file changes using glob patterns to filter events.
 * @extends EventEmitter
 * @emits FileWatcher#change - Emits a FileChangeEvent when a matching file changes
 * @emits FileWatcher#error - Emits a WrappedError when the underlying fs.watch fails
 */
export default class FileWatcher extends EventEmitter {}
```

### Document Classes

- Use `@name` on members defined via `Object.defineProperties()` or `Object.defineProperty()` to give them an explicit name.
- Do not add the `@private` tag to private members; JavaScript's `#private` syntax already communicates visibility.
- Keep documentation sparse for private methods and members. A brief description is sufficient when documentation is needed.
- Do not include a description for `constructor` JSDoc blocks. Only document `@param` tags and `@throws` when relevant.

Unit Testing Guidelines
-----------------------

This project uses two ES module libraries installed in `node_modules/` and imported by bare module name:

- `kixx-test` provides the test runner API: `describe`, `it`, `before`, `after`, `xit`, `xdescribe`, and `MockTracker`.
- `kixx-assert` provides assertion helpers. Assertions throw `AssertionError` on failure.

The project test runner imports test files first, which register top-level `describe` blocks, then executes the registered tests.

### Assertions

All assertion helpers from kixx-assert throw `AssertionError` on failure. A message string can be passed as the last argument.

| Assertion | Description |
|---|---|
| `assert(value)` | Truthy check |
| `assertFalsy(value)` | Falsy check |
| `assertEqual(expected, actual)` | Equality using `isEqual`; supports `NaN` and valid `Date` comparison |
| `assertNotEqual(expected, actual)` | Inverse of `assertEqual` |
| `assertMatches(matcher, actual)` | Match by RegExp, equality, string `includes`, or Date ISO string |
| `assertNotMatches(matcher, actual)` | Inverse of `assertMatches` |
| `assertDefined(value)` | Not `undefined` |
| `assertUndefined(value)` | Is `undefined` |
| `assertNonEmptyString(value)` | Non-empty string |
| `assertNumberNotNaN(value)` | Number or BigInt and not `NaN` |
| `assertArray(value)` | Is an array |
| `assertBoolean(value)` | Is a boolean |
| `assertFunction(value)` | Is a function |
| `assertValidDate(value)` | Is a valid `Date` instance |
| `assertRegExp(value)` | Is a `RegExp` instance |
| `assertGreaterThan(control, subject)` | `subject > control` |
| `assertLessThan(control, subject)` | `subject < control` |

### Test File Conventions

- Name test files with the project convention `*.test.js`, for example `test/lib/config-loader.test.js`.
- Mirror the source tree where practical: `lib/config-loader.js` is tested by `test/lib/config-loader.test.js`.
- Use one top-level `describe` per test file, named after the module, class, or behavior under test.

### Basic Structure

```javascript
import { describe } from 'kixx-test';
import { assert, assertEqual } from 'kixx-assert';

// Factory function for creating instances of an object under test.
function createSubject() {
    // Build and return the test subject.
}

describe('ModuleName', ({ before, after, it, describe, xit, xdescribe }) => {
    let subject;

    before(() => {
        subject = createSubject();
    });

    after(() => {
        subject.close();
    });

    it('returns the configured value', () => {
        assertEqual('expected', subject.getValue());
    });

    xit('temporarily skipped behavior', () => {
        assertEqual('expected', subject.getOtherValue());
    });

    describe('nested behavior group', ({ before, it }) => {
        let nestedSubject;

        before(() => {
            nestedSubject = createSubject({ enabled: true });
        });

        it('handles the enabled state', () => {
            assert(nestedSubject.isEnabled());
        });
    });

    xdescribe('disabled behavior group', ({ it }) => {
        it('does not run tests in this group', () => {
            assert(false);
        });
    });
});
```

Nested `describe` blocks are useful for grouping related behavior and setup.

### Test Hook Semantics

- `before(fn, opts?)` runs once before tests and child suites in its enclosing `describe`.
- `after(fn, opts?)` runs once after tests and child suites in its enclosing `describe`.
- There is no `beforeEach` or `afterEach`.
- If a `before` hook fails, tests and child suites in that `describe` are skipped, but `after` hooks for that `describe` still run.
- Hooks in a disabled suite are registered, but their runnable blocks are disabled and do not execute.

Prefer local setup inside each `it` for mutable state. Use `before` for expensive setup or shared fixtures that will not be mutated in a way that makes tests order-dependent.

### Test Functions and Timeouts

Tests and hooks can be synchronous, promise-returning, `async`, or callback-style:

```javascript
it('computes a value', () => {
    assertEqual(42, computeValue());
});

it('fetches data', async () => {
    const result = await fetchData();
    assertEqual('ok', result.status);
});

it('calls back', (done) => {
    setTimeout(() => {
        try {
            assertEqual(true, isReady());
            done();
        } catch (error) {
            done(error);
        }
    }, 10);
}, { timeout: 100 });
```

The default timeout is 1000ms per runnable block. Pass `{ timeout: ms }` to `it`, `before`, `after`, `describe`, or `xdescribe` to override it for that block or suite. A timeout passed to `describe` becomes the default for runnable blocks registered inside it unless those blocks provide their own timeout.

Callback-style tests are detected by function arity. If the test function accepts one or more parameters, the runner treats it as callback-style and waits for `done()`.

### Skipping Tests

```javascript
xit('temporarily skipped test', () => {
    assert(false);
});

xdescribe('entire skipped suite', ({ it }) => {
    it('is also skipped', () => {
        assert(false);
    });
});

describe('disabled suite', ({ it }) => {
    it('is skipped because the suite is disabled', () => {
        assert(false);
    });
}, { disabled: true });

describe('placeholder suite');
```

A test or suite declared with only a name is disabled. Disabled tests are reported in the final disabled test count, not the executed test count.

### Mocking With MockTracker

Use `MockTracker` to create standalone mock functions or replace object methods/getters/setters.

```javascript
import { describe, MockTracker } from 'kixx-test';
import { assertEqual, assertUndefined } from 'kixx-assert';

describe('Service', ({ before, after, it }) => {
    const tracker = new MockTracker();
    const calculator = {
        multiply(a, b) {
            return a * b;
        },
    };
    let add;

    before(() => {
        add = tracker.fn((a, b) => a + b);
        tracker.method(calculator, 'multiply', (a, b) => a * b * 10);
    });

    after(() => {
        tracker.reset();
    });

    it('records function calls', () => {
        assertEqual(7, add(3, 4));
        assertEqual(1, add.mock.callCount());
        assertEqual(3, add.mock.getCall(0).arguments[0]);
        assertEqual(7, add.mock.getCall(0).result);
        assertUndefined(add.mock.getCall(0).error);
    });

    it('mocks object methods', () => {
        assertEqual(120, calculator.multiply(3, 4));
        assertEqual(1, calculator.multiply.mock.callCount());
        assertUndefined(calculator.multiply.mock.getCall(0).error);
    });
});
```

For simple interaction tests, create a `MockTracker` inside the `it` and call `tracker.reset()` before the test returns. Prefer mocking methods on fresh local objects. When a tracker or mocked object is shared by several tests, create it in the `describe` and reset it in `after`.

Useful mock APIs:

- `tracker.fn(original?, implementation?, options?)` creates a mock function.
- `tracker.method(object, propertyName, implementation?, options?)` replaces a method.
- `options.times` auto-restores after that many calls.
- `mockFn.mock.callCount()` returns the number of calls.
- `mockFn.mock.getCall(index)` returns frozen call data: `arguments`, `result`, `error`, `this`, and `target`.
- `mockFn.mock.mockImplementation(fn)` replaces future behavior.
- `mockFn.mock.mockImplementationOnce(fn, onCall?)` overrides one call.
- `mockFn.mock.resetCalls()` clears call history and one-time implementations.
- `tracker.restoreAll()` restores managed mocks but keeps them associated with the tracker.
- `tracker.reset()` restores all mocks and clears the tracker.

### Error and Rejection Tests

When testing thrown errors, catch and assert on stable fields. Prefer `error.name`, `error.code`, and `error.message` over `instanceof`, because vendored or duplicated modules can create different constructor identities.

For repeated error tests, define small file-local helpers:

```javascript
function catchError(fn) {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return null;
}

async function catchAsyncError(fn) {
    try {
        await fn();
    } catch (error) {
        return error;
    }
    return null;
}
```

Then keep each assertion focused on the stable contract:

```javascript
it('throws on invalid input', () => {
    const caught = catchError(() => subject.process(null));

    assert(caught, 'expected an error to be thrown');
    assertEqual('TypeError', caught.name);
    assertMatches('Expected non-null', caught.message);
});
```

For async rejection cases:

```javascript
it('rejects on failure', async () => {
    const caught = await catchAsyncError(() => subject.fetch('bad-id'));

    assert(caught, 'expected an error to be thrown');
    assertEqual('NotFoundError', caught.name);
});
```

## Writing Good Tests

- Name each `it` as a behavior statement, for example `'returns null when input is empty'`.
- Keep each `it` focused on one behavior.
- Avoid relying on test order. The runner executes tests sequentially in registration order, but tests should still be understandable in isolation. Test files are loaded in a deterministic order so that a failure reproduces identically on another machine and in CI. That guarantee exists for debugging, and is not permission to let one test file depend on another having run first.
- Prefer local setup in `it` blocks for mutable state.
- Use file-local factories to keep required context explicit without repeating large object literals.
- Assert observable behavior: return values, thrown errors, emitted output, state changes, or calls made through mocks.
- Use `MockTracker` for interaction tests, and reset shared trackers in `after`.
- Keep disabled tests temporary and intentional; disabled tests are visible in runner output.

## Dependencies

NEVER install dependencies without explicitly being asked to install them by the user.

If you think you need a dependency that is not already vendored, stop working on that task and ask the user to install it.

## Work Verification

**Run the linter** according to the instructions in the `README.md` for every JavaScript source file you changed during your task. Fix any linting errors you find for the code you have written during your task before you are done.

Follow the unit testing guidelines above, in this document. When you discover broken unit tests; think carefully about the correctness if the implementation. If the unit tests need to be updated to match the intended behavior of the implementation then update the unit tests. Otherwise fix the implementation to address the issue that broken tests have highlighted.

## Helpful Tips

### Writing Style

When writing something intended for human consumption, (comment, commit message, reply to prompt) use as few words as possible. Be down to the point. Less is more.

Don't assume your audience is experts. Write for developers who are just getting started in their programming journey.

### Commit Messages

When you write a commit message, follow these rules:

- Separate the subject line from the body with a single blank line.
- Limit the subject line to 50 characters (72 is the absolute hard limit).
- Capitalize the first letter of the subject line.
- Do not end the subject line with a period.
- Use the imperative mood in the subject line (e.g., "Fix bug," "Add feature," not "Fixed" or "Adds"). Test formula: It must complete the sentence: "If applied, this commit will [your subject line here]".
- Wrap the body text manually at 72 characters to prevent Git formatting issues.
- Use the body to explain what and why vs. how. Assume the code explains the how; the message must explain the context and reasoning.
- Never attribute authorship of a commit to yourself. Use the current git user instead with `git config user.name` and `git config user.email`.

### Explanatory Output

You should provide insightful explanations about how you are approaching a task and the tradeoffs you are making while remaining focused on the task. For non-trivial code changes, before and after writing code, provide brief insightful explanations about your implementation choices and your thinking supporting those choices using:

"★ Insight ─────────────────────────────────────
[2-3 key insightful points]
─────────────────────────────────────────────────"

These insights should be included in the conversation, not in the codebase. Focus on interesting insights that are specific to the codebase or the code you are writing, rather than general programming concepts. Do not wait until the end to provide insights. Provide them as you think about changes and write code.
