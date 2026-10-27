# 🎭 Playwright Tables | By Cerios

[![npm version](https://img.shields.io/npm/v/@cerios/playwright-table.svg?style=flat-square)](https://www.npmjs.com/package/@cerios/playwright-table)
[![npm downloads](https://img.shields.io/npm/dm/@cerios/playwright-table.svg?style=flat-square)](https://www.npmjs.com/package/@cerios/playwright-table)
[![license](https://img.shields.io/npm/l/@cerios/playwright-table.svg?style=flat-square)](https://github.com/CeriosTesting/playwright-tables/blob/main/LICENSE)
[![Playwright](https://img.shields.io/badge/playwright-%3E%3D1.45.0-45ba4b.svg?style=flat-square&logo=playwright)](https://playwright.dev)

> **Using `PlaywrightTable`?** The classic API (`getJson()`, `getBodyCellLocator()`, `waitFor*()`) is still supported, in maintenance mode: it gets fixes, and new features land in `TableLocator`. Its docs are in [docs/playwright-table.md](docs/playwright-table.md). Upgrading from v1.x? See the [Migration Guide](MIGRATIONv2.md).

Find rows and cells by header name in your Playwright tests, and assert on whole tables. `TableLocator` gives you auto-waiting Playwright locators and retrying `expect` matchers for HTML tables and data grids, with header names checked at compile time.

```ts
await expect(users.row({ Name: "John" }).cell("Status")).toHaveText("Active");
await expect(users).toHaveRows([{ Name: "John" }, { Name: "Jane" }]);
```

**Key features:**

- ✅ **Rows and cells by header name**, as Playwright locators that auto-wait and retry
- ✅ **Compile-time checked header names**, with autocomplete
- ✅ **Retrying table matchers**: `toHaveRow`, `toHaveRows`, `toContainRows`, `toHaveEveryRow`, `toHaveColumnValues`, `toBeSortedBy`, `toHaveTotalRowCount` and more
- ✅ **Rich cell conditions**: text, RegExp, `contains`, `oneOf`, numeric comparisons, `not`/`anyOf`/`allOf` and your own predicates
- ✅ **Complex tables**: `colspan`, `rowspan`, several header rows, row headers, nested tables and shadow DOM
- ✅ **Data grids**: presets for AG Grid, MUI X Data Grid, Angular Material and TanStack Virtual, with **pagination** and **virtual scrolling**
- ✅ **Row interactions**: fill inputs and in-place editors, select rows, expand tree grid rows
- ✅ **Text as the user sees it**: icon glyphs, screen reader only text and invisible characters are left out
- ✅ **Readable failures**: the table is shown in the error and attached to the test report

## How it compares

Playwright has no table API: finding "the cell under _Status_ in the row where _Name_ is John" means chaining `getByRole("row").filter(...)` and counting header positions yourself. The request for a built-in table selector ([microsoft/playwright#4646](https://github.com/microsoft/playwright/issues/4646)) was closed as not planned, so this package fills that gap.

|                                                       | Playwright locators | Most table helpers | `TableLocator`           |
| ----------------------------------------------------- | ------------------- | ------------------ | ------------------------ |
| Cell by row condition and header name                 | manual              | ✔                  | ✔, as a retrying locator |
| Conditions per cell (not row-wide `hasText`)          | manual              | some               | ✔                        |
| `colspan` / `rowspan`, multi-row headers              | ✗                   | rarely             | ✔                        |
| ARIA grids, pinned columns, `aria-rowindex`           | `getByRole` only    | some               | ✔                        |
| Retrying `expect` matchers for rows, columns, sorting | ✗                   | ✗                  | ✔                        |
| Pagination and virtual scrolling                      | ✗                   | some               | ✔                        |
| Typed header names, checked at compile time           | ✗                   | ✗                  | ✔                        |

---

## Installation

```bash
npm i -D @cerios/playwright-table
```

You need [`@playwright/test`](https://playwright.dev/docs/intro) 1.45 or later. With Playwright 1.53 and later, locators also read like the code that built them in error messages and traces.

## Quick start

Import `test` and `expect` from this package instead of `@playwright/test`:

```ts
import { test, expect, defineTable } from "@cerios/playwright-table";

test("users table", async ({ page }) => {
	await page.goto("/users");
	const users = defineTable(page.locator("#users"), { headers: ["Name", "Status", "Email"] });

	// The cell under "Status" in the row where "Name" is John. Retries until it matches.
	await expect(users.row({ Name: "John" }).cell("Status")).toHaveText("Active");

	// Cells are plain Playwright locators
	await users.row({ Name: "Jane" }).cell("Email").getByRole("link").click();

	// Assert the whole table: exactly these rows, in order
	await expect(users).toHaveRows([
		{ Name: "John", Status: "Active" },
		{ Name: "Jane", Status: /inactive/i },
	]);
});
```

The `test` of this package registers the selector engine that `TableLocator` uses. If you have your own `test`, see [Setup](#setup).

## Contents

- [Setup](#setup)
- [Defining a table](#defining-a-table)
- [Rows and cells](#rows-and-cells)
  - [Column indexes and tables without headers](#column-indexes-and-tables-without-headers)
  - [Row headers and nested tables](#row-headers-and-nested-tables)
- [Cell conditions](#cell-conditions)
- [Matchers](#matchers)
  - [Sorting](#sorting)
  - [Typed matcher arguments](#typed-matcher-arguments)
  - [Bring your own matchers](#bring-your-own-matchers)
- [Reading data](#reading-data)
  - [Some columns and typed values](#some-columns-and-typed-values)
  - [Waiting for a table to settle](#waiting-for-a-table-to-settle)
- [Row interactions](#row-interactions)
- [Footer rows](#footer-rows)
- [Data grids](#data-grids)
  - [ARIA grids (AG Grid, MUI Data Grid)](#aria-grids-ag-grid-mui-data-grid)
  - [Grid presets](#grid-presets)
  - [Pages and virtual scrolling](#pages-and-virtual-scrolling)
  - [Shadow DOM](#shadow-dom)
- [Reference](#reference)
  - [How text is read](#how-text-is-read)
  - [Header keys](#header-keys)
  - [Header validation](#header-validation)
  - [Timeouts](#timeouts)
- [Debugging failures](#debugging-failures)
- [Common pitfalls](#common-pitfalls)
- [`TableLocator` or `PlaywrightTable`?](#tablelocator-or-playwrighttable)
- [TypeScript](#typescript)

---

## Setup

`TableLocator` resolves rows and cells in the browser with a custom selector engine (`pw-table-v1`), on every retry. That is what makes its locators auto-wait, and stay correct when columns move.

The `test` of this package registers the engine with a worker-scoped auto fixture. If you have your own fixtures, call `registerTableSelectors()` instead. It must run **before the page is created**, and it is safe to call more than once:

```ts
import { registerTableSelectors } from "@cerios/playwright-table";
import { test as base } from "@playwright/test";

export const test = base.extend<{}, { tableSelectors: void }>({
	tableSelectors: [
		async ({ playwright }, use) => {
			await registerTableSelectors(playwright.selectors);
			await use();
		},
		{ scope: "worker", auto: true },
	],
});
```

Without an argument, `registerTableSelectors()` registers the engine with the `selectors` of `@playwright/test`, for example in a `test.beforeAll`.

The engine runs in an isolated world, so locators, matchers and predicates also work on pages whose CSP forbids `eval`.

## Defining a table

```ts
const users = defineTable(page.locator("#users"), { headers: ["Name", "Status", "Email"] });
// or: new TableLocator(page.locator("#users"), { headers: ["Name", "Status", "Email"] })
```

The first argument is the table root: the `<table>`, or the element that holds the grid. All options are optional:

| Option                    | Default                                                       | Description                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `headers`                 |                                                               | The header names, for typed header keys and `validateHeaders()`. Without it, any string is accepted as a header. It doesn't restrict anything at runtime. |
| `header.rowSelector`      | `thead>tr`, plus leading `<th>` rows in a table without thead | The header rows. In a table without a `<thead>`, the leading rows of `<th>` cells (without `<td>`) in the first `<tbody>` are header rows.                |
| `header.columnSelector`   | `th, td`                                                      | The header cells.                                                                                                                                         |
| `header.setMainHeaderRow` | the last header row                                           | The index of the header row whose names are the [header keys](#header-keys).                                                                              |
| `row.rowSelector`         | `tbody>tr`, without those header rows                         | The body rows.                                                                                                                                            |
| `row.columnSelector`      | `td, th`                                                      | The body cells, so row headers are columns too (see [Row headers and nested tables](#row-headers-and-nested-tables)).                                     |
| `footer.rowSelector`      | `tfoot>tr`                                                    | The [footer rows](#footer-rows).                                                                                                                          |
| `aria`                    | `false`                                                       | Use ARIA roles for the default selectors (see [ARIA grids](#aria-grids-ag-grid-mui-data-grid)).                                                           |
| `cellContentType`         | `InnerText`                                                   | How header and body text is read: `CellContentType.InnerText` or `TextContent` (see [How text is read](#how-text-is-read)).                               |
| `ignore`                  | `DEFAULT_IGNORE`                                              | Elements in cells whose text is left out (see [Ignored elements](#ignored-elements)).                                                                     |
| `paginate`                |                                                               | How to go to the next page (see [Pages and virtual scrolling](#pages-and-virtual-scrolling)).                                                             |
| `scroll`                  |                                                               | How to scroll a virtualized grid (see [Pages and virtual scrolling](#pages-and-virtual-scrolling)).                                                       |
| `loading`                 |                                                               | The loading indicator, such as a spinner. `waitForStable()` and the page and scroll navigation wait until it is hidden.                                   |

`paginate`, `scroll` and `loading` take a `Locator`, or a function that finds it from the table root (`root => root.getByRole("progressbar")`).

To read only `thead` rows as header rows and `tbody` rows as body rows, set `header.rowSelector` to `"thead>tr"` and `row.rowSelector` to `"tbody>tr"`. When the two row selectors are the same, a warning is logged: header rows would also be read as body rows.

For popular data grids, [presets](#grid-presets) set these options for you.

## Rows and cells

```ts
users.row({ Name: "John" }); // TableRow: body rows where every condition matches
users.rowAt(0); // TableRow: the n-th body row (0-based)
users.rows; // TableRow: all body rows
users.cell(anyRowLocator, "Email"); // Locator: the cell under a header for any row locator
users.column("Status"); // Locator: every body cell under a header
users.header("Name"); // Locator: the header cell
users.footer; // TableRow: the footer rows
users.root; // Locator: the table root

const row = users.row({ Name: "John" });
row.locator; // Locator for the row element(s)
row.cell("Email"); // Locator for the cell
row.filter({ hasText: "x" }); // TableRow narrowed with Locator.filter()
row.first(); // TableRow: the first of these rows (also last() and nth(i))
row.table; // the TableLocator of the row
```

Everything above is built synchronously and resolved when you use it, like any Playwright locator. Header names are resolved to columns on every evaluation, so a locator stays correct when columns move.

Snapshots and navigation are `async`:

```ts
await users.toJson(); // every body row as an object keyed by header
await users.columnValues("Status"); // the text of every body cell in a column (also by index)
await users.headerKeys(); // the header keys
await users.waitForStable(); // waits until the table stops changing
await users.findRow({ Name: "Joe" }); // TableRow: searches every page and scroll position
await users.totalRowCount(); // every body row, also on other pages
await users.format(); // the rows in view as a text table
```

`row()` follows Playwright's strict mode: acting on it throws when several rows match. Use `first()`, `last()`, `nth(i)`, `rows.filter(...)`, `rowAt(n)` or `table.cell(anyRowLocator, header)` to compose. All of them keep typed cell access.

```ts
await users.row({ Status: "Active" }).first().cell("Edit").click();
await expect(users.rows.filter({ hasText: "Jane" }).cell("Status")).toHaveText("Active");
await expect(users.rows.last().cell("Name")).toHaveText("Joe");
await expect(users.column("Status")).toHaveText(["Active", "Inactive", "Active"]);
```

A condition object needs at least one condition: `row({})` throws. Use `rows` for every row.

### Column indexes and tables without headers

`cell()`, `column()`, `header()` and `columnValues()` also take a 0-based column index. Indexes follow the visual grid, so a cell spanning columns or rows covers every index it spans, just like header keys do.

```ts
await expect(users.row({ Name: "John" }).cell(2)).toHaveText("john@example.com");
await expect(users.column(1)).toHaveText(["Active", "Inactive", "Active"]);
```

Column indexes don't need a header row, so they also work on tables without one. Header names, `row()` conditions, `toJson()` and `toHaveRows` need a header row:

```ts
const plain = defineTable(page.locator("#plain")); // <table> with only a <tbody>
await expect(plain.rowAt(1).cell(0)).toHaveText("Jane");
await expect(plain.rows.filter({ hasText: "Jane" }).cell(2)).toHaveText("jane@example.com");
await expect(plain).toHaveRowCount(2);
```

### Row headers and nested tables

Accessible tables often start each body row with a row header (`<th scope="row">`), and put an empty `<td>` in the corner of the header row. `TableLocator` takes `th` and `td` cells in both header and body rows, so these columns don't shift:

```html
<thead>
	<tr>
		<td></td>
		<th>Q1</th>
		<th>Q2</th>
	</tr>
</thead>
<tbody>
	<tr>
		<th scope="row">North</th>
		<td>100</td>
		<td>200</td>
	</tr>
</tbody>
```

```ts
const sales = defineTable(page.locator("#sales"));
await expect(sales.row({ "{{Empty}}": "North" }).cell("Q2")).toHaveText("200");
```

Rows and cells inside a cell, such as a nested table, are content of that cell, not part of the table. `rows`, `rowAt()`, `toHaveRowCount` and the column indexes skip them. To work with the nested table, define it as a table of its own.

## Cell conditions

A condition in `row()` or a matcher is one of:

| Condition                                                        | Matches when the cell text...               |
| ---------------------------------------------------------------- | ------------------------------------------- |
| `"John"`                                                         | equals the string                           |
| `/^jo/i`                                                         | matches the RegExp                          |
| `{ equals: "john", ignoreCase: true }`                           | equals the value (optionally ignoring case) |
| `{ contains: "oh", ignoreCase: true }`                           | contains the value                          |
| `{ startsWith: "Jo" }`                                           | starts with the value                       |
| `{ endsWith: "@example.com" }`                                   | ends with the value                         |
| `{ oneOf: ["Active", "Pending"] }`                               | equals one of the values                    |
| `{ empty: true }`                                                | is empty                                    |
| `{ predicate: text => Number(text) > 18 }`                       | makes the predicate return `true`           |
| `{ not: "Deleted" }`                                             | does not match the nested matcher           |
| `{ anyOf: ["Active", /^pend/i] }`                                | matches at least one nested matcher         |
| `{ allOf: [{ startsWith: "J" }, { not: { contains: "Doe" } }] }` | matches every nested matcher                |
| `{ gt: 18 }`, `{ gte: 18 }`, `{ lt: 65 }`, `{ lte: 65 }`         | holds a number that compares as asked       |
| `{ between: [10, 20] }`                                          | holds a number from 10 to 20 (inclusive)    |

`ignoreCase: true` works with `equals`, `contains`, `startsWith` and `endsWith`. Cell text is compared as described in [How text is read](#how-text-is-read): each line collapsed and trimmed, with one `\n` between lines.

```ts
await expect(users.row({ Name: { startsWith: "Jo" }, Status: { not: "Deleted" } }).cell("Email")).toHaveText(
	"john@example.com"
);
```

### Numbers

The numeric conditions read the one number in the cell, so `"€ 1,200.50"` is 1200.5, `"-3 %"` is -3 and `"1 234"` is 1234. Digits may be grouped in threes by `,`, `'` or a (non-breaking) space. A cell with no number, or with more than one (`"12:30"`, `"5 of 10"`, a date), never matches.

For tables with a decimal comma, add `decimal: ","`. Digits are then grouped by `.`, `'` or a space: `{ gt: 1000, decimal: "," }` matches `"€ 1.234,50"`.

```ts
await expect(orders.row({ Total: { gt: 1000 } }).cell("Customer")).toHaveText("John");
await expect(orders).toHaveRow({ Total: { between: [10, 20], decimal: "," }, Status: "Active" });
```

### Predicates

A `predicate` gets two arguments: the normalized `text` that the other conditions compare, and the `raw` text exactly as the browser reads it (`innerText`, or `textContent`), for example `{ predicate: (text, raw) => raw.includes(" ") }`.

`predicate` runs **in the browser**, like a `page.evaluate` function. It is serialized with `toString()`, so it cannot use variables from your test.

- A predicate that throws (for example on a variable from your test), returns a promise or cannot be compiled fails the row, also inside `not`, `anyOf` or `allOf`. A broken predicate never turns into a match.
- When a matcher fails, it reports the predicate's error.
- Bound and built-in functions (`fn.bind(...)`, `Boolean`) have no source to send, so `row()` rejects them right away.

`not`, `anyOf` and `allOf` take any matcher, including other combinators. `anyOf` and `allOf` need at least one matcher.

## Matchers

The exported `expect` includes table and row matchers. They retry until the `expect` timeout (or the `timeout` option) and support `.not`:

```ts
await expect(users).toHaveRow({ Name: "John", Status: /active/i });
await expect(users).not.toHaveRow({ Name: "Ghost" });
await expect(users).toHaveRowCount(3);
await expect(users).toHaveHeaders(["Name", "Email"]);
await expect(users).toHaveHeaders(["Name", "Status", "Email"], { exact: true });

// Exactly these rows, in order. Each row only checks the headers it mentions; {} matches any row.
await expect(users).toHaveRows([
	{ Name: "John", Status: "Active" },
	{ Name: "Jane", Status: /inactive/i },
	{ Name: "Joe" },
]);
await expect(users).toHaveRows([]); // the body is empty
// The same rows, in any order
await expect(users).toHaveRows([{ Name: "Joe" }, { Name: "John" }, { Name: "Jane" }], { anyOrder: true });

// These rows somewhere in the table, in any order; other rows are allowed
await expect(users).toContainRows([{ Name: "Joe", Status: "Active" }, { Name: "John" }]);

// Every body row matches, for example after filtering. A table without body rows fails.
await expect(users).toHaveEveryRow({ Status: "Active" });
await expect(orders).toHaveEveryRow({ Total: { gt: 0 } });

// One value per body row, in order (or with anyOrder). Values take any cell condition.
await expect(users).toHaveColumnValues("Status", ["Active", "Inactive", "Active"]);
await expect(orders).toHaveColumnValues("Total", [{ gt: 1000 }, /€ 80/, { lt: 20 }]);

// Every row, also on other pages or not rendered (see Pages and virtual scrolling)
await expect(grid).toHaveTotalRowCount(200);

// With a timeout
await expect(users).toHaveRow({ Name: "John" }, { timeout: 10_000 });
```

Row matchers take a row locator:

```ts
// The row locator must resolve to exactly one row, whose cells match every condition
await expect(users.row({ Name: "John" })).toHaveCells({ Status: "Active", Email: /@example\.com$/ });
await expect(users.rowAt(0)).not.toHaveCells({ Status: "Deleted" }); // the row exists, but doesn't match

await expect(users.row({ Name: "John" })).toBeSelected(); // aria-selected="true", or its selection checkbox is checked
await expect(files.row({ Name: "src" })).not.toBeExpanded(); // tree grids: aria-expanded
```

`toHaveRow`, `toHaveCells` and `toHaveEveryRow` need at least one condition: `{}` throws.

### What a failure shows

`toContainRows` and `toHaveRows` with `anyOrder` give each entry a different body row, and find the best fit, so overlapping entries such as `{ Status: "Active" }` and `{ Name: "John" }` both pass when John is active and another row is too. When they fail, the message shows the entries left without a row and the body rows, as a table of the columns the entries mention:

```
Expected: body rows matching, in any order (other rows allowed)
  [0] { "Name": "Joe" }
  [1] { "Name": "Ghost", "Status": "Active" }
Received: 3 body rows
No body row left for [1] { "Name": "Ghost", "Status": "Active" }
Body rows:
  # | Name | Status
  0 | John | Active
  1 | Jane | Inactive
  2 | Joe  | Active
```

The other matchers show what they found too:

- `toHaveEveryRow` lists the rows that don't match.
- `toHaveColumnValues` shows the column values and every row that doesn't match its value.
- `toHaveRows` shows the number of rows received and, for each row that doesn't match, the cells it actually has.
- `toHaveCells` shows the cells the row actually has.

**Unknown headers.** When a condition names an unknown header, the matcher fails with `Header "Stauts" not found.` and lists the available headers. A condition on an unknown header can never be checked, so it fails with `.not` too: `.not` first waits for the headers, then asserts that no row matches. A typo in a negated assertion never passes silently.

**`toBeExpanded`** fails on a row without `aria-expanded`, also with `.not`.

### Sorting

`toBeSortedBy` checks that the body rows are sorted by a column. It retries, so it waits for a sort that takes a server round trip. It checks the data itself, not the sort icon:

```ts
await users.header("Name").click();
await expect(users).toBeSortedBy("Name"); // ascending, as text
await expect(users).toBeSortedBy("Name", { order: "desc", ariaSort: true });
await expect(users).toBeSortedBy("Salary", { type: "number" }); // "€ 1,200" is 1200
await expect(users).toBeSortedBy("Salary", { type: "number", decimal: "," }); // "€ 1.200,50" is 1200.5
await expect(users).toBeSortedBy("Joined", { type: "date" });
await expect(users).toBeSortedBy("Priority", { compare: (a, b) => priorities.indexOf(a) - priorities.indexOf(b) });
await expect(users).toBeSortedBy(2); // by column index, also in a table without header rows
```

| Option     | Default  | Description                                                                                                                                                                                                                     |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order`    | `"asc"`  | `"asc"` or `"desc"`. Equal neighbours are fine in both.                                                                                                                                                                         |
| `type`     | `"text"` | `"text"` ignores case and accents, and compares digit runs as numbers (`"item 9"` before `"item 10"`). `"number"` reads the one number in the text, like the [numeric conditions](#numbers). `"date"` parses with `Date.parse`. |
| `decimal`  | `"."`    | The decimal separator for `type: "number"`: `"."` or `","`.                                                                                                                                                                     |
| `compare`  |          | A custom comparison like `Array.sort` takes. It runs in Node, so it can use variables from your test. Overrides `type`.                                                                                                         |
| `ariaSort` | `false`  | Also require `aria-sort="ascending"` or `"descending"` on the header cell.                                                                                                                                                      |
| `timeout`  |          | Defaults to the `expect` timeout.                                                                                                                                                                                               |

For other number formats, pass a `compare`. An empty body, an unknown column or a value that is not a number or date fails the assertion, also with `.not`, so a table that hasn't loaded yet doesn't count as sorted. The failure message lists the column values and the first pair that is out of order.

### Typed matcher arguments

With the exported `expect`, matcher arguments are typed by the table's headers, also after `.not` and with `expect.soft`. A misspelled header in `toHaveRow`, `toHaveRows`, `toContainRows`, `toHaveEveryRow`, `toHaveColumnValues`, `toBeSortedBy` or `toHaveCells` is a compile-time error:

```ts
const users = defineTable(page.locator("#users"), { headers: ["Name", "Status"] });
await expect(users).toHaveRow({ Name: "John" });
// @ts-expect-error "Stauts" is not a header of this table
await expect(users).toHaveRow({ Stauts: "Active" });
```

`toHaveHeaders` takes any string, so you can assert that a header the table doesn't declare is absent. Conditions are checked at runtime too, for JavaScript and for tables without `headers`.

### Bring your own matchers

The matchers are exported as `tableMatchers`, so you can combine them with your own:

```ts
import { TableLocator, tableMatchers } from "@cerios/playwright-table";
import { expect as base } from "@playwright/test";

// Spread them into your own extend
export const expect = base.extend({
	...tableMatchers,
	async toHaveEmailFor(table: TableLocator, name: string) {
		/* ... */
	},
});
```

```ts
import { expect as tableExpect } from "@cerios/playwright-table";
import { mergeExpects } from "@playwright/test";

// Or merge with another extended expect
export const expect = mergeExpects(tableExpect, myExpect);
```

An `expect` you extend or merge yourself has Playwright's own matcher types, so the table matcher arguments are checked at runtime only.

## Reading data

`toJson()` reads every body row as an object keyed by [header key](#header-keys). A cell spanning rows or columns is repeated in every position it covers, and cell text is read as in row conditions: line breaks stay as one `\n` (see [How text is read](#how-text-is-read)).

```ts
const data = await users.toJson();
// [{ Name: "John", Status: "Active", Address: "Street 1\nAmsterdam" }, ...]

const raw = await users.toJson({ raw: true });
// [{ Name: "John", Status: " Active", Address: "Street 1\nAmsterdam " }, ...]
```

`raw: true` returns every body cell exactly as the browser reads it (`innerText`, or `textContent`): tabs, non-breaking spaces, icon glyphs and the text of ignored elements stay. Header keys are normalized either way.

> To check a table, prefer the [matchers](#matchers): they retry until the rows match. `toJson()` is for reading data you need in the test.

By default `toJson()` is a snapshot: it doesn't wait for rows to load, and it throws if the table has no header row. Set `minRows` to wait first for a header row and at least that many body rows with content:

```ts
const data = await users.toJson({ minRows: 1 }); // waits up to 5s
const page1 = await users.toJson({ minRows: 25, timeout: 10_000 });
// On timeout: TableLocator.toJson() expected at least 25 body rows with content, found 3 (3 body rows in total).
```

A row has content when at least one of its cells has text, so empty skeleton rows don't count. A placeholder row with text, such as "Loading…", does count. For those tables, or tables that are still filling, assert on the content you expect first, then read:

```ts
await expect(users).toHaveRow({ Status: { oneOf: ["Active", "Inactive"] } });
const data = await users.toJson();
```

To read every row of a paginated or virtualized table, use `toJson({ allRows: true })` (see [Pages and virtual scrolling](#pages-and-virtual-scrolling)).

### Some columns and typed values

`columns` picks columns, in that order. `parse` turns the text of a column into a typed value: `"number"` (read like the [numeric conditions](#numbers), with `decimal` for a decimal comma), `"date"` (`Date.parse`), or your own function, which runs in Node. Empty cells become `null` for `"number"` and `"date"`. The result is typed from both options:

```ts
const totals = await orders.toJson({
	columns: ["Customer", "Total", "Placed"],
	parse: { Total: "number", Placed: "date" },
	decimal: ",",
});
// { Customer: string; Total: number | null; Placed: Date | null }[]
// [{ Customer: "John", Total: 1200.5, Placed: 2026-01-15T00:00:00.000Z }, ...]

const sum = totals.reduce((total, order) => total + (order.Total ?? 0), 0);
const statuses = new Set(await orders.columnValues("Status")); // distinct values
```

A key that is not a header fails with the available headers. A cell that `"number"` or `"date"` cannot parse, or a function that throws, fails with the row, the column and the text, such as `row 2 "Total" ("n/a") is not a number`.

### Waiting for a table to settle

After a search, filter, page change or sort, a table often refreshes in steps: a spinner, an empty body, then rows coming in. Reading it too early gives stale or partial data. `waitForStable()` waits until the header keys and every body cell text stay the same for `quiet` milliseconds (500 by default), and the `loading` indicator, if you pass one, is hidden:

```ts
await page.getByLabel("Search").fill("Jo");
await orders.waitForStable({ loading: page.getByRole("progressbar") });
const rows = await orders.toJson();

// Or in one go: waits for minRows first (if set), then for the table to settle
const settled = await orders.toJson({ stable: { loading: page.locator(".spinner") } });
const loaded = await orders.toJson({ minRows: 1, stable: true });
// On timeout: TableLocator.waitForStable() timed out after 5000ms: the table kept changing (12 changes seen).
```

| `waitForStable` option | Default              | Description                                   |
| ---------------------- | -------------------- | --------------------------------------------- |
| `quiet`                | 500                  | How long the table must stay the same, in ms. |
| `loading`              | the `loading` option | A loading indicator that must be hidden.      |
| `timeout`              | 5000                 | The time to wait, in ms.                      |

A table that hasn't started to refresh yet looks stable, so pass `loading` when the table shows a loading indicator, or assert on the content you expect first. Locators and matchers retry on their own and don't need `waitForStable()`.

## Row interactions

```ts
const john = users.row({ Name: "John" });

// Fills the controls in the cells: a boolean checks a checkbox or switch, a string selects an option or fills an input
await john.fill({ Email: "john@example.org", Role: "Admin", Active: false });

// A cell without a control is edited in place, as data grids do: double-click, fill the editor, press Enter
await grid.row({ Id: "2" }).fill({ Model: "New model" }); // `commit: "Tab"` or `false` to press another key or none

await john.select(); // checks the selection checkbox, or clicks the row; waits until selected
await expect(john).toBeSelected();
await john.deselect();
await john.isSelected(); // true or false

// Tree grids
await files.row({ Name: "src" }).expand();
await files.row({ Name: "src" }).collapse();
await files.row({ Name: "src" }).isExpanded(); // true, false, or null for a row that cannot expand
expect(await files.row({ Name: "index.ts" }).level()).toBe(2); // aria-level
```

- **`fill(values, { commit, timeout })`** goes through the columns in order. When the row is found by a column you fill, fill that column last: after it changes, the row no longer matches. Editors that open outside the cell (popups) are not found; fill those with Playwright locators.
- **`select()` and `deselect()`** check or uncheck the row's selection checkbox, or else click the row, and wait until `isSelected()` agrees. The selection checkbox is the one in a column without header text (such as one with only a "select all" checkbox), or the control of the `select` table option (`select: row => row.getByRole("checkbox", { name: "Select row" })`). A checkbox in a column with header text, such as "Active", is data and is never ticked to select the row. A row with `aria-selected` is selected when it is `"true"`; otherwise, when its selection checkbox is checked.
- **`expand()` and `collapse()`** read `aria-expanded` on the row, or else on the first element in it that has one and is not a menu button (`aria-haspopup`), and throw when there is none. To toggle, they click the `toggle` option (`{ toggle: row => row.locator(".twisty") }`; an error if it doesn't show up), or else that element with `aria-expanded`, or else (when the row itself has `aria-expanded`) the button in its first cell, or else focus the row and press `ArrowRight` or `ArrowLeft`. Other buttons in the row, such as Delete, are never clicked. Then they wait for `aria-expanded` to change.

Each action waits up to 5 seconds by default; pass `{ timeout }` to change it.

## Footer rows

Footer rows, such as a totals row, are not body rows: `rows`, `row()`, `toJson()` and the matchers leave them out. `footer` gives them typed cells:

```ts
await expect(orders.footer.cell("Total")).toHaveText("€ 1,295.75");
```

Footer rows are `tfoot>tr` by default (none with `aria: true`); set `footer.rowSelector` for others. Their cells are found with `row.columnSelector`.

## Data grids

### ARIA grids (AG Grid, MUI Data Grid)

Data grids are often built from `div`s with ARIA roles instead of `<table>` elements. Set `aria: true` to use roles for the default selectors (your own selectors still win):

```ts
const grid = defineTable(page.getByRole("grid"), { aria: true, headers: ["Id", "Name", "Status"] });
await expect(grid.row({ Name: "Jane" }).cell("Status")).toHaveText("Inactive");
```

| Part         | Default with `aria: true`                               |
| ------------ | ------------------------------------------------------- |
| Header rows  | `[role=row]` with a `[role=columnheader]` inside        |
| Header cells | `[role=columnheader]`                                   |
| Body rows    | the other `[role=row]`s                                 |
| Body cells   | `[role=gridcell]`, `[role=cell]` and `[role=rowheader]` |

These ARIA attributes are used whenever they are present, with or without `aria: true`:

- **`aria-colindex`** places a cell in its column, so columns stay aligned when the grid only renders the columns in view (column virtualization). A column that is not rendered has no cells, so its locators wait until you scroll it into view.
- **`aria-rowindex`** joins row elements with the same index into one row. Grids with pinned columns render each row as several elements (one per pinned area), and `row()`, `cell()` and `toJson()` see them as one row. A joined row's `locator` is its first element, so `row.locator.filter({ hasText })` only sees the text of that part; use `row()` conditions instead. When every row has an `aria-rowindex`, rows are ordered by it, because grids don't always keep the DOM in visual order.
- **`aria-colspan`** and **`aria-rowspan`** work like `colspan` and `rowspan`.

A row without header cells that shares its `aria-rowindex` with a header row (such as the header row of an empty pinned container) belongs to the header, not to the body.

Grids also virtualize rows: only the rows in view (plus a buffer) exist in the DOM. `toHaveRowCount`, `toHaveRows` and `toJson()` only see rendered rows. To reach the other rows, set the `scroll` option and use `findRow()`, `toJson({ allRows: true })` and `toHaveTotalRowCount` (see [Pages and virtual scrolling](#pages-and-virtual-scrolling)), and find rows by their content rather than by `rowAt()`.

### Grid presets

`presets` holds ready-made options for popular data grids: the selectors, the loading indicator, the scroll container and the pagination controls. Spread a preset into your options to add typed headers or change a setting:

```ts
import { defineTable, presets } from "@cerios/playwright-table";

const cars = defineTable(page.locator("#myGrid"), { ...presets.agGrid(), headers: ["Make", "Model", "Price"] });
const users = defineTable(page.getByRole("grid"), presets.muiDataGrid());
const orders = defineTable(
	page.locator("table[mat-table]"),
	presets.angularMaterial({ paginator: page.locator("mat-paginator") })
);
const people = defineTable(page.locator("table"), presets.tanstackVirtual({ container: page.locator(".scroller") }));
```

| Preset                            | Covers                                                                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agGrid()`                        | ARIA roles, header rows without the floating filter row, pinned bottom rows as footer rows, the body viewport, the paging panel ("First Page" and "Next Page"), the loading overlay, and hidden elements (`.ag-hidden`) left out of the text. Tested with AG Grid Community 36. |
| `muiDataGrid()`                   | ARIA roles, rows and cells without filler and skeleton cells, the virtual scroller, the "Go to next page" button, the loading indicator (MUI X v7/v8 markup).                                                                                                                   |
| `angularMaterial({ paginator? })` | `mat-table` rows and cells (MDC and legacy classes), footer rows, no "no data" row, and the sort header arrow left out of the text. With `paginator` (a `Locator` for the `mat-paginator`), its "First page" and "Next page" buttons.                                           |
| `tanstackVirtual({ container })`  | The scroll container (a `Locator`), and rows told apart by `data-index`. TanStack Table itself renders plain tables and needs no preset.                                                                                                                                        |

AG Grid also virtualizes columns: only the columns in view are rendered. Rows are read with every column the grid has rendered; to read the others, set `suppressColumnVirtualisation: true` in your test setup or make the grid wide enough.

### Pages and virtual scrolling

Tell the table how to reach its other rows, and `findRow()`, `toJson({ allRows: true })`, `totalRowCount()` and `toHaveTotalRowCount` go through them:

```ts
const orders = defineTable(page.locator("#orders"), {
	// Paginated: the next page control (and optionally the first page control, to always start on page 1)
	paginate: { next: page.getByRole("button", { name: "Next" }), first: page.getByRole("button", { name: "First" }) },
	// Virtualized: the element that scrolls (a function gets the table root)
	scroll: { container: root => root.locator(".viewport") },
	// Wait for this indicator to be hidden after every page change or scroll
	loading: root => root.getByRole("progressbar"),
});

const row = await orders.findRow({ Id: "1042" }); // searches every page and scroll position
await row.cell("Status").click(); // the table is left showing the row

const all = await orders.toJson({ allRows: true }); // every row of every page, in order
await expect(orders).toHaveTotalRowCount(312);
```

- **`findRow(where)`** checks the rows in view first. Then it starts on the first page (with `paginate.first`) and the top, scrolls each page down step by step, and goes to the next page until a row matches. It returns `row(where)`, which now resolves to the row. Without `paginate` and `scroll`, it waits until a row matches, like a locator. On failure it says how many pages it searched.
- **`toJson({ allRows: true })`** reads the rows at every position. Rows seen at several scroll positions are read once: they are told apart by `aria-rowindex`, `row-index`, `data-rowindex`, `data-index` or `data-id` (or `scroll.rowKey`), or else by their text and how often that text came before in the view, so identical rows are all kept. When every row has a position key (all of these but `data-id`), rows are ordered by it; otherwise they keep the order they were shown in.
- **`totalRowCount()`** and **`toHaveTotalRowCount(n)`** use `aria-rowcount` when the grid declares it (minus the header rows it also counts). Without it, they read every row like `toJson({ allRows: true })`, or count the body rows of a table without `paginate` and `scroll`.

`findRow()`, `totalRowCount()` and `toJson({ allRows: true })` take a `timeout` for the whole search, 30 seconds by default. They first wait until the table settles (and `loading` is hidden), so a table that is still loading isn't read as empty. `totalRowCount()` and `toJson({ allRows: true })` leave the table on its last page, scrolled down: without `paginate.first`, the next read starts there.

| `paginate` option | Description                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `next`            | The control that goes to the next page. Required.                                                                                     |
| `first`           | The control that goes to the first page. Navigation starts by clicking it, unless it is disabled.                                     |
| `isLastPage`      | `(next) => Promise<boolean>`. Defaults to: `next` is missing, hidden, `disabled`, `aria-disabled="true"` or in a `.disabled` element. |
| `maxPages`        | Read only the first pages: `3` reads at most 3. Defaults to every page.                                                               |

| `scroll` option | Description                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `container`     | The element that scrolls. Defaults to the table root.                                                                                                              |
| `step`          | Pixels per step. Defaults to 90% of the container height.                                                                                                          |
| `rowKey`        | The attribute that identifies a row, such as `"data-id"`.                                                                                                          |
| `settle`        | After each scroll (and two animation frames), how long the table must stay the same, in milliseconds. Defaults to 50. `0` skips it, but still waits for `loading`. |
| `maxSteps`      | Scroll at most this many steps per page. Defaults to scrolling to the bottom.                                                                                      |

After each page change, the table must change, have rows again and then settle; a `next` that doesn't change the table fails with a clear error. A `next` or `first` that matches twice (a pager above and below the table) uses the first one.

`maxPages` and `maxSteps` limit what is read on purpose: with `maxPages: 3`, `toJson({ allRows: true })` returns the rows of the first 3 pages and `findRow()` searches them, without an error. `totalRowCount()` counts them too, unless the grid declares `aria-rowcount`: that is the total of the whole grid.

The `timeout` stops a table that never ends, such as a `next` button that never gets disabled or a list that keeps growing. When it runs out before the end of the table (or the limits), the call fails and says how far it got, so you never get part of the rows as if they were all of them:

```
TableLocator.toJson({ allRows: true }) timed out after 30000ms before reading every row; 2500 rows were read,
on 100 pages. Pass a larger timeout.
```

Reading a large virtualized grid takes one step per screen of rows, so for big grids prefer filtering the grid down, or asserting `toHaveTotalRowCount`, over reading every row.

### Shadow DOM

Like Playwright locators, `TableLocator` looks inside open shadow roots. Web component tables work with the custom element as the root, also when the table sits in a shadow root inside another shadow root:

```ts
// <users-table id="users"> renders its <table> in an open shadow root
const users = defineTable(page.locator("#users"), { headers: ["Name", "Status"] });
await expect(users.row({ Name: "Jane" }).cell("Status")).toHaveText("Active");
```

- Rows and cells are found in the root's own shadow root and in every open shadow root inside it. A host's shadow content comes before its light DOM children.
- Like Playwright CSS, a selector matches within one shadow tree: `thead>tr` does not match a `tr` whose `thead` is in another tree.
- A table in the shadow root of a cell is content of that cell, just like a nested table.
- Closed shadow roots can't be reached.
- Cell text is read with `innerText` (or `textContent`), so text inside the shadow root of an element _in_ a cell depends on the browser.
- With `aria: true`, the `:has()` in the default row selectors does not look into a row's own shadow root. Set `header.rowSelector` and `row.rowSelector` for grids whose rows render their cells in a shadow root.

## Reference

### How text is read

`TableLocator` reads headers and cells the way a person reads them on screen, so what you see in the browser is what you write in your test.

**Header text is always one line.** Line breaks (`<br>`, block elements, newlines in the HTML), tabs and non-breaking spaces become one space.

**Body cells keep their line breaks**, as one `\n` between trimmed lines. Empty lines are dropped.

| In the page                                                         | Header key             | Body cell text          |
| ------------------------------------------------------------------- | ---------------------- | ----------------------- |
| `First<br>name`, `<div>First</div><div>name</div>`                  | `"First name"`         | `"First\nname"`         |
| `Street 1<br><br>&nbsp; Amsterdam`                                  | `"Street 1 Amsterdam"` | `"Street 1\nAmsterdam"` |
| `John⏎        Doe` (indentation in the HTML)                        | `"John Doe"`           | `"John Doe"`            |
| `Verzekerings&shy;nummer`, zero-width spaces, bidi marks            | `"Verzekeringsnummer"` | `"Verzekeringsnummer"`  |
| `Name <span class="material-icons">arrow_upward</span>`, `&#xE5CF;` | `"Name"`               | `"Name"`                |
| `Name<span class="sr-only">, sortable</span>`                       | `"Name"`               | `"Name"`                |
| `Name` in a cell with `text-transform: uppercase`                   | `"NAME"`               | `"NAME"`                |
| `Cafe&#x301;` (decomposed accent)                                   | `"Café"`               | `"Café"`                |
| `<select>` with `High` selected                                     | —                      | `"High"`                |

In short:

- **Invisible characters are removed**: soft hyphens, zero-width spaces, word joiners, byte order marks and bidi marks. Zero-width joiners stay, so emoji like 👨‍👩‍👧 are kept whole.
- **Icon glyphs are removed**: Unicode private use characters, where icon fonts such as Font Awesome put their icons. Real symbols such as `€`, `°C` and `✓` stay. A header that is only an icon becomes `{{Empty}}`.
- **Ignored elements are left out**: the text of every element inside a cell that matches one of the `ignore` selectors (see below).
- **Hidden elements are left out**: `display: none` and `visibility: hidden`, as `innerText` does. CSS `text-transform` is kept.
- **Accents are composed** (Unicode NFC), so `é` matches however the page encodes it.

With `cellContentType: CellContentType.TextContent`, all text in the DOM is read, hidden elements included, and `text-transform` is ignored. The other rules, `ignore` included, still apply.

The header names you pass are normalized the same way, so `"First\nname"`, `"First  name"` and `"First name"` all find the header `First name`. That goes for `row()`, `cell()`, `column()`, `header()`, `validateHeaders()` and the matchers.

Values in conditions are normalized like body cells, so `"Street 1\r\nAmsterdam"` matches a cell that shows two lines. A string condition must include the line break. To match one line of a cell, use `contains` or a RegExp:

```ts
await expect(users.row({ Address: "Street 1\nAmsterdam" }).cell("Name")).toHaveText("John");
await expect(users.row({ Address: { contains: "Amsterdam" } }).cell("Name")).toHaveText("John");
await expect(users.row({ Address: /^Amsterdam$/m }).cell("Name")).toHaveText("John");
```

For the text exactly as the browser reads it, use `toJson({ raw: true })`, the second argument of a [`predicate`](#predicates), or the cell locator itself (`await row.cell("Address").innerText()`).

#### Ignored elements

Some text in a cell isn't meant to be read: screen reader only text such as `, sorted ascending`, or icon fonts that draw a word such as `arrow_upward` as an icon. The browser has no way to tell these apart from other text, so `TableLocator` leaves out the elements that match a list of CSS selectors. By default, that list is `DEFAULT_IGNORE`:

| Selector                                                                                                                    | What it covers                                      |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `.sr-only`, `.visually-hidden`                                                                                              | Screen reader only text (Tailwind, Bootstrap)       |
| `.material-icons`, `.material-icons-outlined`, `.material-icons-round`, `.material-icons-sharp`, `.material-icons-two-tone` | Material Icons ligatures                            |
| `.material-symbols-outlined`, `.material-symbols-rounded`, `.material-symbols-sharp`                                        | Material Symbols ligatures                          |
| `[aria-hidden=true]`                                                                                                        | Decorative content hidden from assistive technology |

Set `ignore` to change the list. It replaces the defaults, so spread them to add your own:

```ts
import { DEFAULT_IGNORE, defineTable } from "@cerios/playwright-table";

const users = defineTable(page.locator("#users"), { ignore: [...DEFAULT_IGNORE, ".sort-icon", ".badge-count"] });
const everything = defineTable(page.locator("#users"), { ignore: [] }); // read all text
```

The selectors apply to elements inside header and body cells, not to the cells themselves. Raw values (`toJson({ raw: true })` and a predicate's `raw` argument) are never filtered.

### Header keys

Header keys are the names you use for columns, with the header text read as described in [How text is read](#how-text-is-read):

- Colspan continuations get `__C<n>`. For example, a `Name` header spanning two columns gives the keys `Name` and `Name__C1`.
- Duplicate names get `__D<n>`: the second `Name` becomes `Name__D1`, the third `Name__D2`.
- Empty headers become `{{Empty}}`.
- Headers carried down by `rowspan` keep their text.
- The main header row is the last header row, unless `header.setMainHeaderRow` is set.

Header arguments accept ``H | `${H}__C${number}` | `${H}__D${number}` ``, so `users.row({ Name__C1: "Doe" })` type-checks.

If a header is unknown, the locator matches nothing and keeps waiting until the assertion times out. Locators read like the code that built them in error messages and traces (Playwright 1.53 and later):

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('#users').row({ "Name": "Jhon" }).cell("Status")
```

For a clear failure up front that names the unknown header and lists the available ones, use `validateHeaders()` or the [matchers](#matchers).

### Header validation

```ts
const users = defineTable(page.locator("#users"), { headers: ["Name", "Status", "Email"] });

await users.validateHeaders(); // waits up to 5s, then throws:
// Missing headers: [Status]
// Available headers: [Name, State, Email]

await users.validateHeaders(["Name"], { timeout: 10_000 });
const keys = await users.headerKeys(); // ["Name", "State", "Email"]
```

### Timeouts

Locators follow Playwright's own timeouts. The rest have these defaults, and every one takes a `timeout` option:

| Call                                                                                | Default timeout                                           |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Matchers (`expect(table)...`, `expect(row)...`)                                     | the `expect` timeout                                      |
| `validateHeaders()`, `waitForStable()`, `toJson({ minRows })`, `toJson({ stable })` | 5 seconds (for `toJson`, for the whole read)              |
| `row.fill()` (per action), `select()`, `deselect()`, `expand()`, `collapse()`       | 5 seconds                                                 |
| `findRow()`, `totalRowCount()`, `toJson({ allRows: true })`                         | 30 seconds for the whole search                           |
| `toJson()`, `headerKeys()`, `columnValues()`, `format()`                            | Playwright's action timeout, for the table to be attached |

## Debugging failures

When a table matcher fails inside a test, the body rows are attached to the test report as a Markdown table (once per test and table, at most 1000 rows), so the HTML report and trace viewer show what the table contained. `toHaveCells` attaches the table of its row too; `toBeSelected` and `toBeExpanded` don't attach one.

To print a table yourself:

```ts
console.log(await users.format({ columns: ["Name", "Status"] }));
//   # | Name | Status
//   0 | John | Active
//   1 | Jane | Inactive
```

`format()` shows the rows in view, at most `maxRows` (50 by default). Cells longer than 30 characters are cut off, and line breaks show as `↵`. Unknown `columns` are skipped.

## Common pitfalls

| Pitfall                                                                           | Fix                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hard-coded row or column numbers break when columns move or rows reorder.         | Find rows by content with `row({...})` and cells by header name. Use `rowAt()` only when the position is what you test.                                                                                                            |
| Reading the table, then asserting on the snapshot, is flaky.                      | Assert with retrying matchers (`toHaveRow`, `toHaveRows`, `toHaveCells`, `toBeSortedBy`, `expect(cell).toHaveText()`). Use `toJson()` only after one of them has passed.                                                           |
| Skeleton or "Loading…" rows make a table look loaded.                             | Assert on content you expect (`toHaveRow`), or use `toJson({ minRows })`. `toBeSortedBy` fails on an empty body.                                                                                                                   |
| Reading the table right after a search or filter returns stale or partial rows.   | `await table.waitForStable({ loading })` first, or `toJson({ stable: { loading } })` (see [Waiting for a table to settle](#waiting-for-a-table-to-settle)).                                                                        |
| A filter test only checks the first row, or passes when nothing is left.          | `toHaveEveryRow({ Status: "Active" })` checks every row, and fails on an empty body.                                                                                                                                               |
| Numbers with a decimal comma (`1.234,56`) don't compare.                          | Add `decimal: ","` to numeric conditions, `toJson({ parse })` and `toBeSortedBy`.                                                                                                                                                  |
| A sort test only checks the arrow icon or `aria-sort`.                            | `toBeSortedBy` checks the data; add `ariaSort: true` to check the header too.                                                                                                                                                      |
| Numbers or dates sort as text (`"10"` before `"9"`, `"€ 950"` after `"€ 1,200"`). | Pass `type: "number"` or `type: "date"` to `toBeSortedBy`, or a `compare` for other formats.                                                                                                                                       |
| A row header (`<th scope="row">`) or a nested table shifts the columns.           | `TableLocator` handles both by default (see [Row headers and nested tables](#row-headers-and-nested-tables)).                                                                                                                      |
| Data grids only render the rows and columns in view.                              | Use a [preset](#grid-presets) or the `scroll` option, then `findRow()`, `toJson({ allRows: true })` and `toHaveTotalRowCount` instead of counting rendered rows (see [Pages and virtual scrolling](#pages-and-virtual-scrolling)). |
| A row is on another page.                                                         | Set `paginate` and use `findRow()`; it goes through the pages until a row matches.                                                                                                                                                 |
| `expect(cell).toHaveText()` fails on a cell with an icon or screen reader text.   | `toHaveText` uses Playwright's own text rules. Compare as the table reads text with `toHaveCells`, `toHaveRow` or a `row()` condition (see [How text is read](#how-text-is-read)).                                                 |
| `row()` throws a strict mode violation.                                           | Several rows match. Add a condition, or pick one with `first()`, `last()` or `nth()`.                                                                                                                                              |

## `TableLocator` or `PlaywrightTable`?

| Use                   | When                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`TableLocator`**    | New tests. Assertions and interactions on rows, cells and the whole table, with auto-waiting, retries, reorder-safe locators and typed headers.                                    |
| **`PlaywrightTable`** | Existing tests that use it, header parsing you configure yourself (`HeaderRowOptions`), and all header rows at once (`getHeaderRows()`). See [its docs](docs/playwright-table.md). |

`PlaywrightTable` is in maintenance mode: it gets fixes, and new features land in `TableLocator`. Both can be used on the same table, but on some tables `toJson()` and `getJson()` give different results (see [the differences](docs/playwright-table.md#playwrighttable-and-tablelocator-differences)).

## TypeScript

The package is written in TypeScript and ships its types. The main exports:

```ts
import {
	// Tables
	defineTable,
	TableLocator,
	TableRow,
	presets,
	DEFAULT_IGNORE,
	CellContentType,
	// Test, expect and the selector engine
	test,
	expect,
	tableMatchers,
	registerTableSelectors,
	// Types
	type TableLocatorOptions,
	type TablePreset,
	type HeaderKey,
	type ColumnKey,
	type RowWhere,
	type CellMatcher,
	type CellCondition,
	type NumberCondition,
	type PaginateOptions,
	type ScrollOptions,
	type StableOptions,
	type TableJsonOptions,
	type TableMatcherOptions,
	type TableRowsOptions,
	type TableSortOptions,
	type TableExpect,
} from "@cerios/playwright-table";
```

For the `PlaywrightTable` exports, see [its docs](docs/playwright-table.md#typescript).

## Browser support

`TableLocator` is tested on Chromium, Firefox and WebKit, also on pages whose CSP forbids `eval`.

## Contributing

Contributions are welcome! Please check out the [GitHub repository](https://github.com/CeriosTesting/playwright-tables).

Run `npm run build` before `npm test`: the `dist-cjs` and `dist-esm` test projects import the built bundles to verify that the selector engine survives bundling.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://github.com/CeriosTesting/playwright-tables)
- 🐛 [Report Issues](https://github.com/CeriosTesting/playwright-tables/issues)
- 💬 [Discussions](https://github.com/CeriosTesting/playwright-tables/discussions)

---

**Made with ❤️ by Cerios**
