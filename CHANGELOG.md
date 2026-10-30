# @cerios/playwright-table

## 2.1.0

### Minor Changes

- 2de19b3: `TableLocator`: add dataset matchers, typed values and waiting for a table to settle.

  - New table matchers:
    - `toContainRows(rows)`: each entry matches a different body row, in any order, and other rows are allowed.
    - `toHaveEveryRow(where)`: there are body rows and every one matches, for example after filtering. A table without body rows fails, also with `.not`.
    - `toHaveColumnValues(column, values)`: one value per body row, in order, or with `anyOrder`. Values take any cell condition.
    - `toHaveRows` takes an `anyOrder` option.
  - Unordered matching gives each entry a different row (a maximum bipartite matching), so overlapping entries don't take each other's rows. Failures show the entries left without a row and the body rows as an aligned text table.
  - Numeric cell conditions: `gt`, `gte`, `lt`, `lte` and `between`, with a `decimal` option for tables that use a decimal comma.
  - `toJson()` options:
    - `columns` picks columns, in that order.
    - `parse` converts columns to `"number"`, `"date"` or the result of your own function. The result type follows both options.
    - `decimal` sets the decimal separator for `"number"` columns.
    - `stable` waits until the table settles before reading.
    - `timeout` is the time for the whole read, `minRows` and `stable` included.
    - `parse` keys are normalized like header names, as `columns` keys are.
  - `columnValues(column)` reads the text of every body cell in a column.
  - `waitForStable({ quiet, timeout, loading })` waits until the header keys and body cell texts stop changing and the loading indicator is hidden. It also sees changes in a table without header rows, and in body columns wider than the header. Header keys of a hidden table get the CSS `text-transform` of the header, like a shown one.
  - `format()` shows the columns of a table without header rows by index.
  - `toBeSortedBy` with `type: "number"` reads the one number in a text, using the same rules as the numeric conditions, with a `decimal` option. A text with more than one number, such as `"12:30"`, is not a number.

- 2de19b3: `TableLocator`: add pagination and virtual scrolling, grid presets, row interactions, footer rows, typed matcher arguments and table attachments on failure.

  **Requires `@playwright/test` 1.45 or later** (the peer dependency was `^1.40.0`), and TypeScript 5.0 or later for the type declarations.

  **Pagination and virtual scrolling**

  - New table options:
    - `paginate`: next control, optional first control, `isLastPage`, `isFirstPage`, `maxPages`. `isFirstPage` is for a first control that stays enabled on page 1: without it, the table must change after the click, which takes up to 2 seconds to rule out (0.5 seconds for a table with a `loading` indicator that doesn't show).
    - `scroll`: scroll container, `step`, `rowKey`, `settle`, `maxSteps`. An invalid `step` or `settle` is an error, and so is a container that can never scroll (`overflow-y: visible` or `clip`), when navigation starts: the error names the element around or inside it that does scroll.
    - `loading`: a loading indicator.
  - These options accept a `Locator`, or a function that finds it from the table root.
  - `findRow(where)` searches every page and scroll position, and returns a row locator once the table shows the row.
  - `toJson({ allRows: true })` reads every row on every page and scroll position. A row seen at several scroll positions is read once, matched by its row key, or else by its text and how often that text came before it in the view, so identical rows are all kept. Rows with a position key (`aria-rowindex`, `row-index`, `data-rowindex`, `data-index`) are ordered by it; other rows keep the order they were shown in.
  - `totalRowCount()` and the `toHaveTotalRowCount` matcher count every row. They use `aria-rowcount` when the grid declares it (not that of a grid nested in a cell), and otherwise read every row.
  - `paginate.maxPages` and `scroll.maxSteps` limit how many pages and scroll steps are read, such as only the first 3 pages. Without them, every page is read.
  - Reaching the timeout before the end of the table is an error that says how many rows were read, so part of the rows is never returned as all of them.
  - Navigation first waits until the table settles (and the `loading` indicator is hidden), so a table that is still loading is not read as empty. After going to the next page, it waits until the table has rows again, so the empty table of a page that is loading is not read as a page.
  - A `next` or `first` control that matches twice (a pager above and below the table) uses the first one. A control is disabled with the `disabled` attribute, `aria-disabled="true"` or the `disabled` class, also on an element around it (Bootstrap pagers).
  - Scrolling is instant, also in a container with `scroll-behavior: smooth`.
  - `findRow` fails at once on a condition on an unknown header, with the available headers, and reports the errors of a `predicate` that throws.
  - `totalRowCount()` and `toJson({ allRows: true })` leave the table on its last page. Without `paginate.first`, the next read starts on the page in view.

  **Grid presets**

  - `presets.agGrid()`, `presets.muiDataGrid()`, `presets.angularMaterial({ paginator })` and `presets.tanstackVirtual({ container })`. The `paginator` is a `Locator` or a function that finds it from the table root. The Angular Material preset marks the "no data" row with `emptyRow`.
  - The AG Grid preset is tested against AG Grid Community 36. Its pinned top and bottom rows (such as totals) are footer rows, not body rows.

  **Row interactions**

  - `row.fill(values)` fills inputs, selects, checkboxes and in-place cell editors (double-click, fill, then commit). A value of the wrong kind (a string for a checkbox, a boolean for a text input) or a control that can't be filled is an error that names the column.
  - `row.select()`, `row.deselect()` and `row.isSelected()`, with the `toBeSelected` row matcher. A row with `aria-selected` is selected by it. The checkbox that selects a row is the one in a column without header text, or the new `select` table option; a checkbox in a column such as "Active" is data, and is never ticked to select the row.
  - For tree grids: `row.expand()`, `row.collapse()`, `row.isExpanded()` and `row.level()`, with the `toBeExpanded` row matcher. They click the `toggle` you pass (and fail if it doesn't show up), the element with `aria-expanded` in the row (not a menu button), or the button in the first cell of a row with `aria-expanded`, and otherwise press ArrowRight or ArrowLeft. Other buttons in the row are never clicked.

  **Footer rows**

  - `table.footer` gives footer rows (`tfoot>tr` by default, or set `footer.rowSelector`) with typed cells. Footer rows are not body rows.

  **Typed matcher arguments**

  - The exported `expect` types matcher arguments by the table's headers, so a misspelled header in a table or row matcher is a compile-time error. This also applies after `.not` and with `expect.soft`.

  **Debugging**

  - A failing table matcher attaches the table's body rows to the test report as a Markdown table, once per test and table.
  - `table.format()` returns the rows in view as a text table.

  **Other changes**

  - The README now leads with `TableLocator`. The `PlaywrightTable` docs moved to `docs/playwright-table.md`. `PlaywrightTable` is in maintenance mode: it still gets fixes, and new features land in `TableLocator`.

- 2de19b3: Add `TableLocator`: a type-safe table API that only returns Playwright locators, backed by a `pw-table-v1` custom selector engine. Rows and cells are resolved by header name in the browser on every retry, so locators auto-wait for late headers and rows and survive reordered columns.

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

- 2de19b3: `TableLocator`: the row, cell, `footer.rowSelector`, `emptyRow` and `ignore` options take a descriptor as well as a CSS selector: `{ css, role, hasText, hasNotText }`, such as `row: { rowSelector: { role: "row", hasNotText: "Loading" } }` or `emptyRow: { hasText: "No data" }`. Every field must match. `role` is the `role` attribute, or the role of a table element (`tr` is a `row`, `td` a `cell` or `gridcell`, `th` a `columnheader` or `rowheader`). The descriptor is checked in the browser on every retry, like a CSS selector, so locators keep auto-waiting. An invalid descriptor, or a `Locator` passed to one of these options, fails when the table is defined.

### Patch Changes

- 2de19b3: `PlaywrightTable` fixes and speed-ups:

  - A header cell with a `rowspan` of 3 or more now covers every header row it spans; it used to cover only the next row, which shifted the columns of the rows after it.
  - `getJson()` accepts the deprecated top-level `cellContentType`, and the deprecated option also applies when `headerRowOptions` is set.
  - `rowspan="0"` (span to the end of the table body) is accepted instead of rejected.
  - `getBodyCellLocatorByRowConditions`, `getAllBodyCellLocatorsByHeaderName` and `getAllBodyCellLocatorsByHeaderIndex` now return the cell under the header in rows with `colspan` or `rowspan` (a cell that spans rows is located in the row it starts in), instead of the cell at that index in the DOM.
  - `getAllBodyCellLocatorsByHeaderIndex` counts the columns that header colspans cover, so a header with `colspan="2"` covers two indexes instead of rejecting the second one. It also accepts the deprecated top-level `cellContentType`.
  - Reading a table is much faster: each row is read in one round trip, and rows are read in parallel, instead of four round trips per cell. `waitForNonEmpty` checks the cells in one round trip.
  - `waitForEmpty`, `waitForNonEmpty` and `waitForExactRowCount` always check the table at least once, so `timeout: 0` checks it once instead of failing without a check. A negative or `NaN` timeout is an error that says so.

  Packaging: the package is built with tsdown instead of tsup. The entry points and files in `dist` are the same. The type declarations use `const` type parameters, so TypeScript 5.0 or later is needed to type-check against them.

## 2.0.2

### Patch Changes

- 292436d: Improve header key readability when using header sanitization by normalizing line-ending and control whitespace variants to single spaces when `normalizeWhitespace` is enabled.

  This keeps default behavior unchanged (sanitization is still opt-in), while making normalized header text consistent across all header-based methods, including `getJson`, header-name lookups, and distinct-value queries.

  Also adds regression and integration tests covering line-ending/control whitespace header scenarios.

  Align header-name lookup methods with `getJson` header-key defaults so empty and duplicate header names resolve consistently (for example, `{{Empty}}` and `{{Empty}}__D1`) in methods like `getBodyCellLocatorByRowConditions`, `getAllBodyCellLocatorsByHeaderName`, `getDistinctColumnValues`, and `findRowIndex`.

## 2.0.1

### Patch Changes

- facc128: Improve support for custom grid headers (including ARIA treegrids) and make header sanitization options reusable across table APIs.
  - Add `normalizeWhitespace` and `stripIconGlyphs` to header parsing options to clean noisy header text (line breaks and icon-font glyphs).
  - Apply header sanitization in all methods that use header parsing, not only `getJson`.
  - Generalize `getBodyRows` to accept full `TableOptions` while keeping legacy `cellContentType` support.
  - Add a constructor warning when `header.rowSelector` and `row.rowSelector` are identical, since this can cause header rows to be read as body rows.
  - Add tests for header sanitization, treegrid behavior, and cross-method option usage; update docs with treegrid selector guidance and new options.

## 2.0.0

### Major Changes

- 7204552: ### Breaking Changes
  - **Removed auto-wait behavior**: Data retrieval methods (`getJson()`, `getBodyRows()`, `getHeaderRows()`, etc.) no longer automatically wait for table content to load. You must explicitly wait before calling these methods.
  - **Removed wait methods**: The following methods have been removed in favor of `expect.poll`:
    - `waitForHeaderRows()`
    - `waitForBodyRows()`
    - `waitForStable()`
    - `waitForRowByConditions()`
    - `waitForRowByIndex()`
    - `waitForCellText()`
  - **Migration guide**: See [MIGRATIONv2.md](./MIGRATIONv2.md) for detailed upgrade instructions.

  ### Improved error handling
  - Add detailed error messages with locator info, available headers, and search conditions for easier debugging

  ### Performance
  - Parallelize cell data fetching for significant speed improvements on large tables

  ### Documentation
  - Add `expect.poll` examples as recommended alternative to built-in wait methods
  - Improve JSDoc with usage examples and best practices

## 1.1.3

### Patch Changes

- ad31dea: exporting dist folder fix

## 1.1.2

### Patch Changes

- 245c893: Lower @playwright/test peer dependency

## 1.1.1

### Patch Changes

- ae9acb4: Extra typescript documentation, extra load options for all methods and return values always of type string

## 1.1.0

### Minor Changes

- 3459ebc: removed casting

## 1.0.4

### Patch Changes

- a2c399d: Updated typescript documentation and readme

## 1.0.2

### Patch Changes

- c67fdbc: fix readme

## 1.0.1

### Patch Changes

- 88228ab: Updated readme
