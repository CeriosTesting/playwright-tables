---
"@cerios/playwright-table": patch
---

`PlaywrightTable` fixes and speed-ups:

- A header cell with a `rowspan` of 3 or more now covers every header row it spans; it used to cover only the next row, which shifted the columns of the rows after it.
- `getJson()` accepts the deprecated top-level `cellContentType`, and the deprecated option also applies when `headerRowOptions` is set.
- `rowspan="0"` (span to the end of the table body) is accepted instead of rejected.
- `getBodyCellLocatorByRowConditions`, `getAllBodyCellLocatorsByHeaderName` and `getAllBodyCellLocatorsByHeaderIndex` now return the cell under the header in rows with `colspan` or `rowspan` (a cell that spans rows is located in the row it starts in), instead of the cell at that index in the DOM.
- `getAllBodyCellLocatorsByHeaderIndex` counts the columns that header colspans cover, so a header with `colspan="2"` covers two indexes instead of rejecting the second one. It also accepts the deprecated top-level `cellContentType`.
- Reading a table is much faster: each row is read in one round trip, and rows are read in parallel, instead of four round trips per cell. `waitForNonEmpty` checks the cells in one round trip.
- `waitForEmpty`, `waitForNonEmpty` and `waitForExactRowCount` always check the table at least once, so `timeout: 0` checks it once instead of failing without a check. A negative or `NaN` timeout is an error that says so.

Packaging: the package is built with tsdown instead of tsup. The entry points and files in `dist` are the same. The type declarations use `const` type parameters, so TypeScript 5.0 or later is needed to type-check against them.
