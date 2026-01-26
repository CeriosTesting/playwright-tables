---
"@cerios/playwright-table": major
---

### Breaking Changes

- **Removed auto-wait behavior**: Data retrieval methods (`getJson()`, `getBodyRows()`, `getHeaderRows()`, etc.) no longer automatically wait for table content to load. You must explicitly wait before calling these methods.
- **Removed wait methods**: The following methods have been removed in favor of `expect.poll`:
  - `waitForHeaderRows()`
  - `waitForBodyRows()`
  - `waitForStable()`
  - `waitForRowByConditions()`
  - `waitForRowByIndex()`
  - `waitForCellText()`
- **Migration guide**: See [MIGRATIONv2.md](./MIGRATIONv2.md) for detailed upgrade instructions.

### Improved error handling

- Add detailed error messages with locator info, available headers, and search conditions for easier debugging

### Performance

- Parallelize cell data fetching for significant speed improvements on large tables

### Documentation

- Add `expect.poll` examples as recommended alternative to built-in wait methods
- Improve JSDoc with usage examples and best practices
