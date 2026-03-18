---
"@cerios/playwright-table": patch
---

Improve support for custom grid headers (including ARIA treegrids) and make header sanitization options reusable across table APIs.

- Add `normalizeWhitespace` and `stripIconGlyphs` to header parsing options to clean noisy header text (line breaks and icon-font glyphs).
- Apply header sanitization in all methods that use header parsing, not only `getJson`.
- Generalize `getBodyRows` to accept full `TableOptions` while keeping legacy `cellContentType` support.
- Add a constructor warning when `header.rowSelector` and `row.rowSelector` are identical, since this can cause header rows to be read as body rows.
- Add tests for header sanitization, treegrid behavior, and cross-method option usage; update docs with treegrid selector guidance and new options.
