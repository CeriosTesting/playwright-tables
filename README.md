# 🎭 Playwright Tables | By Cerios

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
await table.waitForBodyRows({
	row: { amount: 5 },
	timeout: 10000,
});
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

- `options?: { cellContentType?: CellContentType }` - Content extraction type

**Returns:** `Promise<BodyRow[]>` - Array of body rows

**Throws:** Error if no body rows found

**Example:**

```ts
const rows = await table.getBodyRows({
	cellContentType: CellContentType.TextContent, // Include hidden elements
});
console.log(rows);
// Output: [["John", "30", "NYC"], ["Jane", "25", "LA"]]
```

**Cell Content Types:**

- `CellContentType.InnerText` - Rendered text (default, excludes hidden elements)
- `CellContentType.TextContent` - Raw text content (includes hidden elements)

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

Finds a cell by matching row conditions and returns the locator for a specific column.

**Parameters:**

- `conditions: Record<string, string>` - Header-value pairs to match
- `targetHeader: string` - Column name to retrieve
- `options?: TableOptions` - Table loading options

**Returns:** `Promise<Locator>` - Cell locator

**Throws:**

- Error if no matching row found
- Error if specified headers don't exist

**Example:**

```ts
// Find "Email" cell where "First name" is "John" and "Status" is "Active"
const emailCell = await table.getBodyCellLocatorByRowConditions({ "First name": "John", Status: "Active" }, "Email");
await expect(emailCell).toContainText("@example.com");

// Click button in Actions column for specific user
const actionCell = await table.getBodyCellLocatorByRowConditions({ Username: "john.doe" }, "Actions");
await actionCell.locator("button.delete").click();
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

### 9. `waitForHeaderRows(options?)`

Waits for header rows to be loaded and meet specified conditions. Uses polling with retry logic.

**Parameters:**

- `options?: WaitForTableRowsOptions & PollingOptions`

**Returns:** `Promise<void>`

**Throws:** Error if conditions not met within timeout

**Example:**

```ts
// Wait for at least 1 header row with 5 cells
await table.waitForHeaderRows({
	row: {
		amount: 1,
		cell: { totalCount: 5 },
	},
	timeout: 5000,
	interval: 100,
});
```

---

### 10. `waitForBodyRows(options?)`

Waits for body rows to be loaded and meet specified conditions.

**Parameters:**

- `options?: WaitForTableRowsOptions & PollingOptions`

**Returns:** `Promise<void>`

**Throws:** Error if conditions not met within timeout

**Examples:**

```ts
// Wait for at least 10 body rows
await table.waitForBodyRows({
	row: { amount: 10 },
	timeout: 10000,
});

// Wait for rows with specific structure
await table.waitForBodyRows({
	row: {
		amount: 5,
		cell: {
			totalCount: 4, // 4 cells per row
			contentCount: 4, // All cells must have content
		},
	},
});

// Wait for any rows with content (minimal check)
await table.waitForBodyRows({ timeout: 5000 });
```

**Options:**

```ts
{
  row?: {
    amount?: number,           // Expected exact number of rows
    cell?: {
      totalCount?: number,     // Expected cells per row (regardless of content)
      contentCount?: number    // Expected cells with non-empty content per row
    }
  },
  timeout?: number,            // Max wait time in ms (default: 30000)
  interval?: number            // Check interval in ms (default: 100)
}
```

---

### 11. `waitForStable(options?)`

Waits for the table to become stable (no changes for a specified duration). Useful for lazy-loading, streaming data, or animations.

**Parameters:**

- `options?: WaitForStableOptions`

**Returns:** `Promise<void>`

**Throws:** Error if table doesn't stabilize within timeout

**Examples:**

```ts
// Wait for table to remain unchanged for 500ms
await table.waitForStable({ stabilityDuration: 500 });

// Custom stability check with fast polling
await table.waitForStable({
	stabilityDuration: 1000, // Must be stable for 1 second
	checkInterval: 100, // Check every 100ms
	timeout: 10000, // Give up after 10 seconds
});

// Use after triggering search/filter
await searchInput.fill("test query");
await table.waitForStable(); // Wait for results to finish loading
const results = await table.getJson();
```

**Options:**

```ts
{
  stabilityDuration?: number,  // Duration table must remain unchanged (default: 500ms)
  checkInterval?: number,      // Interval between checks (default: 100ms)
  timeout?: number            // Max wait time (default: 30000ms)
}
```

---

### 12. `waitForEmpty(options?)`

Waits for the table body to be completely empty (no body rows).

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

### 13. `waitForNonEmpty(options?)`

Waits for the table body to have at least one body row.

**Parameters:**

- `options?: PollingOptions`

**Returns:** `Promise<void>`

**Throws:** Error if table remains empty within timeout

**Example:**

```ts
// Trigger data load
await page.locator("button.load-data").click();

// Wait for table to populate
await table.waitForNonEmpty({ timeout: 5000 });

// Now safe to process data
const data = await table.getJson();
expect(data.length).toBeGreaterThan(0);
```

---

### 14. `waitForRowByConditions(conditions, options?)`

Waits for at least one row (or N rows) matching the specified column conditions. Useful for waiting for specific data to appear in the table.

**Parameters:**

- `conditions: Record<string, string>` - Object with header names as keys and expected cell values
- `options?: WaitForRowByConditionsOptions` - Options including `minRows` and polling settings

**Returns:** `Promise<void>`

**Throws:**

- Error if conditions not met within timeout
- Error if specified headers don't exist in the table

**Example:**

```ts
// Wait for a specific user to appear
await searchInput.fill("john.doe");
await table.waitForRowByConditions({ Username: "john.doe", Status: "Active" }, { timeout: 5000 });

// Wait for at least 3 rows from USA
await table.waitForRowByConditions({ Country: "USA" }, { minRows: 3, timeout: 10000 });

// Wait for order status after submission
await page.locator("button.submit-order").click();
await table.waitForRowByConditions({ "Order ID": "12345", Status: "Processing" });

// Now safe to verify the row exists
const cell = await table.getBodyCellLocatorByRowConditions({ Username: "john.doe" }, "Email");
await expect(cell).toHaveText("john.doe@example.com");
```

**Use Cases:**

- Waiting for search results to appear with specific values
- Verifying data updates after form submission
- Ensuring filtered data meets criteria before assertions
- Polling for status changes in specific rows

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

### Header Row Options

Control how headers are processed:

```ts
const headers = await table.getHeaderRows({
	cellContentType: CellContentType.TextContent, // Include hidden text
	emptyCellReplacement: true, // Replace "" with "{{Empty}}"
	duplicateSuffix: true, // "Name", "Name__D1", "Name__D2"
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
await table.waitForBodyRows({ row: { amount: 5 } });
const data = await table.getJson();
```

### 2. Use Appropriate Content Type

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

### 3. Handle Complex Tables

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

### 4. Leverage Cell Locators for Interactions

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
	WaitForTableRowsOptions,
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
