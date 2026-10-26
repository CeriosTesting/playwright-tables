---
"@cerios/playwright-table": minor
---

`TableLocator`: add dataset matchers, typed values and waiting for a table to settle.

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
- `columnValues(column)` reads the text of every body cell in a column.
- `waitForStable({ quiet, timeout, loading })` waits until the header keys and body cell texts stop changing and the loading indicator is hidden.
- `toBeSortedBy` with `type: "number"` reads the one number in a text, using the same rules as the numeric conditions, with a `decimal` option. A text with more than one number, such as `"12:30"`, is not a number.
