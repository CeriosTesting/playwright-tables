---
"@cerios/playwright-table": minor
---

Add `TableLocator`: a type-safe table API that only returns Playwright locators, backed by a `pw-table-v1` custom selector engine. Rows and cells are resolved by header name in the browser on every retry, so locators auto-wait for late headers and rows and survive reordered columns.

**Locators**

- `defineTable()` and `new TableLocator()`, with typed header keys from the `headers` option.
- `row(where)`, `rowAt(n)`, `rows`, `cell()`, `column()` and `header()`, plus `first()`, `last()`, `nth()` and `filter()` on rows.
- `cell()`, `column()`, `header()` and `toBeSortedBy` also take a column index, which also works on tables without header rows.
- `headerKeys()` and `validateHeaders()`.
- `toJson()` reads a snapshot, with `minRows` to wait for loaded rows and `raw: true` for the cell texts as the browser reads them.
- `registerTableSelectors()` and a ready-made `test` fixture register the selector engine. The engine runs in an isolated world, so it also works on pages whose CSP forbids `eval`.
- Locators read like the code that built them in error messages and traces (Playwright 1.53 and later), such as `locator('#users').row({ "Name": "John" }).cell("Status")`.

**Cell conditions**

- A string, a RegExp, `equals`, `contains`, `startsWith`, `endsWith`, `oneOf`, `empty` and `predicate`, and the `not`, `anyOf` and `allOf` combinators.
- A `predicate` gets the raw cell text as its second argument. A `predicate` that throws fails the row (also inside `not`, `anyOf` and `allOf`), and the matchers report its error. A generator or async function is rejected.
- The `readInputValues` option reads the current value of text inputs and text areas in body cells as cell text (for editable grids), in conditions, `toJson()` and the matchers. Header cells and raw text are not affected.
- The `emptyRow` option (a CSS selector) marks placeholder rows, such as "No data", that are never body rows, so an empty table has 0 body rows.
- `oneOf` takes `ignoreCase`, and `{ empty: false }` matches a cell with text. An empty `oneOf` or a `null` condition is an error that names the header.

**Matchers**

- Table matchers: `toHaveRow`, `toHaveRowCount`, `toHaveHeaders`, `toHaveRows` and `toBeSortedBy` (text, number and date sorting, a custom `compare`, and an optional `aria-sort` check).
- Row matcher: `toHaveCells`.
- They are exported as `tableMatchers` and as a pre-extended `expect`.
- Negated `toHaveRow`, `toHaveCells` and `toHaveRows` assertions wait for the headers and fail on an unknown header, so a typo never passes. They also fail on a `predicate` that throws, which matches no row.
- `not.toHaveHeaders` and `not.toHaveRowCount` fail on a table that is not there, instead of passing.
- A `timeout` of `0` reads once in every matcher, and a negative or `NaN` timeout is an error. `toBeSortedBy` fails at once when `compare` throws.
- A failure is reported soon after the timeout: the reads that describe it are short, and a table that is not there is not attached.

**Table structure**

- `th` and `td` cells are read in both header and body rows, so row headers don't shift columns.
- Rows and cells of nested tables are ignored.
- In a table without a `<thead>`, leading rows of `<th>` cells in the first `<tbody>` are header rows. A table built with DOM methods, with its rows right inside the `<table>` (no `<tbody>`), works too.
- Like in HTML, a `rowspan` stops at the end of its `<tbody>`, `rowspan="0"` spans to it, and huge spans are capped (1000 columns, 65534 rows).
- The `aria` option uses ARIA roles for ARIA grids. Cells are placed by `aria-colindex`, rows split over pinned containers are joined by `aria-rowindex`, and `aria-colspan`/`aria-rowspan` are supported.
- Like Playwright locators, rows and cells are found inside open shadow roots, so a web component that renders its table in a shadow root can be the table root.

**Text is read as the user sees it**

- Header text is always one line. Body cells keep their line breaks as one `\n` between trimmed lines.
- Invisible characters, icon glyphs (private use characters) and hidden elements are left out, and accents are composed (NFC).
- The `ignore` option lists CSS selectors of elements inside cells whose text is left out. It defaults to `DEFAULT_IGNORE` (exported): screen reader only text (`.sr-only`, `.visually-hidden`), Material Icons and Material Symbols ligatures, and `[aria-hidden=true]`.
- Header names you pass are normalized the same way, so `"First\nname"` finds the header `First name`.
