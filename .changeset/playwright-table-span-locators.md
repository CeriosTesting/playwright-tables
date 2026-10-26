---
"@cerios/playwright-table": patch
---

`PlaywrightTable`: `getBodyCellLocatorByRowConditions`, `getAllBodyCellLocatorsByHeaderName` and `getAllBodyCellLocatorsByHeaderIndex` now return the cell under the header in rows with `colspan` or `rowspan` (a cell that spans rows is located in the row it starts in), instead of the cell at that index in the DOM. Reading a table is much faster: each row is read in one round trip, and rows are read in parallel, instead of four round trips per cell. `waitForNonEmpty` checks the cells in one round trip.
