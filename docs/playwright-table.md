# `PlaywrightTable` (classic API)

> **Maintenance mode.** `PlaywrightTable` is fully supported and still gets fixes, but new features land in [`TableLocator`](../README.md). `TableLocator` returns auto-waiting locators and has retrying `expect` matchers, so you don't need the polling helpers on this page. For new tests, start with the [README](../README.md).
>
> Upgrading from v1.x? See the [Migration Guide](../MIGRATIONv2.md).

`PlaywrightTable` reads a table into arrays and objects, and finds cell locators by row and column. It handles `colspan`, `rowspan` and several header rows.

## Contents

- [Basic usage](#basic-usage)
- [Default selectors](#default-selectors)
- [Reading the table](#reading-the-table)
  - [`getHeaderRows`](#getheaderrowsoptions)
  - [`getMainHeaderRow`](#getmainheaderrowoptions)
  - [`getBodyRows`](#getbodyrowsoptions)
  - [`getJson`](#getjsonoptions)
- [Cell locators](#cell-locators)
  - [`getBodyCellLocator`](#getbodycelllocatorrownumber-headerposition)
  - [`getBodyCellLocatorByRowConditions`](#getbodycelllocatorbyrowconditionsconditions-targetheader-options)
  - [`getAllBodyCellLocatorsByHeaderName`](#getallbodycelllocatorsbyheadernameheadername-options)
  - [`getAllBodyCellLocatorsByHeaderIndex`](#getallbodycelllocatorsbyheaderindexheaderindex-options)
- [Counting and searching](#counting-and-searching)
  - [`getRowCount`](#getrowcount)
  - [`getDistinctColumnValues`](#getdistinctcolumnvaluesheadername-options)
  - [`findRowIndex`](#findrowindexconditions-options)
- [Waiting methods](#waiting-methods)
  - [`waitForEmpty`](#waitforemptyoptions)
  - [`waitForNonEmpty`](#waitfornonemptyoptions)
  - [`waitForExactRowCount`](#waitforexactrowcountcount-options)
- [Options](#options)
- [Error handling](#error-handling)
- [Best practices](#best-practices)
- [TypeScript](#typescript)
- [`PlaywrightTable` and `TableLocator` differences](#playwrighttable-and-tablelocator-differences)

---

## Basic usage

```ts
import { PlaywrightTable } from "@cerios/playwright-table";
import { expect } from "@playwright/test";

// Create a table instance
const table = new PlaywrightTable(page.locator("table"));

// Wait for the rows, then read the table as JSON
await table.waitForNonEmpty();
const data = await table.getJson();
// [{ Name: "John", Age: "30" }, { Name: "Jane", Age: "25" }]

// Get a cell locator
const cell = table.getBodyCellLocator(0, 1); // row 0, cell 1
await expect(cell).toHaveText("30");

// Wait for dynamic content
await table.waitForExactRowCount(5, { timeout: 10_000 });
```

The methods that read the table don't wait: they read it once. They throw `No header rows found` or `No body rows found` when the table has no header rows or no body rows (yet). Wait first with a [waiting method](#waiting-methods) or `expect.poll` (see [Best practices](#best-practices)).

## Default selectors

| Part         | Default selector |
| ------------ | ---------------- |
| Header rows  | `thead>tr`       |
| Header cells | `th`             |
| Body rows    | `tbody>tr`       |
| Body cells   | `td`             |

You can change them in the constructor (see [Options](#options)).

---

## Reading the table

All methods in this section throw when the table has no header rows or no body rows.

### `getHeaderRows(options?)`

Reads every header row, with `colspan` and `rowspan` resolved. A `rowspan` header is repeated in the rows below it; a `colspan` header is repeated in every column it covers (with a suffix such as `__C1`, if you ask for one).

**Parameters:** `options?: HeaderRowOptions` (see [Header row options](#header-row-options))

**Returns:** `Promise<HeaderRow[]>`

```ts
// <thead>
//   <tr><th rowspan="2">Name</th><th colspan="2">Details</th></tr>
//   <tr><th>Age</th><th>City</th></tr>
// </thead>
// <tbody>
//   <tr><td>John</td><td>30</td><td>NYC</td></tr>
// </tbody>

const headers = await table.getHeaderRows({
	colspan: { enabled: true, suffix: true },
});
// [
//   ["Name", "Details", "Details__C1"],
//   ["Name", "Age", "City"]
// ]
```

### `getMainHeaderRow(options?)`

Reads the main header row: the **last header row**, unless you set `header.setMainHeaderRow` in the constructor.

**Parameters:** `options?: HeaderRowOptions`

**Returns:** `Promise<HeaderRow>`

**Throws** also when `setMainHeaderRow` is out of bounds.

```ts
// Use the first header row as the main header
const table = new PlaywrightTable(page.locator("table"), {
	header: { setMainHeaderRow: 0 },
});

const mainHeader = await table.getMainHeaderRow();
// ["Name", "Age", "City"]
```

> The header row options default to off here, so the names can differ from the keys of `getJson()` and the methods that look up headers by name (see [Which defaults apply](#which-defaults-apply)).

### `getBodyRows(options?)`

Reads every body row, with `colspan` and `rowspan` resolved: a spanning cell is repeated in every position it covers.

**Parameters:** `options?: TableOptions`

**Returns:** `Promise<BodyRow[]>`

```ts
const rows = await table.getBodyRows();
// [["John", "30", "NYC"], ["Jane", "25", "LA"]]

// Include hidden text
const withHidden = await table.getBodyRows({
	bodyRowOptions: { cellContentType: CellContentType.TextContent },
});

// Clean up noisy headers, for example in a custom grid
const cleaned = await table.getBodyRows({
	headerRowOptions: { normalizeWhitespace: true, stripIconGlyphs: true },
});
```

| Cell content type             | Reads                                                 |
| ----------------------------- | ----------------------------------------------------- |
| `CellContentType.InnerText`   | The rendered text, without hidden elements (default). |
| `CellContentType.TextContent` | All text in the DOM, hidden elements included.        |

### `getJson(options?)`

Reads the table as an array of objects: one per body row, keyed by the main header row.

**Parameters:** `options?: TableOptions`

**Returns:** `Promise<Record<string, string>[]>`

```ts
// <thead><tr><th>Name</th><th>Age</th></tr></thead>
// <tbody>
//   <tr><td>John</td><td>30</td></tr>
//   <tr><td>Jane</td><td>25</td></tr>
// </tbody>

const json = await table.getJson();
// [
//   { Name: "John", Age: "30" },
//   { Name: "Jane", Age: "25" }
// ]
```

By default, the keys of a table with `colspan`, empty or duplicate headers look like this:

```ts
// [
//   {
//     "Awesome Rowspan": "Value1",
//     "Name": "John",
//     "Name__C1": "Doe",          // the second column of a colspan="2" header
//     "{{Empty}}": "EmptyValue",  // an empty header
//     "Duplicate": "First",
//     "Duplicate__D1": "Second"   // the second header with the same name
//   }
// ]
```

---

## Cell locators

### `getBodyCellLocator(rowNumber, headerPosition)`

Returns the locator of a cell by row and cell index (0-based). It doesn't read the table, so it doesn't throw on an empty table.

Both indexes are positions in the DOM: `headerPosition` counts the cells of the row, so in a row with `colspan` or `rowspan` it can differ from the column under a header. The methods below find cells by column and account for spans: a cell that spans rows is located in the row it starts in.

**Returns:** `Locator`

```ts
const cell = table.getBodyCellLocator(1, 2);
await expect(cell).toHaveText("Expected Value");
await cell.click();
```

### `getBodyCellLocatorByRowConditions(conditions, targetHeader, options?)`

Finds the first body row where every condition matches, and returns the cell under `targetHeader`. A condition matches when the cell text equals the value exactly.

**Parameters:**

- `conditions: Record<string, string> | [string, string]`: header-value pairs, or one `[header, value]` tuple
- `targetHeader: string`: the column of the cell to return
- `options?: TableOptions`

**Returns:** `Promise<Locator>`

**Throws** when no row matches, when a header doesn't exist, or when the table is empty.

```ts
// Several conditions
const emailCell = await table.getBodyCellLocatorByRowConditions({ "First name": "John", Status: "Active" }, "Email");
await expect(emailCell).toContainText("@example.com");

// One condition, as a tuple
const actionCell = await table.getBodyCellLocatorByRowConditions(["Username", "john.doe"], "Actions");
await actionCell.locator("button.delete").click();
```

### `getAllBodyCellLocatorsByHeaderName(headerName, options?)`

Returns the locators of every body cell under a header.

**Returns:** `Promise<Locator[]>`

**Throws** when the header doesn't exist, or when the table is empty.

```ts
const statusCells = await table.getAllBodyCellLocatorsByHeaderName("Status");
for (const cell of statusCells) {
	await expect(cell).toHaveText(/Active|Inactive/);
}

// Read the text of every cell in the "Name" column
const nameCells = await table.getAllBodyCellLocatorsByHeaderName("Name");
const names = await Promise.all(nameCells.map(cell => cell.textContent()));
// ["John", "Jane", "Bob"]
```

### `getAllBodyCellLocatorsByHeaderIndex(headerIndex, options?)`

Returns the locators of every body cell in a column, by column index (0-based). A header with `colspan="2"` covers two indexes.

**Returns:** `Promise<Locator[]>`

**Throws** when the index is out of bounds, or when the table is empty.

```ts
const firstColumnCells = await table.getAllBodyCellLocatorsByHeaderIndex(0);
for (const cell of firstColumnCells) {
	await expect(cell).toBeVisible();
}
```

---

## Counting and searching

### `getRowCount()`

Counts the header and body rows, without reading any cells. It doesn't throw on an empty table, so it also works to check that a table is empty.

**Returns:** `Promise<{ header: number; body: number }>`

```ts
const { header, body } = await table.getRowCount();
expect(body).toBe(10);

// Wait until the table is empty
await expect.poll(async () => (await table.getRowCount()).body).toBe(0);
```

### `getDistinctColumnValues(headerName, options?)`

Returns the distinct values in a column, trimmed and sorted, without empty values.

**Returns:** `Promise<string[]>`

**Throws** when the header doesn't exist, or when the table is empty.

```ts
const statuses = await table.getDistinctColumnValues("Status");
// ["Active", "Inactive", "Pending"]

expect(await table.getDistinctColumnValues("Role")).toContain("Admin");
```

### `findRowIndex(conditions, options?)`

Returns the index of the first body row where every condition matches, or `-1` if none does. A condition matches when the cell text equals the value exactly.

**Returns:** `Promise<number>`

**Throws** when a header doesn't exist, or when the table is empty (it doesn't return `-1` then).

```ts
const index = await table.findRowIndex({ Username: "john.doe" });
if (index >= 0) {
	await table.getBodyCellLocator(index, 3).locator("button.delete").click();
}
```

---

## Waiting methods

The waiting methods retry until the condition holds, and throw with the last error when the timeout passes.

| `PollingOptions` | Default            |
| ---------------- | ------------------ |
| `timeout`        | 30 000 ms          |
| `interval`       | 100 ms, every time |

### `waitForEmpty(options?)`

Waits until the table has no body rows.

```ts
await page.locator("button.delete-all").click();
await table.waitForEmpty({ timeout: 5000 });

const { body } = await table.getRowCount();
expect(body).toBe(0);
```

### `waitForNonEmpty(options?)`

Waits until the table has at least one body row with content: a row where at least one cell has text. Empty skeleton rows don't count.

```ts
await page.locator("button.load-data").click();
await table.waitForNonEmpty({ timeout: 5000 });

const data = await table.getJson();
expect(data.length).toBeGreaterThan(0);
```

### `waitForExactRowCount(count, options?)`

Waits until the table has exactly `count` body rows. `count` must be a non-negative integer; `0` works like `waitForEmpty()`.

```ts
await page.locator("input.search").fill("admin");
await table.waitForExactRowCount(3); // exactly 3 admin users

await page.locator("button.page-2").click();
await table.waitForExactRowCount(25);
```

---

## Options

### Constructor options

```ts
const table = new PlaywrightTable(page.locator(".custom-table"), {
	header: {
		setMainHeaderRow: 0, // the first header row is the main one (default: the last)
		rowSelector: ".header-row", // default: "thead>tr"
		columnSelector: ".header-cell", // default: "th"
	},
	row: {
		rowSelector: ".data-row", // default: "tbody>tr"
		columnSelector: ".data-cell", // default: "td"
	},
});
```

When `header.rowSelector` and `row.rowSelector` are the same, the constructor logs a warning: header rows would also be read as body rows.

#### Div-based tables

```ts
const divTable = new PlaywrightTable(page.locator(".divTable"), {
	header: {
		rowSelector: ".divTableHeading > .divTableRow",
		columnSelector: ".divTableHead",
	},
	row: {
		rowSelector: ".divTableBody > .divTableRow",
		columnSelector: ".divTableCell",
	},
});
```

#### ARIA treegrids

For `role="treegrid"` structures, scope the header and body row selectors to different containers. With the same selector for both (such as `div[role='row']`), header rows are read as body rows too.

```ts
const table = new PlaywrightTable(page.locator("[role='treegrid']"), {
	header: {
		setMainHeaderRow: 0,
		rowSelector: "[data-kind='header-group'] > div[role='row']",
		columnSelector: "div[role='columnheader']",
	},
	row: {
		rowSelector: "[data-kind='body-group'] > div[role='row']",
		columnSelector: "div[role='gridcell']",
	},
});
```

### `TableOptions`

The methods that read the table take `TableOptions`:

```ts
await table.getJson({
	headerRowOptions: { duplicateSuffix: true }, // see Header row options
	bodyRowOptions: { cellContentType: CellContentType.TextContent },
});
```

The top-level `cellContentType` is deprecated: use `bodyRowOptions.cellContentType`. It still works, in every method that reads body cells.

### Header row options

```ts
const headers = await table.getHeaderRows({
	cellContentType: CellContentType.TextContent, // include hidden text (default: InnerText)
	emptyCellReplacement: true, // "" becomes "{{Empty}}"
	duplicateSuffix: true, // "Name", "Name__D1", "Name__D2"
	normalizeWhitespace: true, // "Account\nName" becomes "Account Name"
	stripIconGlyphs: true, // removes icon-font glyphs (Unicode private use characters)
	colspan: {
		enabled: true, // repeat a colspan header in every column it covers
		suffix: true, // "Col", "Col__C1", "Col__C2"
	},
});
```

#### Which defaults apply

| Method                                                                                                                          | `colspan`                    | `duplicateSuffix`, `emptyCellReplacement` | `normalizeWhitespace`, `stripIconGlyphs` |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------- | ---------------------------------------- |
| `getHeaderRows`, `getMainHeaderRow`                                                                                             | off                          | off                                       | off                                      |
| `getBodyRows`, `getAllBodyCellLocatorsByHeaderIndex`                                                                            | always enabled (suffix: off) | off                                       | off                                      |
| `getJson`, `getBodyCellLocatorByRowConditions`, `getAllBodyCellLocatorsByHeaderName`, `getDistinctColumnValues`, `findRowIndex` | enabled, with suffix         | on                                        | off                                      |

Options you pass override these defaults. Because the defaults differ, a header name read with `getMainHeaderRow()` can differ from the key that `getJson()` and the header-name methods use, on tables with `colspan`, empty or duplicate headers. Pass the same `headerRowOptions` to both, or take the keys from `getJson()`.

---

## Error handling

Errors say what went wrong and where:

```ts
try {
	await table.getBodyCellLocatorByRowConditions({ Name: "John" }, "Emial");
} catch (error) {
	console.error(error.message);
	// Header "Emial" not found.
	// Available headers: [Name, Age, Email]
	// Header row locator: locator('table').locator('thead>tr')
}
```

Error messages include, where it applies:

- The locators of the table and its rows
- The available headers, when a header is not found
- The number of columns or header rows, when an index is out of bounds
- The conditions and the number of rows searched, when no row matches
- The expected and actual row counts, when a waiting method times out

---

## Best practices

### Wait before you read

```ts
// ❌ Throws if the table is still loading
const data = await table.getJson();

// ✅ Wait for content first
await table.waitForNonEmpty();
const data = await table.getJson();

// ✅ Or for a row count
await table.waitForExactRowCount(5);
const data = await table.getJson();
```

### Use `expect.poll` for flexible waiting

`expect.poll` retries a function until the assertion passes, and also retries while the function throws. That makes it a good fit for the methods that read the table:

```ts
import { expect } from "@playwright/test";

// At least 5 rows
await expect.poll(async () => (await table.getBodyRows()).length).toBeGreaterThanOrEqual(5);

// A row with this data
await expect.poll(() => table.getJson()).toContainEqual({ Name: "John", Status: "Active" });

// A value in a column
await expect.poll(() => table.getDistinctColumnValues("Status")).toContain("Completed");

// An empty table: count with getRowCount(), because the read methods throw on an empty table
await expect.poll(async () => (await table.getRowCount()).body).toBe(0);

// Custom timeout and intervals
await expect
	.poll(async () => (await table.getBodyRows()).length, {
		message: "Waiting for table to have 10 rows",
		timeout: 10_000,
		intervals: [100, 250, 500, 1000],
	})
	.toBe(10);
```

### Pick the content type

```ts
// Visible text only (the default)
const rows = await table.getBodyRows({ bodyRowOptions: { cellContentType: CellContentType.InnerText } });

// All text, hidden elements included
const all = await table.getBodyRows({ bodyRowOptions: { cellContentType: CellContentType.TextContent } });
```

### Get a locator first, then interact

```ts
const cell = await table.getBodyCellLocatorByRowConditions({ Name: "John Doe" }, "Actions");
await cell.locator("button.edit").click();
```

---

## TypeScript

```ts
import {
	PlaywrightTable,
	CellContentType,
	type HeaderRow,
	type BodyRow,
	type Cell,
	type HeaderRowOptions,
	type TableOptions,
	type PollingOptions,
} from "@cerios/playwright-table";
```

---

## `PlaywrightTable` and `TableLocator` differences

Both can be used on the same table. On some tables, `getJson()` and `TableLocator.toJson()` give different results:

- `TableLocator` also reads `th` cells in body rows and `td` cells in header rows, skips nested tables, and uses `aria-colindex` and `aria-rowindex`.
- `TableLocator` normalizes text the way it is shown: see [How text is read](../README.md#how-text-is-read).

See [`TableLocator` or `PlaywrightTable`?](../README.md#tablelocator-or-playwrighttable) in the README.
