---
"@cerios/playwright-table": minor
---

Add `TableLocator`: a type-safe table API that only returns Playwright locators, backed by a `pw-table` custom selector engine. Rows and cells are resolved by header name in the browser on every retry, so locators auto-wait for late headers and rows and survive reordered columns. Also adds `defineTable()`, typed header keys and row conditions (string, RegExp, `equals`/`contains`/`startsWith`/`endsWith`, `oneOf`, `empty`, `predicate`), `headerKeys()`/`validateHeaders()`, the `toHaveRow`/`toHaveRowCount`/`toHaveHeaders` matchers (exported as `tableMatchers` and a pre-extended `expect`), `registerTableSelectors()` and a ready-made `test` fixture. `PlaywrightTable` is unchanged.
