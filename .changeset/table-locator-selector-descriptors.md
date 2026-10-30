---
"@cerios/playwright-table": minor
---

`TableLocator`: the row, cell, `footer.rowSelector`, `emptyRow` and `ignore` options take a descriptor as well as a CSS selector: `{ css, role, hasText, hasNotText }`, such as `row: { rowSelector: { role: "row", hasNotText: "Loading" } }` or `emptyRow: { hasText: "No data" }`. Every field must match. `role` is the `role` attribute, or the role of a table element (`tr` is a `row`, `td` a `cell` or `gridcell`, `th` a `columnheader` or `rowheader`). The descriptor is checked in the browser on every retry, like a CSS selector, so locators keep auto-waiting. An invalid descriptor, or a `Locator` passed to one of these options, fails when the table is defined.
