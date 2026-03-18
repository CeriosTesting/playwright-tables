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

**Parameters:**

- `rowNumber: number` - Row index (0-based)
- `headerPosition: number` - Column index (0-based)

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
