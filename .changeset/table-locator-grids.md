---
"@cerios/playwright-table": minor
---

`TableLocator`: add pagination and virtual scrolling, grid presets, row interactions, footer rows, typed matcher arguments and table attachments on failure.

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
