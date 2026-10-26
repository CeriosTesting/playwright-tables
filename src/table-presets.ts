import type { Locator } from "@playwright/test";

import type { TableLocatorOptions } from "./table-locator.types";
import { DEFAULT_IGNORE } from "./table-selector-engine";

/**
 * {@link TableLocatorOptions} without `headers`, so a preset can be spread into options with your own
 * typed headers.
 */
export type TablePreset = Omit<TableLocatorOptions<string>, "headers">;

/** The button inside `root` with exactly this accessible name. */
function button(root: Locator, name: string): Locator {
	return root.getByRole("button", { name, exact: true });
}

/**
 * Options for AG Grid (tested with AG Grid Community 36): ARIA roles, the header rows without the
 * floating filter row, the pinned bottom rows as footer rows, the body viewport to scroll, the
 * pagination panel, and the loading overlay. The table root is the element you created the grid in, or
 * any element inside it that holds the whole grid.
 *
 * AG Grid also renders only the columns in view (column virtualization). Rows are read with every
 * column AG Grid has rendered; to read columns outside the view, turn it off with
 * `suppressColumnVirtualisation: true`, or make the grid wide enough in your tests.
 *
 * @example
 * const cars = defineTable(page.locator("#myGrid"), { ...presets.agGrid(), headers: ["Make", "Model", "Price"] });
 * const row = await cars.findRow({ Model: "Model 150" });
 * await expect(cars).toHaveTotalRowCount(200);
 */
function agGrid(): TablePreset {
	return {
		aria: true,
		header: {
			// Column group rows and the column row; the floating filter row is not a header row of keys.
			rowSelector: ".ag-header-row-column-group, .ag-header-row-column",
			columnSelector: "[role=columnheader]",
		},
		row: {
			rowSelector: ".ag-row:not(.ag-grid-pinned-bottom-rows .ag-row):not(.ag-floating-bottom .ag-row)",
		},
		footer: { rowSelector: ".ag-grid-pinned-bottom-rows .ag-row, .ag-floating-bottom .ag-row" },
		scroll: { container: root => root.locator(".ag-grid-viewport, .ag-body-viewport").first() },
		paginate: {
			next: root => button(root, "Next Page"),
			first: root => button(root, "First Page"),
		},
		loading: root => root.locator(".ag-overlay-loading-wrapper, .ag-overlay-loading-center"),
		ignore: [...DEFAULT_IGNORE, ".ag-hidden"],
	};
}

/**
 * Options for MUI X Data Grid (based on the markup of version 7 and 8): ARIA roles, the row and cell
 * classes (without filler and skeleton cells), the virtual scroller, the pagination buttons, and the
 * loading indicator. The table root is the `.MuiDataGrid-root` element, such as `page.getByRole("grid")`.
 *
 * @example
 * const users = defineTable(page.getByRole("grid"), presets.muiDataGrid());
 * await expect(users).toHaveTotalRowCount(100);
 */
function muiDataGrid(): TablePreset {
	return {
		aria: true,
		header: {
			rowSelector: ".MuiDataGrid-columnHeaders [role=row], .MuiDataGrid-columnHeaderRow",
			columnSelector: "[role=columnheader]",
		},
		row: {
			rowSelector: ".MuiDataGrid-row",
			columnSelector: "[role=gridcell]:not(.MuiDataGrid-cellEmpty):not(.MuiDataGrid-cellSkeleton)",
		},
		scroll: { container: root => root.locator(".MuiDataGrid-virtualScroller").first() },
		paginate: { next: root => button(root, "Go to next page") },
		loading: root => root.locator(".MuiDataGrid-overlay [role=progressbar], .MuiDataGrid-loadingOverlay"),
	};
}

/**
 * Options for an Angular Material table (`mat-table`, as a native `<table>` or with the `<mat-table>`
 * elements), in both the MDC (`mat-mdc-*`) and the legacy class names. The "no data" row is not a body
 * row, and footer rows are footer rows. With `paginator`, the `mat-paginator` that pages the table.
 *
 * @example
 * const orders = defineTable(page.locator("table[mat-table]"), presets.angularMaterial({ paginator: page.locator("mat-paginator") }));
 * const row = await orders.findRow({ Id: "42" });
 */
function angularMaterial(options?: { paginator?: Locator }): TablePreset {
	const paginator = options?.paginator;
	return {
		header: {
			rowSelector: ".mat-mdc-header-row, .mat-header-row",
			columnSelector: ".mat-mdc-header-cell, .mat-header-cell",
		},
		row: {
			rowSelector: ".mat-mdc-row, .mat-row",
			columnSelector: ".mat-mdc-cell, .mat-cell, .mat-mdc-footer-cell, .mat-footer-cell",
		},
		footer: { rowSelector: ".mat-mdc-footer-row, .mat-footer-row" },
		...(paginator === undefined
			? {}
			: {
					paginate: {
						next: button(paginator, "Next page"),
						first: button(paginator, "First page"),
					},
				}),
		// The sort header arrow is drawn, but some versions put text in it.
		ignore: [...DEFAULT_IGNORE, ".mat-sort-header-arrow"],
	};
}

/**
 * Options for a table virtualized with TanStack Virtual (`@tanstack/react-virtual` and friends), which
 * renders only the rows in view and marks each with `data-index`. TanStack Table itself renders plain
 * HTML tables, which work without a preset.
 *
 * @param options.container - The element that scrolls, usually a `div` around the table.
 *
 * @example
 * const rows = defineTable(page.locator("table"), presets.tanstackVirtual({ container: page.locator(".scroll-container") }));
 * const all = await rows.toJson({ allRows: true });
 */
function tanstackVirtual(options: { container: Locator }): TablePreset {
	return { scroll: { container: options.container, rowKey: "data-index" } };
}

/**
 * Ready-made {@link TableLocatorOptions} for popular data grids. Spread a preset into your own options to
 * add typed headers or change a setting.
 *
 * @example
 * const grid = defineTable(page.locator("#grid"), { ...presets.agGrid(), headers: ["Id", "Name"] });
 */
export const presets: {
	agGrid: typeof agGrid;
	muiDataGrid: typeof muiDataGrid;
	angularMaterial: typeof angularMaterial;
	tanstackVirtual: typeof tanstackVirtual;
} = { agGrid, muiDataGrid, angularMaterial, tanstackVirtual };
