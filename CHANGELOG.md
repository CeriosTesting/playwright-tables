# @cerios/playwright-table

## 2.0.1

### Patch Changes

- facc128: Improve support for custom grid headers (including ARIA treegrids) and make header sanitization options reusable across table APIs.
  - Add `normalizeWhitespace` and `stripIconGlyphs` to header parsing options to clean noisy header text (line breaks and icon-font glyphs).
  - Apply header sanitization in all methods that use header parsing, not only `getJson`.
  - Generalize `getBodyRows` to accept full `TableOptions` while keeping legacy `cellContentType` support.
  - Add a constructor warning when `header.rowSelector` and `row.rowSelector` are identical, since this can cause header rows to be read as body rows.
  - Add tests for header sanitization, treegrid behavior, and cross-method option usage; update docs with treegrid selector guidance and new options.

## 2.0.0

### Major Changes

- 7204552: ### Breaking Changes
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

## 1.1.3

### Patch Changes

- ad31dea: exporting dist folder fix

## 1.1.2

### Patch Changes

- 245c893: Lower @playwright/test peer dependency

## 1.1.1

### Patch Changes

- ae9acb4: Extra typescript documentation, extra load options for all methods and return values always of type string

## 1.1.0

### Minor Changes

- 3459ebc: removed casting

## 1.0.4

### Patch Changes

- a2c399d: Updated typescript documentation and readme

## 1.0.2

### Patch Changes

- c67fdbc: fix readme

## 1.0.1

### Patch Changes

- 88228ab: Updated readme
