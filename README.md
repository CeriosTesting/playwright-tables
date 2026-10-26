# 🎭 Playwright Tables | By Cerios

[![npm version](https://img.shields.io/npm/v/@cerios/playwright-table.svg?style=flat-square)](https://www.npmjs.com/package/@cerios/playwright-table)
[![npm downloads](https://img.shields.io/npm/dm/@cerios/playwright-table.svg?style=flat-square)](https://www.npmjs.com/package/@cerios/playwright-table)
[![license](https://img.shields.io/npm/l/@cerios/playwright-table.svg?style=flat-square)](https://github.com/CeriosTesting/playwright-tables/blob/main/LICENSE)
[![Playwright](https://img.shields.io/badge/playwright-%3E%3D1.40.0-45ba4b.svg?style=flat-square&logo=playwright)](https://playwright.dev)

## Introduction

Testing HTML tables can be challenging due to their complex structures with colspan, rowspan, dynamic content, and nested elements. This package simplifies the process by providing a comprehensive API to parse, validate, and interact with HTML tables in your Playwright tests.

**Key Features:**

- ✅ Full support for **colspan** and **rowspan** attributes
- ✅ Handles **multiple header rows** with flexible main header selection
- ✅ **Dynamic content loading** with polling and stability checks
- ✅ **Parallel data fetching** for optimal performance
- ✅ Robust **error handling** with detailed context
- ✅ Support for both **InnerText** and **TextContent** extraction
- ✅ Works with standard `<table>` elements and custom div-based tables
- ✅ Comprehensive **waiting utilities** for dynamic tables
- ✅ **Type-safe, auto-waiting locators** with `TableLocator` (see [Pure locators](#pure-locators-auto-waiting))

---

## Installation

First, ensure you have Playwright installed:
[Playwright Documentation](https://github.com/microsoft/playwright/blob/main/README.md)

Then, install this package:

```bash
npm i @cerios/playwright-table
```

Or as a dev dependency:

```bash
npm i -D @cerios/playwright-table
```

> ⚠️ **Upgrading from v1.x?** See the [Migration Guide](./MIGRATIONv2.md) for breaking changes and upgrade instructions.

---

## Quick Start

### Basic Usage

```ts
import { PlaywrightTable } from "@cerios/playwright-table";

// Create a table instance
const table = new PlaywrightTable(page.locator("table"));

// Get table data as JSON
const data = await table.getJson();
console.log(data);
// Output: [{"Name": "John", "Age": "30"}, {"Name": "Jane", "Age": "25"}]

// Get specific cell locator
const cell = table.getBodyCellLocator(0, 1); // Row 0, Column 1
await expect(cell).toHaveText("30");

// Wait for dynamic content
await table.waitForExactRowCount(5, { timeout: 10000 });
```

### Default Selectors

By default, the following CSS selectors are used:

- **Header rows:** `thead > tr`
- **Header cells:** `th`
- **Body rows:** `tbody > tr`
- **Body cells:** `td`

You can customize these selectors in the constructor (see [Advanced Options](#advanced-options)).

---

## Pure locators (auto-waiting)

`TableLocator` is a type-safe table API that only returns Playwright `Locator`s. You define a table once, then get rows and cells by header name. Locators are built synchronously and resolved in the browser by a custom selector engine (`pw-table-v1`) on every retry, so you get:

- **Auto-waiting and retrying `expect`s**: late headers and rows are no problem, and you don't need any polling helpers.
- **Reorder-safe locators**: header names are resolved to columns on every evaluation, so a locator stays correct when columns move.
- **Compile-time checked headers**: unknown headers, empty conditions and wrong matcher types are type errors, and header names autocomplete.

### Setup

Import `test` and `expect` from this package instead of `@playwright/test`. The `test` registers the selector engine with a worker-scoped auto fixture.

```ts
import { test, expect, defineTable } from "@cerios/playwright-table";

test("john is active", async ({ page }) => {
	await page.goto("/users");
	const users = defineTable(page.locator("#users"), { headers: ["Name", "Status", "Email"] });

	await expect(users.row({ Name: "John" }).cell("Status")).toHaveText("Active");
	await expect(users.row({ Name: "John", Status: /active/i }).cell("Email")).toHaveText("john@example.com");
});
```

If you have your own fixtures, call `registerTableSelectors()` instead. It must run **before the page is created**, and it is safe to call more than once:

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

### API

```ts
const users = defineTable(page.locator("#users"), { headers: ["Name", "Status", "Email"] });
// or: new TableLocator(page.locator("#users"), { headers: ["Name", "Status", "Email"] })

users.row({ Name: "John" }); // TableRow: body rows where every condition matches
users.rowAt(0); // TableRow: the n-th body row (0-based)
users.rows; // TableRow: all body rows
users.cell(anyRowLocator, "Email"); // Locator: the cell under a header for any row locator
users.column("Status"); // Locator: every body cell under a header
users.header("Name"); // Locator: the header cell
await users.toJson(); // Snapshot: every body row as an object keyed by header

const row = users.row({ Name: "John" });
row.locator; // Locator for the row element(s)
row.cell("Email"); // Locator for the cell
row.filter({ hasText: "x" }); // TableRow narrowed with Locator.filter()
row.first(); // TableRow: the first of these rows (also last() and nth(i))
```

Without `headers`, any string is accepted as a header. The other options are the same as for `PlaywrightTable`: `header.rowSelector`, `header.columnSelector`, `header.setMainHeaderRow`, `row.rowSelector` and `row.columnSelector`. Only the defaults differ: `TableLocator` takes both `th` and `td` in header and body rows (see [Row headers and nested tables](#row-headers-and-nested-tables)), and in a table without a `<thead>`, the leading rows of `<th>` cells (without `<td>`) in the first `<tbody>` are header rows, not body rows. To turn that off, set `header.rowSelector` to `"thead>tr"` and `row.rowSelector` to `"tbody>tr"`. `cellContentType` sets how text is read for both header and body cells (`InnerText` by default, see [How text is read](#how-text-is-read)). `aria: true` switches the defaults to ARIA roles (see [ARIA grids](#aria-grids-ag-grid-mui-data-grid)).

`row()` follows Playwright's strict mode: acting on it throws when several rows match. Use `first()`, `last()`, `nth(i)`, `rows.filter(...)`, `rowAt(n)` or `table.cell(anyRowLocator, header)` to compose. All of them keep typed cell access.

```ts
await users.row({ Status: "Active" }).first().cell("Edit").click();
await expect(users.rows.filter({ hasText: "Jane" }).cell("Status")).toHaveText("Active");
await expect(users.rows.last().cell("Name")).toHaveText("Joe");
await expect(users.column("Status")).toHaveText(["Active", "Inactive", "Active"]);
```

### Column indexes and tables without headers

`cell()`, `column()` and `header()` also take a 0-based column index. Indexes follow the visual grid, so a cell spanning columns or rows covers every index it spans, just like header keys do.

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

Grids also virtualize rows: only the rows in view (plus a buffer) exist in the DOM. `toHaveRowCount`, `toHaveRows` and `toJson()` only see rendered rows, so scroll a row into view (or filter the grid) before asserting on it, and find rows by their content rather than by `rowAt()`.

A row without header cells that shares its `aria-rowindex` with a header row (such as the header row of an empty pinned container) belongs to the header, not to the body.

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
- Cell text is read with `innerText` (or `textContent`), so text inside the shadow root of an element _in_ a cell depends on the browser, as with `PlaywrightTable`.
- With `aria: true`, the `:has()` in the default row selectors does not look into a row's own shadow root. Set `header.rowSelector` and `row.rowSelector` for grids whose rows render their cells in a shadow root.

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

The header names you pass are normalized the same way, so `"First\nname"`, `"First  name"` and `"First\u00a0name"` all find the header `First name`. That goes for `row()`, `cell()`, `column()`, `header()`, `validateHeaders()` and the matchers.

Values in conditions are normalized like body cells, so `"Street 1\r\nAmsterdam"` matches a cell that shows two lines. A string condition must include the line break. To match one line of a cell, use `contains` or a RegExp:

```ts
await expect(users.row({ Address: "Street 1\nAmsterdam" }).cell("Name")).toHaveText("John");
await expect(users.row({ Address: { contains: "Amsterdam" } }).cell("Name")).toHaveText("John");
await expect(users.row({ Address: /^Amsterdam$/m }).cell("Name")).toHaveText("John");
```

For the text exactly as the browser reads it, use `toJson({ raw: true })`, the second argument of a [`predicate`](#cell-conditions), or the cell locator itself (`await row.cell("Address").innerText()`).

### Header keys

Header keys are the same keys that `getJson()` produces, with the header text read as described in [How text is read](#how-text-is-read):

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

For a clear failure up front that names the unknown header and lists the available ones, use `validateHeaders()` or the matchers below.

### Cell conditions

Cell text is compared as described in [How text is read](#how-text-is-read): each line collapsed and trimmed, with one `\n` between lines. A condition is one of:

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

A `predicate` gets two arguments: the normalized `text` that the other conditions compare, and the `raw` text exactly as the browser reads it (`innerText`, or `textContent`), for example `{ predicate: (text, raw) => raw.includes("\u00a0") }`.

`predicate` runs **in the browser**, like a `page.evaluate` function. It is serialized with `toString()`, so it cannot use variables from your test. A predicate that throws (for example on a variable from your test), returns a promise or cannot be compiled fails the row, also inside `not`, `anyOf` or `allOf`, so a broken predicate never turns into a match. When `toHaveRow`, `toHaveCells` or `toHaveRows` fail, they report the predicate's error. Bound and built-in functions (`fn.bind(...)`, `Boolean`) have no source to send, so `row()` rejects them right away.

`not`, `anyOf` and `allOf` take any matcher, including other combinators. `anyOf` and `allOf` need at least one matcher.

The selector engine runs in an isolated world, so locators, matchers and predicates also work on pages whose CSP forbids `eval`. This is tested on Chromium, Firefox and WebKit.

### Header validation

```ts
const users = defineTable(page.locator("#users"), { headers: ["Name", "Status", "Email"] });

await users.validateHeaders(); // waits up to 5s, then throws:
// Missing headers: [Status]
// Available headers: [Name, State, Email]

await users.validateHeaders(["Name"], { timeout: 10_000 });
const keys = await users.headerKeys(); // ["Name", "State", "Email"]
```

### Reading the whole table

`toJson()` reads every body row as an object keyed by header key, like `PlaywrightTable.getJson()`. A cell spanning rows or columns is repeated in every position it covers, and cell text is read as in row conditions: line breaks stay as one `\n` (see [How text is read](#how-text-is-read)).

```ts
const data = await users.toJson();
// [{ Name: "John", Status: "Active", Address: "Street 1\nAmsterdam" }, ...]

const raw = await users.toJson({ raw: true });
// [{ Name: "John", Status: "\uE5CA Active", Address: "Street 1\nAmsterdam " }, ...]
```

`raw: true` returns every body cell exactly as the browser reads it (`innerText`, or `textContent`): tabs, non-breaking spaces, icon glyphs and the text of ignored elements stay. Header keys are normalized either way.

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

To check the whole table, prefer `toHaveRows` (below), which retries until the rows match.

### Matchers

The exported `expect` includes table matchers and a row matcher. They retry until the `expect` timeout and support `.not`:

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

// Row matcher: the row locator must resolve to exactly one row, whose cells match every condition
await expect(users.row({ Name: "John" })).toHaveCells({ Status: "Active", Email: /@example\.com$/ });
await expect(users.rowAt(0)).not.toHaveCells({ Status: "Deleted" }); // the row exists, but doesn't match
```

#### Sorting

`toBeSortedBy` checks that the body rows are sorted by a column. It retries, so it waits for a sort that takes a server round trip. It checks the data itself, not the sort icon:

```ts
await users.header("Name").click();
await expect(users).toBeSortedBy("Name"); // ascending, as text
await expect(users).toBeSortedBy("Name", { order: "desc", ariaSort: true });
await expect(users).toBeSortedBy("Salary", { type: "number" }); // "€ 1,200" is 1200
await expect(users).toBeSortedBy("Joined", { type: "date" });
await expect(users).toBeSortedBy("Priority", { compare: (a, b) => priorities.indexOf(a) - priorities.indexOf(b) });
await expect(users).toBeSortedBy(2); // by column index, also in a table without header rows
```

| Option     | Default  | Description                                                                                                                                                                                  |
| ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order`    | `"asc"`  | `"asc"` or `"desc"`. Equal neighbours are fine in both.                                                                                                                                      |
| `type`     | `"text"` | `"text"` compares case-insensitively, with digit runs as numbers (`"item 9"` before `"item 10"`). `"number"` takes the digits, `.` and `-` from the text. `"date"` parses with `Date.parse`. |
| `compare`  |          | A custom comparison like `Array.sort` takes. It runs in Node, so it can use variables from your test. Overrides `type`.                                                                      |
| `ariaSort` | `false`  | Also require `aria-sort="ascending"` or `"descending"` on the header cell.                                                                                                                   |
| `timeout`  |          | Defaults to the `expect` timeout.                                                                                                                                                            |

`type: "number"` only knows `.` as decimal separator. For numbers like `1.234,56`, pass a `compare`. An empty body, an unknown column or a value that is not a number or date fails the assertion, also with `.not`, so a table that hasn't loaded yet doesn't count as sorted. The failure message lists the column values and the first pair that is out of order.

When `toHaveRow`, `toHaveRows` or `toHaveCells` fails because of an unknown header, the message says `Header "Stauts" not found.` and lists the available headers. A condition on an unknown header can never be checked, so it fails with `.not` too: `.not` first waits for the headers, then asserts that no row matches. A typo in a negated assertion never passes silently. When `toHaveCells` fails on a known header, the message shows the cells the row actually has. When `toHaveRows` fails, the message shows the number of rows received and, for each row that doesn't match, the cells it actually has.

Playwright's `expect.extend` cannot carry the table's header types into matcher arguments, so matcher conditions are checked at runtime. For compile-time checks, assert on `table.row({...}).locator` instead.

#### Bring your own matchers

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

### `TableLocator` or `PlaywrightTable`?

| Use                   | When                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **`TableLocator`**    | Assertions and interactions on rows, cells and the whole table. You get auto-waiting, retries, reorder-safe locators and typed headers. |
| **`PlaywrightTable`** | Header parsing you configure yourself (`HeaderRowOptions`), all header rows (`getHeaderRows()`), and the polling `waitFor*` helpers.    |

Both can be used on the same table.

> **Note:** `PlaywrightTable` carries a `rowspan` header down only one header row. `TableLocator` uses a full grid, so a header spanning three or more header rows is carried all the way down. This only matters for headers that span three or more header rows.
>
> `TableLocator` also reads `th` cells in body rows and `td` cells in header rows, skips nested tables, and uses `aria-colindex`/`aria-rowindex`. On tables with any of these, `toJson()` and `getJson()` differ.

### Common pitfalls

| Pitfall                                                                           | Fix                                                                                                                                                                                |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hard-coded row or column numbers break when columns move or rows reorder.         | Find rows by content with `row({...})` and cells by header name. Use `rowAt()` only when the position is what you test.                                                            |
| Reading the table, then asserting on the snapshot, is flaky.                      | Assert with retrying matchers (`toHaveRow`, `toHaveRows`, `toHaveCells`, `toBeSortedBy`, `expect(cell).toHaveText()`). Use `toJson()` only after one of them has passed.           |
| Skeleton or "Loading…" rows make a table look loaded.                             | Assert on content you expect (`toHaveRow`), or use `toJson({ minRows })`. `toBeSortedBy` fails on an empty body.                                                                   |
| A sort test only checks the arrow icon or `aria-sort`.                            | `toBeSortedBy` checks the data; add `ariaSort: true` to check the header too.                                                                                                      |
| Numbers or dates sort as text (`"10"` before `"9"`, `"€ 950"` after `"€ 1,200"`). | Pass `type: "number"` or `type: "date"` to `toBeSortedBy`, or a `compare` for other formats.                                                                                       |
| A row header (`<th scope="row">`) or a nested table shifts the columns.           | `TableLocator` handles both by default (see [Row headers and nested tables](#row-headers-and-nested-tables)).                                                                      |
| Data grids only render the rows and columns in view.                              | Use `aria: true`, scroll the row or column into view before asserting, and don't count rendered rows to get the total (see [ARIA grids](#aria-grids-ag-grid-mui-data-grid)).       |
| `expect(cell).toHaveText()` fails on a cell with an icon or screen reader text.   | `toHaveText` uses Playwright's own text rules. Compare as the table reads text with `toHaveCells`, `toHaveRow` or a `row()` condition (see [How text is read](#how-text-is-read)). |
| `row()` throws a strict mode violation.                                           | Several rows match. Add a condition, or pick one with `first()`, `last()` or `nth()`.                                                                                              |

---

## Core Methods

### 1. `getHeaderRows(options?)`

Retrieves all header rows with support for colspan and rowspan. Colspan cells get a suffix (`__C1`, `__C2`, etc.).

**Parameters:**

- `options?: HeaderRowOptions` - Configure header parsing behavior

**Returns:** `Promise<HeaderRow[]>` - Array of header rows

**Example:**

HTML with complex headers

<table>
  <thead>
    <tr>
      <th rowspan="2">Name</th>
      <th colspan="2">Details</th>
    </tr>
    <tr>
      <th>Age</th>
      <th>City</th>
    </tr>
  </thead>
</table>

```ts
// HTML with complex headers
<table>
  <thead>
    <tr>
      <th rowspan="2">Name</th>
      <th colspan="2">Details</th>
    </tr>
    <tr>
      <th>Age</th>
      <th>City</th>
    </tr>
  </thead>
</table>

const headers = await table.getHeaderRows({
  colspan: { enabled: true, suffix: true }
});
console.log(headers);
// Output: [
//   ["Name", "Details", "Details__C1"],
//   ["Name", "Age", "City"]
// ]
```

**Options:**

```ts
{
  cellContentType?: CellContentType.InnerText | CellContentType.TextContent, // Default: InnerText
  emptyCellReplacement?: boolean,  // Replace empty cells with "{{Empty}}" (default: false)
  duplicateSuffix?: boolean,        // Add suffix to duplicate headers (default: false)
	normalizeWhitespace?: boolean,    // Collapse internal whitespace/newlines (default: false)
	stripIconGlyphs?: boolean,        // Remove icon-font private-use glyphs from headers (default: false)
  colspan?: {
    enabled?: boolean,              // Enable colspan parsing (default: false)
    suffix?: boolean                // Add suffix to colspan cells (default: false)
  }
}
```

---

### 2. `getMainHeaderRow(options?)`

Retrieves the main header row. By default, uses the **last header row**. Customizable via constructor.

**Parameters:**

- `options?: HeaderRowOptions` - Configure header parsing

**Returns:** `Promise<HeaderRow>` - The main header row

**Throws:**

- Error if no header rows are available
- Error if `setMainHeaderRow` index is out of bounds

**Example:**

```ts
// Use first row as main header
const table = new PlaywrightTable(page.locator("table"), {
	header: { setMainHeaderRow: 0 },
});

const mainHeader = await table.getMainHeaderRow();
console.log(mainHeader);
// Output: ["Name", "Age", "City"]
```

---

### 3. `getBodyRows(options?)`

Retrieves all body rows with support for rowspan and colspan.

**Parameters:**

- `options?: TableOptions` - Full table options (`bodyRowOptions`, `headerRowOptions`) and legacy `cellContentType` shortcut

**Returns:** `Promise<BodyRow[]>` - Array of body rows

**Throws:** Error if no body rows found

**Example:**

```ts
// Legacy shortcut
const rows = await table.getBodyRows({
	cellContentType: CellContentType.TextContent, // Include hidden elements
});

// Full table options (useful for custom grids with noisy headers)
const rowsWithOptions = await table.getBodyRows({
	bodyRowOptions: { cellContentType: CellContentType.InnerText },
	headerRowOptions: {
		normalizeWhitespace: true,
		stripIconGlyphs: true,
	},
});

console.log(rows);
// Output: [["John", "30", "NYC"], ["Jane", "25", "LA"]]
```

**Cell Content Types:**

- `CellContentType.InnerText` - Rendered text (default, excludes hidden elements)
- `CellContentType.TextContent` - Raw text content (includes hidden elements)

Header sanitization options (`normalizeWhitespace`, `stripIconGlyphs`) can be used in all methods that accept `HeaderRowOptions` or `TableOptions`, such as `getHeaderRows`, `getMainHeaderRow`, `getJson`, `findRowIndex`, and `getBodyCellLocatorByRowConditions`.

---

### 4. `getBodyCellLocator(rowNumber, headerPosition)`

Gets a Playwright Locator for a specific cell by row and column indices (0-based).

Both indices are positions in the DOM: `headerPosition` counts the cells of the row, so in a row with `colspan` or `rowspan` it can differ from the column under a header. The methods that find cells by header name (`getBodyCellLocatorByRowConditions`, `getAllBodyCellLocatorsByHeaderName`, `getAllBodyCellLocatorsByHeaderIndex`) account for spans: a cell that spans rows is located in the row it starts in.

**Parameters:**

- `rowNumber: number` - Row index (0-based)
- `headerPosition: number` - Cell index within the row (0-based)

**Returns:** `Locator` - Playwright locator for the cell

**Example:**

```ts
// Get cell at row 1, column 2
const cellLocator = table.getBodyCellLocator(1, 2);
await expect(cellLocator).toHaveText("Expected Value");
await cellLocator.click();
```

---

### 5. `getBodyCellLocatorByRowConditions(conditions, targetHeader, options?)`

Finds a cell by matching row conditions and returns the locator for a specific column. Supports both object syntax (multiple conditions) and tuple syntax (single condition).

**Parameters:**

- `conditions: Record<string, string> | [string, string]` - Header-value pairs to match (object) or single [header, value] tuple
- `targetHeader: string` - Column name to retrieve
- `options?: TableOptions` - Table loading options

**Returns:** `Promise<Locator>` - Cell locator

**Throws:**

- Error if no matching row found
- Error if specified headers don't exist

**Example:**

```ts
// Find cell with multiple conditions (object syntax)
const emailCell = await table.getBodyCellLocatorByRowConditions({ "First name": "John", Status: "Active" }, "Email");
await expect(emailCell).toContainText("@example.com");

// Find cell with single condition (tuple syntax)
const actionCell = await table.getBodyCellLocatorByRowConditions(["Username", "john.doe"], "Actions");
await actionCell.locator("button.delete").click();

// Find cell with single condition (object syntax also works)
const statusCell = await table.getBodyCellLocatorByRowConditions({ Username: "john.doe" }, "Status");
```

---

### 6. `getAllBodyCellLocatorsByHeaderName(headerName, options?)`

Gets all cell locators in a column by header name.

**Parameters:**

- `headerName: string` - Column header name
- `options?: TableOptions` - Table loading options

**Returns:** `Promise<Locator[]>` - Array of cell locators

**Throws:** Error if header not found

**Example:**

```ts
// Get all cells in "Status" column
const statusCells = await table.getAllBodyCellLocatorsByHeaderName("Status");
for (const cell of statusCells) {
	await expect(cell).toHaveText(/Active|Inactive/);
}

// Extract all values from "Name" column
const names = await Promise.all(statusCells.map(cell => cell.textContent()));
console.log(names); // ["John", "Jane", "Bob"]
```

---

### 7. `getAllBodyCellLocatorsByHeaderIndex(headerIndex, options?)`

Gets all cell locators in a column by column index (0-based).

**Parameters:**

- `headerIndex: number` - Column index (0-based)
- `options?: TableOptions` - Table loading options

**Returns:** `Promise<Locator[]>` - Array of cell locators

**Throws:** Error if index out of bounds

**Example:**

```ts
// Get all cells in first column (index 0)
const firstColumnCells = await table.getAllBodyCellLocatorsByHeaderIndex(0);
const values = await Promise.all(firstColumnCells.map(c => c.textContent()));
console.log(values);

// Verify all cells are visible
for (const cell of firstColumnCells) {
	await expect(cell).toBeVisible();
}
```

---

### 8. `getJson(options?)`

Converts the entire table to a JSON array of objects. **Headers become object keys**, values are cell contents.

**Parameters:**

- `options?: TableOptions` - Configure parsing behavior

**Returns:** `Promise<any[]>` - Array of row objects

**Throws:** Error if no headers or body rows found

**Simple Example:**

<table>
  <thead><tr><th>Name</th><th>Age</th></tr></thead>
  <tbody>
    <tr><td>John</td><td>30</td></tr>
    <tr><td>Jane</td><td>25</td></tr>
  </tbody>
</table>

```ts
// HTML:
<table>
  <thead><tr><th>Name</th><th>Age</th></tr></thead>
  <tbody>
    <tr><td>John</td><td>30</td></tr>
    <tr><td>Jane</td><td>25</td></tr>
  </tbody>
</table>

const json = await table.getJson();
console.log(json);
// Output:
// [
//   { "Name": "John", "Age": "30" },
//   { "Name": "Jane", "Age": "25" }
// ]
```

**Complex Example with Options:**

```ts
// HTML with colspan, rowspan, empty cells, and duplicates
const json = await table.getJson({
	headerRowOptions: {
		colspan: { enabled: true, suffix: true },
		duplicateSuffix: true,
		emptyCellReplacement: true,
	},
});
// Output:
// [
//   {
//     "Awesome Rowspan": "Value1",
//     "Name": "John",
//     "Name__C1": "Doe",
//     "{{Empty}}": "EmptyValue",
//     "Duplicate": "First",
//     "Duplicate__D1": "Second"
//   }
// ]
```

---

## Waiting Methods

### 9. `waitForEmpty(options?)`

Waits for the table body to be completely empty (no body rows).

> 💡 **Tip:** Consider using `expect.poll` for more flexibility: `await expect.poll(async () => (await table.getBodyRows()).length).toBe(0);`

**Parameters:**

- `options?: PollingOptions`

**Returns:** `Promise<void>`

**Throws:** Error if table is not empty within timeout

**Example:**

```ts
// Click delete all button
await page.locator("button.delete-all").click();

// Wait for table to clear
await table.waitForEmpty({ timeout: 5000 });

// Verify empty state
const rows = await table.getBodyRows();
expect(rows).toHaveLength(0);
```

---

### 10. `waitForNonEmpty(options?)`

Waits for the table body to have at least one body row with actual content. A row is considered valid if it has at least one cell containing text.

> 💡 **Tip:** Consider using `expect.poll` for more flexibility: `await expect.poll(async () => (await table.getBodyRows()).length).toBeGreaterThan(0);`

**Parameters:**

- `options?: PollingOptions`

**Returns:** `Promise<void>`

**Throws:**

- Error if table remains empty (no rows) within timeout
- Error if table has rows but all cells are empty within timeout

**Example:**

```ts
// Trigger data load
await page.locator("button.load-data").click();

// Wait for table to populate with actual data
await table.waitForNonEmpty({ timeout: 5000 });

// Now safe to process data - guaranteed to have content
const data = await table.getJson();
expect(data.length).toBeGreaterThan(0);

// Useful for dynamically loaded tables where structure appears before data
await searchInput.fill("search term");
await table.waitForNonEmpty(); // Waits for rows AND content, not just empty row elements
```

---

### 11. `waitForExactRowCount(count, options?)`

Waits for the table to have exactly the specified number of body rows.

> 💡 **Tip:** Consider using `expect.poll` for more flexibility: `await expect.poll(async () => (await table.getBodyRows()).length).toBe(10);`

**Parameters:**

- `count: number` - The exact number of rows expected
- `options?: PollingOptions` - Polling options (timeout, interval)

**Returns:** `Promise<void>`

**Throws:**

- Error if row count doesn't match within timeout
- Error if count is negative or not an integer

**Example:**

```ts
// Wait for table to have exactly 10 rows
await table.waitForExactRowCount(10, { timeout: 5000 });

// Verify table has exactly 0 rows (alternative to waitForEmpty)
await table.waitForExactRowCount(0);

// Wait after pagination change
await page.locator("button.page-2").click();
await table.waitForExactRowCount(25);

// Verify filtered results
await page.locator("input.search").fill("admin");
await table.waitForExactRowCount(3); // Expect exactly 3 admin users
```

**Use Cases:**

- Verifying exact result counts after filtering
- Validating pagination behavior
- Testing data deletion/addition
- Ensuring precise table state for assertions

---

### 12. `getRowCount()`

Gets the count of header and body rows in the table. Lightweight method that doesn't fetch cell data, only counts rows.

**Parameters:** None

**Returns:** `Promise<{ header: number; body: number }>`

**Example:**

```ts
// Get current row counts
const counts = await table.getRowCount();
console.log(`Headers: ${counts.header}, Body: ${counts.body}`);

// Assert specific row count
const { body } = await table.getRowCount();
expect(body).toBe(10);

// Check if table is empty efficiently
const rowCounts = await table.getRowCount();
if (rowCounts.body === 0) {
	console.log("Table is empty");
}
```

**Use Cases:**

- Quick validation of table size without fetching data
- Performance-sensitive checks in loops
- Conditional logic based on row counts
- Monitoring table size during pagination

---

### 13. `getDistinctColumnValues(headerName, options?)`

Gets all distinct (unique) values from a specific column. Returns a sorted array of unique string values, excluding empty values.

**Parameters:**

- `headerName: string` - The header name of the column to extract distinct values from
- `options?: TableOptions` - Optional table loading options

**Returns:** `Promise<string[]>` - Sorted array of distinct values

**Throws:** Error if the specified header is not found in the table

**Example:**

```ts
// Get all unique status values
const statuses = await table.getDistinctColumnValues("Status");
// Result: ["Active", "Inactive", "Pending"]

// Get distinct countries for filtering
const countries = await table.getDistinctColumnValues("Country");
console.log(`Available countries: ${countries.join(", ")}`);

// Verify expected values exist
const roles = await table.getDistinctColumnValues("Role");
expect(roles).toContain("Admin");
expect(roles).toHaveLength(3);

// Build dynamic filters from table data
const categories = await table.getDistinctColumnValues("Category");
for (const category of categories) {
	await page.locator(`button[data-filter="${category}"]`).click();
	// Verify filtering works
}
```

**Use Cases:**

- Extracting filter options from table data
- Validating data variety and uniqueness
- Building dynamic test data sets
- Verifying dropdown/select options match table content

---

### 14. `findRowIndex(conditions, options?)`

Finds the index of the first body row matching the specified conditions. Returns -1 if no matching row is found.

**Parameters:**

- `conditions: Record<string, string>` - Record of header names and expected cell values to match
- `options?: TableOptions` - Optional table loading options

**Returns:** `Promise<number>` - The 0-based index of the first matching row, or -1 if not found

**Throws:** Error if specified headers don't exist in the table

**Example:**

```ts
// Find index of row where Status is "Active"
const index = await table.findRowIndex({ Status: "Active" });
if (index >= 0) {
	console.log(`Found at row ${index}`);
	const cell = table.getBodyCellLocator(index, 0);
	await cell.click();
}

// Find row and interact with it
const rowIndex = await table.findRowIndex({ Username: "john.doe" });
if (rowIndex >= 0) {
	const deleteButton = table.getBodyCellLocator(rowIndex, 3).locator("button.delete");
	await deleteButton.click();
} else {
	console.log("User not found");
}

// Check if specific data exists before taking action
const orderIndex = await table.findRowIndex({ "Order ID": "12345" });
if (orderIndex === -1) {
	throw new Error("Order not found in table");
}
```

**Use Cases:**

- Finding row position for interaction without fetching all data
- Conditional logic based on row existence
- Getting row indices for further locator operations
- Checking data presence without waiting

---

## Advanced Options

### Custom Selectors

Customize selectors for non-standard table structures or div-based tables:

```ts
const table = new PlaywrightTable(page.locator(".custom-table"), {
	header: {
		setMainHeaderRow: 0, // Use first header row as main (default: last row)
		rowSelector: ".header-row", // Custom header row selector
		columnSelector: ".header-cell", // Custom header cell selector
	},
	row: {
		rowSelector: ".data-row", // Custom body row selector
		columnSelector: ".data-cell", // Custom body cell selector
	},
});
```

### Div-based Tables

```ts
// Works with div-based table structures
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

### ARIA Treegrid Tables

For `role="treegrid"` structures, make sure header and body row selectors are scoped to different containers.
If both use the same selector (for example `div[role='row']`), header rows can be included in body rows.

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

### Header Row Options

Control how headers are processed:

```ts
const headers = await table.getHeaderRows({
	cellContentType: CellContentType.TextContent, // Include hidden text
	emptyCellReplacement: true, // Replace "" with "{{Empty}}"
	duplicateSuffix: true, // "Name", "Name__D1", "Name__D2"
	normalizeWhitespace: true, // "Account\nName" -> "Account Name"
	stripIconGlyphs: true, // Removes private-use icon glyph chars from header text
	colspan: {
		enabled: true, // Process colspan attributes
		suffix: true, // "Col", "Col__C1", "Col__C2"
	},
});
```

---

## Error Handling

The library provides **detailed error messages** with context to help you debug issues:

```ts
try {
	await table.getBodyCellLocatorByRowConditions({ "Invalid Header": "value" }, "Target");
} catch (error) {
	console.error(error.message);
	// Error output:
	// Header "Invalid Header" not found.
	// Available headers: [First name, Last name, Date of birth]
	// Header row locator: Locator@table >> thead >> tr
}
```

**Error Context Includes:**

- Locator descriptions with full selector chains
- Available headers when header not found
- Row/column indices when out of bounds
- Cell content types in use
- Validation failures with expected vs actual values

---

## Best Practices

### 1. Wait for Dynamic Content

```ts
// ❌ Bad - might fail if table still loading
const data = await table.getJson();

// ✅ Good - wait for content first
await table.waitForNonEmpty();
const data = await table.getJson();

// ✅ Good - wait for specific row count
await table.waitForExactRowCount(5);
const data = await table.getJson();

// ✅ Good - use expect.poll for flexible waiting
await expect.poll(async () => (await table.getBodyRows()).length).toBe(5);
const data = await table.getJson();
```

### 2. Use `expect.poll` for Flexible Waiting

While this library provides dedicated wait methods, Playwright's `expect.poll` offers more flexibility when combined with retrieval methods:

```ts
import { expect } from "@playwright/test";

// Wait for exact row count
await expect.poll(async () => (await table.getBodyRows()).length).toBe(10);

// Wait for table to be empty
await expect.poll(async () => (await table.getJson()).length).toBe(0);

// Wait for at least N rows
await expect.poll(async () => (await table.getBodyRows()).length).toBeGreaterThanOrEqual(5);

// Wait for specific data to appear
await expect.poll(() => table.getJson()).toContainEqual({ Name: "John", Status: "Active" });

// Wait for column to have specific value
await expect.poll(() => table.getDistinctColumnValues("Status")).toContain("Completed");

// Custom timeout and intervals
await expect
	.poll(async () => (await table.getBodyRows()).length, {
		message: "Waiting for table to have 10 rows",
		timeout: 10000,
		intervals: [100, 250, 500, 1000],
	})
	.toBe(10);
```

**Benefits of `expect.poll`:**

- ✅ Native Playwright API with familiar assertion syntax
- ✅ Rich assertion library (`toBe`, `toContain`, `toEqual`, `toMatch`, etc.)
- ✅ Better error messages with actual vs expected values
- ✅ Works with any retrieval method (`getBodyRows`, `getJson`, `getDistinctColumnValues`, etc.)

### 3. Use Appropriate Content Type

```ts
// For visible text only (respects CSS visibility)
const rows = await table.getBodyRows({
	cellContentType: CellContentType.InnerText,
});

// For all text including hidden elements
const rows = await table.getBodyRows({
	cellContentType: CellContentType.TextContent,
});
```

### 4. Handle Complex Tables

```ts
// Enable all options for complex tables with colspan/rowspan
const json = await table.getJson({
	headerRowOptions: {
		colspan: { enabled: true, suffix: true },
		duplicateSuffix: true,
		emptyCellReplacement: true,
	},
});
```

### 5. Leverage Cell Locators for Interactions

```ts
// Get locator first, then interact
const cell = await table.getBodyCellLocatorByRowConditions({ Name: "John Doe" }, "Actions");
await cell.locator("button.edit").click();
await cell.locator("button.delete").click();
```

---

## TypeScript Support

Full TypeScript support with exported types:

```ts
import {
	PlaywrightTable,
	HeaderRow,
	BodyRow,
	Cell,
	CellContentType,
	HeaderRowOptions,
	TableOptions,
	PollingOptions,
	RowKind,
	// Pure locators
	TableLocator,
	TableRow,
	defineTable,
	HeaderKey,
	RowWhere,
	CellMatcher,
	CellCondition,
	TableLocatorOptions,
	TableMatcherOptions,
} from "@cerios/playwright-table";
```

---

## Performance

The library is optimized for performance:

- ✅ **Parallel data fetching** - All cells in a row are fetched simultaneously
- ✅ **Efficient DOM queries** - Minimizes Playwright API calls
- ✅ **Smart polling** - Configurable intervals and timeouts
- ✅ **Lazy evaluation** - Only fetches data when needed

---

## Browser Support

Works with all Playwright-supported browsers:

- ✅ Chromium
- ✅ Firefox
- ✅ WebKit

---

## Contributing

Contributions are welcome! Please check out the [GitHub repository](https://github.com/CeriosTesting/playwright-tables).

Run `npm run build` before `npm test`: the `dist-cjs` and `dist-esm` test projects import the built bundles to verify that the selector engine survives bundling.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Support

- 📖 [Documentation](https://github.com/CeriosTesting/playwright-tables)
- 🐛 [Report Issues](https://github.com/CeriosTesting/playwright-tables/issues)
- 💬 [Discussions](https://github.com/CeriosTesting/playwright-tables/discussions)

---

**Made with ❤️ by Cerios**
