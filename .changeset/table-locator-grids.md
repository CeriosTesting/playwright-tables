---
"@cerios/playwright-table": minor
---

`TableLocator`: add pagination and virtual scrolling, grid presets, row interactions, footer rows, typed matcher arguments and table attachments on failure.

**Pagination and virtual scrolling**

- New table options:
  - `paginate`: next control, optional first control, `isLastPage`, `maxPages`.
  - `scroll`: scroll container, `step`, `rowKey`, `settle`, `maxSteps`.
  - `loading`: a loading indicator.
- These options accept a `Locator`, or a function that finds it from the table root.
- `findRow(where)` searches every page and scroll position, and returns a row locator once the table shows the row.
- `toJson({ allRows: true })` reads every row on every page and scroll position. Rows seen more than once are read once, matched by their row key or text, and kept in order.
- `totalRowCount()` and the `toHaveTotalRowCount` matcher count every row. They use `aria-rowcount` when the grid declares it, and otherwise read every row.

**Grid presets**

- `presets.agGrid()`, `presets.muiDataGrid()`, `presets.angularMaterial({ paginator })` and `presets.tanstackVirtual({ container })`.
- The AG Grid preset is tested against AG Grid Community 36.

**Row interactions**

- `row.fill(values)` fills inputs, selects, checkboxes and in-place cell editors (double-click, fill, then commit).
- `row.select()`, `row.deselect()` and `row.isSelected()`, with the `toBeSelected` row matcher.
- For tree grids: `row.expand()`, `row.collapse()`, `row.isExpanded()` and `row.level()`, with the `toBeExpanded` row matcher.

**Footer rows**

- `table.footer` gives footer rows (`tfoot>tr` by default, or set `footer.rowSelector`) with typed cells. Footer rows are not body rows.

**Typed matcher arguments**

- The exported `expect` now types matcher arguments by the table's headers, so a misspelled header in a table or row matcher is a compile-time error. This also applies after `.not` and with `expect.soft`.

**Debugging**

- A failing table matcher attaches the table's body rows to the test report as a Markdown table, once per test and table.
- `table.format()` returns the rows in view as a text table.

**Other changes**

- The README Playwright badge now says `>=1.45`, matching the peer dependency.
- The README has a new comparison section.
