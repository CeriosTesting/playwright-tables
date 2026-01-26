# Migration Guide: v1.x → v2.0

This guide helps you upgrade from `@cerios/playwright-table` v1.x to v2.0.

## Breaking Change: Auto-Wait Removed

### What Changed

**v1.x behavior:** Data retrieval methods (`getJson()`, `getBodyRows()`, `getHeaderRows()`, etc.) automatically waited for table content to load before returning data.

**v2.0 behavior:** Methods fetch data immediately without waiting. If the table hasn't loaded yet, methods will throw an error.

### Why This Change?

1. **Predictability**: Explicit waiting gives you full control over timeout and retry behavior
2. **Performance**: No overhead when tables are already loaded
3. **Flexibility**: Playwright's `expect.poll` provides richer assertion options
4. **Debugging**: Clearer distinction between "table not loaded" vs "data doesn't match"

## Removed Methods

The following wait methods have been removed:

| Removed Method             | Replacement                                                |
| -------------------------- | ---------------------------------------------------------- |
| `waitForHeaderRows()`      | `expect.poll(() => table.getHeaderRows())`                 |
| `waitForBodyRows()`        | `expect.poll(() => table.getBodyRows())`                   |
| `waitForStable()`          | `expect.poll()` with custom stability logic                |
| `waitForRowByConditions()` | `expect.poll(() => table.findRowIndex(conditions))`        |
| `waitForRowByIndex()`      | `expect.poll(() => table.getRowCount())`                   |
| `waitForCellText()`        | `expect.poll()` with `getBodyCellLocatorByRowConditions()` |

## Available Wait Methods

The following methods are still available in v2.0:

| Method                                  | Purpose                                |
| --------------------------------------- | -------------------------------------- |
| `waitForEmpty(options?)`                | Wait for table body to have 0 rows     |
| `waitForNonEmpty(options?)`             | Wait for at least one row with content |
| `waitForExactRowCount(count, options?)` | Wait for exact number of body rows     |

## Migration: Use `expect.poll`

Playwright's `expect.poll` is the recommended approach for waiting on table state. It combines waiting and assertion in a single, expressive call.

### Basic Pattern

```typescript
// ❌ Old v1.x code - relied on auto-wait
const data = await table.getJson();

// ✅ New v2.0 code - explicit wait with expect.poll
await expect.poll(() => table.getJson()).not.toHaveLength(0);
const data = await table.getJson();

// ✅ Alternative - use built-in wait method
await table.waitForNonEmpty();
const data = await table.getJson();
```

### Wait for Row Count

```typescript
// ❌ Old: waitForBodyRows with amount
await table.waitForBodyRows({ row: { amount: 10 } });

// ✅ New: expect.poll
await expect.poll(async () => (await table.getBodyRows()).length).toBe(10);

// ✅ Alternative: built-in method
await table.waitForExactRowCount(10);
```

### Wait for Specific Data

```typescript
// ❌ Old: waitForRowByConditions
await table.waitForRowByConditions({ Username: "john.doe", Status: "Active" });

// ✅ New: expect.poll with findRowIndex
await expect.poll(() => table.findRowIndex({ Username: "john.doe", Status: "Active" })).toBeGreaterThanOrEqual(0);

// ✅ New: expect.poll with getJson for richer assertions
await expect
	.poll(() => table.getJson())
	.toContainEqual(expect.objectContaining({ Username: "john.doe", Status: "Active" }));
```

### Wait for Cell Text

```typescript
// ❌ Old: waitForCellText
await table.waitForCellText({ "Order ID": "12345" }, "Status", "Completed");

// ✅ New: expect.poll with locator
const cell = await table.getBodyCellLocatorByRowConditions({ "Order ID": "12345" }, "Status");
await expect.poll(() => cell.innerText()).toBe("Completed");

// ✅ Alternative: use Playwright's built-in expect
await expect(cell).toHaveText("Completed");
```

### Wait for Column Values

```typescript
// ❌ Old: relied on auto-wait
const statuses = await table.getDistinctColumnValues("Status");

// ✅ New: expect.poll
await expect.poll(() => table.getDistinctColumnValues("Status")).toContain("Active");
```

### Wait for Table to be Empty

```typescript
// ✅ Built-in method still available
await table.waitForEmpty({ timeout: 5000 });

// ✅ Alternative with expect.poll
await expect.poll(async () => (await table.getBodyRows()).length).toBe(0);
```

### Wait for Table Stability (Dynamic Content)

```typescript
// ❌ Old: waitForStable
await table.waitForStable({ stabilityDuration: 500 });

// ✅ New: Custom stability check with expect.poll
let lastCount = -1;
await expect
	.poll(
		async () => {
			const currentCount = (await table.getBodyRows()).length;
			const stable = currentCount === lastCount;
			lastCount = currentCount;
			return stable;
		},
		{ timeout: 5000 }
	)
	.toBe(true);
```

## Custom Timeout and Intervals

```typescript
await expect
	.poll(async () => (await table.getBodyRows()).length, {
		message: "Waiting for table to have 10 rows",
		timeout: 10000,
		intervals: [100, 250, 500, 1000],
	})
	.toBe(10);
```

## Benefits of `expect.poll`

- ✅ **Native Playwright API** - familiar assertion syntax
- ✅ **Rich assertions** - `toBe`, `toContain`, `toEqual`, `toMatch`, `toContainEqual`, etc.
- ✅ **Better error messages** - shows actual vs expected values
- ✅ **Flexible timeouts** - configure per-assertion
- ✅ **Custom intervals** - control retry frequency
- ✅ **Works with any method** - `getBodyRows`, `getJson`, `getDistinctColumnValues`, `findRowIndex`, etc.

## Troubleshooting

### Error: "No body rows found, is table loaded completely?"

Add an appropriate wait before data retrieval:

```typescript
// Option 1: Wait for any content
await table.waitForNonEmpty();
const data = await table.getJson();

// Option 2: Wait for specific count
await table.waitForExactRowCount(10);
const data = await table.getJson();

// Option 3: Use expect.poll
await expect.poll(() => table.getJson()).not.toHaveLength(0);
const data = await table.getJson();
```

### Error: "No header rows found"

Ensure headers are loaded before operations:

```typescript
await expect.poll(async () => (await table.getHeaderRows()).length).toBeGreaterThan(0);
const headers = await table.getMainHeaderRow();
```

### Tests that previously passed now fail or timeout

- The default polling timeout is 30 seconds
- Use `{ timeout: X }` option to adjust
- Consider using `expect.poll` with custom intervals for slow-loading tables
