---
"@cerios/playwright-table": patch
---

Improve header key readability when using header sanitization by normalizing line-ending and control whitespace variants to single spaces when `normalizeWhitespace` is enabled.

This keeps default behavior unchanged (sanitization is still opt-in), while making normalized header text consistent across all header-based methods, including `getJson`, header-name lookups, and distinct-value queries.

Also adds regression and integration tests covering line-ending/control whitespace header scenarios.

Align header-name lookup methods with `getJson` header-key defaults so empty and duplicate header names resolve consistently (for example, `{{Empty}}` and `{{Empty}}__D1`) in methods like `getBodyCellLocatorByRowConditions`, `getAllBodyCellLocatorsByHeaderName`, `getDistinctColumnValues`, and `findRowIndex`.
