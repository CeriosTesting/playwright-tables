---
"@cerios/playwright-table": patch
---

`PlaywrightTable` fixes and speed-ups:

- `getBodyCellLocatorByRowConditions`, `getAllBodyCellLocatorsByHeaderName` and `getAllBodyCellLocatorsByHeaderIndex` now return the cell under the header in rows with `colspan` or `rowspan` (a cell that spans rows is located in the row it starts in), instead of the cell at that index in the DOM.
- `getAllBodyCellLocatorsByHeaderIndex` counts the columns that header colspans cover, so a header with `colspan="2"` covers two indexes instead of rejecting the second one. It also accepts the deprecated top-level `cellContentType`.
- Reading a table is much faster: each row is read in one round trip, and rows are read in parallel, instead of four round trips per cell. `waitForNonEmpty` checks the cells in one round trip.
- The package is built with tsdown instead of tsup. The entry points are the same, and ES module users now get their own type declarations (`dist/index.d.mts`).
