import { Locator } from "@playwright/test";

import { CellContentType } from "./cell-content-type";
import { describeWhere, serializeWhere } from "./cell-matcher-serializer";
import { describeLastError, MIN_READ_TIMEOUT, pollUntil } from "./polling";
import { formatRows } from "./table-format";
import {
	ColumnKey,
	ColumnParser,
	ColumnParsers,
	DecimalSeparator,
	EngineConfig,
	EngineFindRequest,
	EngineFingerprint,
	EngineFingerprintRequest,
	EngineKeysRequest,
	EngineQuery,
	EngineTexts,
	EngineTextsRequest,
	EngineTotalRequest,
	EngineValuesRequest,
	EngineWindow,
	EngineWindowRequest,
	HeaderKey,
	LocatorRef,
	NavigationOptions,
	RowWhere,
	StableOptions,
	TableJsonOptions,
	TableJsonRow,
	TableLocatorOptions,
	ValidRowWhere,
} from "./table-locator.types";
import { NavigationHost, NavigationPosition, resolveRef, TableNavigator } from "./table-navigation";
import {
	findTableRows,
	normalizeCell,
	normalizeLine,
	parseNumber,
	readColumnValues,
	readTableFingerprint,
	readTableHeaderKeys,
	readTableTexts,
	readTableTotal,
	readTableWindow,
	TABLE_SELECTOR_ENGINE_NAME,
} from "./table-selector-engine";
import { TableUtils } from "./table-utils";

/** Filter options accepted by `Locator.filter()`. */
export type RowFilterOptions = Parameters<Locator["filter"]>[0];

/**
 * One or more body rows of a {@link TableLocator}, with typed access to their cells.
 *
 * Instances are created by {@link TableLocator.row}, {@link TableLocator.rowAt} and {@link TableLocator.rows}.
 * Their locators read like your code in error messages and traces, such as
 * `locator('#users').row({ "Name": "John" }).cell("Status")` (Playwright 1.53 and later).
 *
 * @example
 * const row = table.row({ Name: "John" });
 * await expect(row.locator).toBeVisible();
 * await expect(row.cell("Status")).toHaveText("Active");
 */
export class TableRow<H extends string = string> {
	/**
	 * @param table - The table this row belongs to.
	 * @param locator - The Playwright `Locator` for the row element(s). Its `toString()` is used to describe
	 *   the locators built from this row.
	 */
	constructor(
		readonly table: TableLocator<H>,
		readonly locator: Locator
	) {}

	/**
	 * Returns the cell of this row under `column`.
	 * If this row locator matches several rows, the cell locator matches one cell per row.
	 *
	 * @param column - The header key of the column, or its 0-based index (also works without header rows).
	 * @returns A Playwright Locator for the cell.
	 *
	 * @example
	 * await table.row({ Name: "John" }).cell("Email").click();
	 *
	 * @example
	 * // By column index, for example in a table without header rows
	 * await expect(table.rowAt(0).cell(2)).toHaveText("john@example.com");
	 */
	cell(column: ColumnKey<H>): Locator {
		return this.table.cell(this.locator, column);
	}

	/**
	 * The first of these rows, with typed cell access. Use it when several rows may match and any is fine.
	 *
	 * @example
	 * await table.row({ Status: "Active" }).first().cell("Edit").click();
	 */
	first(): TableRow<H> {
		return new TableRow(this.table, described(this.locator.first(), `${this.locator.toString()}.first()`));
	}

	/**
	 * The last of these rows, with typed cell access.
	 *
	 * @example
	 * await expect(table.rows.last().cell("Name")).toHaveText("Jane");
	 */
	last(): TableRow<H> {
		return new TableRow(this.table, described(this.locator.last(), `${this.locator.toString()}.last()`));
	}

	/**
	 * The row at `index` among these rows, with typed cell access. Negative indexes count from the end,
	 * like `Locator.nth()`.
	 *
	 * @param index - The 0-based index among these rows.
	 * @returns A {@link TableRow} for the row.
	 * @throws Error if index is not an integer.
	 *
	 * @example
	 * await expect(table.row({ Status: "Active" }).nth(1).cell("Name")).toHaveText("Joe");
	 */
	nth(index: number): TableRow<H> {
		if (!Number.isInteger(index)) {
			throw new Error(`Row index must be an integer, got: ${index}`);
		}
		return new TableRow(this.table, described(this.locator.nth(index), `${this.locator.toString()}.nth(${index})`));
	}

	/**
	 * Narrows these rows with `Locator.filter()` and keeps typed cell access.
	 *
	 * @param options - The same options as `Locator.filter()`.
	 * @returns A new {@link TableRow} for the filtered rows.
	 *
	 * @example
	 * await expect(table.rows.filter({ hasText: "Jane" }).cell("Status")).toHaveText("Active");
	 */
	filter(options?: RowFilterOptions): TableRow<H> {
		const description = `${this.locator.toString()}.filter(${describeFilter(options)})`;
		return new TableRow(this.table, described(this.locator.filter(options), description));
	}

	/**
	 * Fills the controls in the cells of this row, one column after the other. A boolean checks or unchecks
	 * a checkbox or switch; a string selects an option of a `<select>`, or fills an input, a text area or
	 * an editable element.
	 *
	 * A cell without a control is edited in place, as data grids do: it is double-clicked, the editor that
	 * appears in the cell is filled, and `commit` is pressed. Editors that open outside the cell (a popup)
	 * are not found.
	 *
	 * Columns are filled in the order of `values`. When the row is found by the value of a column you fill,
	 * fill that column last: after it changes, the row no longer matches.
	 *
	 * @param values - The value per column.
	 * @param options - Optional settings.
	 * @param options.commit - (Optional) The key that ends in-place editing. Defaults to `"Enter"`; `false` presses nothing.
	 * @param options.timeout - (Optional) The time per action, in milliseconds. Defaults to 5000.
	 * @throws Error if a cell has no control, also not after a double-click.
	 *
	 * @example
	 * await users.row({ Name: "John" }).fill({ Email: "john@example.org", Active: false, Role: "Admin" });
	 */
	async fill(
		values: { [K in HeaderKey<H>]?: string | boolean },
		options?: { commit?: string | false; timeout?: number }
	): Promise<void> {
		const entries: [string, string | boolean | undefined][] = Object.entries(values);
		for (const [column, value] of entries) {
			if (value !== undefined) await fillCell(this.cell(column as HeaderKey<H>), column, value, options);
		}
	}

	/**
	 * Selects this row: checks the checkbox in the row, or clicks the row if it has none, and waits until
	 * the row is selected (see {@link isSelected}). A selected row is left as it is.
	 *
	 * @param options - Optional timeout, in milliseconds. Defaults to 5000.
	 * @throws Error if the row is not selected within the timeout.
	 *
	 * @example
	 * await users.row({ Name: "John" }).select();
	 * await expect(users.row({ Name: "John" })).toBeSelected();
	 */
	async select(options?: { timeout?: number }): Promise<void> {
		await this.setSelected(true, options?.timeout ?? 5_000);
	}

	/**
	 * Deselects this row: unchecks the checkbox in the row, or clicks the row if it has none, and waits
	 * until the row is not selected. A row that is not selected is left as it is.
	 *
	 * @param options - Optional timeout, in milliseconds. Defaults to 5000.
	 * @throws Error if the row is still selected after the timeout.
	 */
	async deselect(options?: { timeout?: number }): Promise<void> {
		await this.setSelected(false, options?.timeout ?? 5_000);
	}

	/**
	 * Whether this row is selected: it has `aria-selected="true"`, or the first checkbox in it is checked.
	 * Reads the row once; for a retrying check, use `expect(row).toBeSelected()`.
	 *
	 * @param options - Optional timeout for finding the row, in milliseconds.
	 * @returns A promise that resolves to whether the row is selected.
	 */
	async isSelected(options?: { timeout?: number }): Promise<boolean> {
		return this.locator.evaluate(readSelected, undefined, options);
	}

	/**
	 * Expands this row of a tree grid, and waits until it is expanded. An expanded row is left as it is.
	 * It clicks `toggle`, or else the first element in the row with `aria-expanded`, or else the first
	 * button in the row. Without any of them, it focuses the row and presses `ArrowRight`, as tree grids do.
	 *
	 * @param options - Optional settings.
	 * @param options.toggle - (Optional) The control that expands and collapses the row, from the row locator.
	 * @param options.timeout - (Optional) The time to wait, in milliseconds. Defaults to 5000.
	 * @throws Error if the row has no `aria-expanded` (on the row or an element in it), or doesn't expand.
	 *
	 * @example
	 * await files.row({ Name: "src" }).expand();
	 * await expect(files.row({ Name: "index.ts" }).locator).toBeVisible();
	 */
	async expand(options?: { toggle?: (row: Locator) => Locator; timeout?: number }): Promise<void> {
		await this.setExpanded(true, options);
	}

	/**
	 * Collapses this row of a tree grid, like {@link expand} does, but with `ArrowLeft` as the fallback.
	 *
	 * @param options - Optional settings, the same as for {@link expand}.
	 * @throws Error if the row has no `aria-expanded` (on the row or an element in it), or doesn't collapse.
	 */
	async collapse(options?: { toggle?: (row: Locator) => Locator; timeout?: number }): Promise<void> {
		await this.setExpanded(false, options);
	}

	/**
	 * Whether this row is expanded: the `aria-expanded` of the row, or else of the first element in it that
	 * has one. `null` if there is none, for a row that cannot expand.
	 *
	 * @param options - Optional settings.
	 * @param options.timeout - (Optional) The time to wait for the row, in milliseconds.
	 * @returns A promise that resolves to `true`, `false` or `null`.
	 */
	async isExpanded(options?: { timeout?: number }): Promise<boolean | null> {
		return this.locator.evaluate(readExpanded, undefined, options);
	}

	/**
	 * The `aria-level` of this row in a tree grid (1 for the top level), or `null` if it has none.
	 *
	 * @param options - Optional settings.
	 * @param options.timeout - (Optional) The time to wait for the row, in milliseconds.
	 * @example
	 * expect(await files.row({ Name: "index.ts" }).level()).toBe(2);
	 */
	async level(options?: { timeout?: number }): Promise<number | null> {
		const level = await this.locator.getAttribute("aria-level", options);
		const value = level === null ? NaN : parseInt(level, 10);
		return isNaN(value) ? null : value;
	}

	private async setSelected(selected: boolean, timeout: number): Promise<void> {
		const deadline = Date.now() + timeout;
		if ((await this.isSelected({ timeout })) === selected) return;
		const checkbox = this.locator.locator(CHECKBOX).first();
		if ((await checkbox.count()) > 0) {
			await checkbox.setChecked(selected, { timeout });
		} else {
			await this.locator.click({ timeout });
		}
		const poll = await pollUntil(
			readTimeout => this.isSelected({ timeout: readTimeout }),
			value => value === selected,
			!selected,
			deadline
		);
		if (poll.value !== selected) {
			throw new Error(
				`TableRow.${selected ? "select" : "deselect"}() timed out: the row is ${selected ? "not " : ""}selected.\n` +
					describeLastError(poll.error) +
					`Row locator: ${this.locator.toString()}`
			);
		}
	}

	private async setExpanded(
		expanded: boolean,
		options: { toggle?: (row: Locator) => Locator; timeout?: number } | undefined
	): Promise<void> {
		const timeout = options?.timeout ?? 5_000;
		const deadline = Date.now() + timeout;
		const name = expanded ? "expand" : "collapse";
		const state = await this.isExpanded({ timeout });
		if (state === null) {
			throw new Error(
				`TableRow.${name}(): the row has no aria-expanded, so it cannot expand or collapse.\n` +
					`Row locator: ${this.locator.toString()}`
			);
		}
		if (state === expanded) return;
		const toggle =
			options?.toggle?.(this.locator) ??
			this.locator.locator("[aria-expanded]").or(this.locator.locator("button, [role=button]")).first();
		if ((await toggle.count()) > 0) {
			await toggle.click({ timeout });
		} else {
			await this.locator.focus({ timeout });
			await this.locator.press(expanded ? "ArrowRight" : "ArrowLeft", { timeout });
		}
		const poll = await pollUntil(
			readTimeout => this.isExpanded({ timeout: readTimeout }),
			value => value === expanded,
			state,
			deadline
		);
		if (poll.value !== expanded) {
			throw new Error(
				`TableRow.${name}() timed out: the row is ${expanded ? "still collapsed" : "still expanded"}.\n` +
					describeLastError(poll.error) +
					`Row locator: ${this.locator.toString()}`
			);
		}
	}
}

/** The checkboxes that select a row. */
const CHECKBOX = "input[type=checkbox], [role=checkbox]";

/** The controls {@link TableRow.fill} fills. */
const CONTROLS =
	"input:not([type=hidden]), textarea, select, [contenteditable=''], [contenteditable='true'], " +
	"[role=checkbox], [role=switch], [role=textbox], [role=combobox]";

/** Whether a row element is selected. Runs in the browser. */
function readSelected(row: Element): boolean {
	if (row.getAttribute("aria-selected") === "true") return true;
	const box = row.querySelector("input[type=checkbox], [role=checkbox]");
	if (box === null) return false;
	if (box instanceof HTMLInputElement) return box.checked;
	return box.getAttribute("aria-checked") === "true";
}

/** Whether a row element is expanded, or `null` if it has no `aria-expanded`. Runs in the browser. */
function readExpanded(row: Element): boolean | null {
	const value =
		row.getAttribute("aria-expanded") ?? row.querySelector("[aria-expanded]")?.getAttribute("aria-expanded");
	return value === null || value === undefined ? null : value === "true";
}

/** Fills the control in `cell`, after double-clicking the cell if it has none. */
async function fillCell(
	cell: Locator,
	column: string,
	value: string | boolean,
	options: { commit?: string | false; timeout?: number } | undefined
): Promise<void> {
	const timeout = options?.timeout ?? 5_000;
	const control = cell.locator(CONTROLS).first();
	let editing = false;
	if ((await control.count()) === 0) {
		await cell.dblclick({ timeout });
		editing = true;
		try {
			await control.waitFor({ state: "visible", timeout });
		} catch {
			throw new Error(
				`TableRow.fill(): the cell under "${column}" has no input, also not after a double-click.\n` +
					`Cell locator: ${cell.toString()}`
			);
		}
	}
	if (typeof value === "boolean") {
		await control.setChecked(value, { timeout });
	} else if (await control.evaluate(element => element.localName === "select", undefined, { timeout })) {
		await control.selectOption(value, { timeout });
	} else {
		await control.fill(value, { timeout });
	}
	const commit = options?.commit ?? "Enter";
	if (editing && commit !== false) await control.press(commit, { timeout });
}

/**
 * A type-safe table API that only returns Playwright `Locator`s.
 *
 * Header names are resolved to columns inside the browser by the `pw-table-v1` selector engine on every
 * evaluation, so every locator auto-waits for late headers and rows, and keeps working when columns are
 * reordered at runtime. Building locators is synchronous.
 *
 * Text is read as the user sees it. Header text is one line: `First<br>name` is the header `"First name"`.
 * Body cells keep their line breaks as one `\n`. Icon glyphs, invisible characters and the text of the elements
 * matching the `ignore` option (screen reader only text and icons by default) are left out. Header names
 * you pass are normalized the same way.
 *
 * The `pw-table-v1` selector engine must be registered first: import `test` from this package, or call
 * {@link registerTableSelectors} before the page is created.
 *
 * @example
 * import { test, expect, TableLocator } from "@cerios/playwright-table";
 *
 * test("user is active", async ({ page }) => {
 *   const users = new TableLocator(page.locator("table"), { headers: ["Name", "Status", "Email"] });
 *   await expect(users.row({ Name: "John" }).cell("Status")).toHaveText("Active");
 * });
 */
export class TableLocator<const H extends string = string> {
	/** The Playwright `Locator` pointing to the root table element. */
	readonly root: Locator;
	private readonly _config: EngineConfig;
	private readonly _headers: readonly H[] | undefined;
	private readonly _loading: Locator | undefined;
	private readonly _navigator: TableNavigator;
	private readonly _rowKey: string | undefined;

	/**
	 * Creates a table with customizable selectors for headers and rows.
	 *
	 * Rows and cells inside a cell (such as a nested table) never belong to this table, and both `<th>`
	 * and `<td>` count as cells in header and body rows. `PlaywrightTable` only takes `<th>` in header rows
	 * and `<td>` in body rows.
	 *
	 * @param root - The Playwright `Locator` pointing to the root table element.
	 * @param options - Optional configuration. See {@link TableLocatorOptions}.
	 * @param options.headers - (Optional) Header names, used for typed header keys and {@link validateHeaders}.
	 * @param options.aria - (Optional) Use ARIA roles for the default selectors. Defaults to `false`.
	 * @param options.header.setMainHeaderRow - (Optional) Index of the main header row. Defaults to the last header row.
	 * @param options.header.rowSelector - (Optional) CSS selector for header rows. Defaults to `"thead>tr"`, plus the leading `<th>`-only rows of a table without `<thead>`.
	 * @param options.header.columnSelector - (Optional) CSS selector for header cells. Defaults to `"th, td"`.
	 * @param options.row.rowSelector - (Optional) CSS selector for body rows. Defaults to `"tbody>tr"`, without those header rows.
	 * @param options.row.columnSelector - (Optional) CSS selector for body cells. Defaults to `"td, th"`.
	 * @param options.cellContentType - (Optional) How cell text is read. Defaults to `InnerText`.
	 * @param options.ignore - (Optional) CSS selectors of elements inside cells whose text is left out. Defaults to {@link DEFAULT_IGNORE}.
	 * @param options.footer.rowSelector - (Optional) CSS selector for footer rows. Defaults to `"tfoot>tr"`, or none with `aria`.
	 * @param options.paginate - (Optional) How to go to the next page, see {@link PaginateOptions}.
	 * @param options.scroll - (Optional) How to scroll a virtualized grid, see {@link ScrollOptions}.
	 * @param options.loading - (Optional) The loading indicator of the table.
	 *
	 * @example
	 * // Typed headers: header arguments are checked at compile time
	 * const users = new TableLocator(page.locator("table"), { headers: ["Name", "Status"] });
	 *
	 * @example
	 * // Div based table with custom selectors
	 * const table = new TableLocator(page.locator(".divTable"), {
	 *   header: { rowSelector: ".divTableHeading > .divTableRow", columnSelector: ".divTableHead" },
	 *   row: { rowSelector: ".divTableBody > .divTableRow", columnSelector: ".divTableCell" },
	 * });
	 *
	 * @example
	 * // ARIA grid, such as AG Grid or MUI Data Grid
	 * const grid = new TableLocator(page.getByRole("grid"), { aria: true });
	 */
	constructor(root: Locator, options?: TableLocatorOptions<H>) {
		this.root = root;
		this._headers = options?.headers;
		this._config = resolveEngineConfig(options);
		this._loading = options?.loading === undefined ? undefined : resolveRef(options.loading, root);
		const host: NavigationHost = {
			root,
			loading: this._loading,
			fingerprint: timeout => this.fingerprint(timeout),
			waitForStable: stable => this.waitForStable(stable),
		};
		this._navigator = new TableNavigator(host, options?.paginate, options?.scroll);
		this._rowKey = options?.scroll?.rowKey;
	}

	/**
	 * The footer rows of the table, such as a totals row, with typed cell access. Footer rows are not body
	 * rows: `rows`, `row()`, `toJson()` and the matchers leave them out.
	 *
	 * @example
	 * await expect(orders.footer.cell("Total")).toHaveText("€ 1,295.75");
	 */
	get footer(): TableRow<H> {
		const rows = this.root.locator(this.selector({ op: "footer", cfg: this._config }));
		return new TableRow(this, described(rows, `${this.root.toString()}.footer`));
	}

	/**
	 * All body rows of the table.
	 *
	 * @example
	 * await expect(table.rows.locator).toHaveCount(3);
	 *
	 * @example
	 * // Compose with Locator.filter and keep typed cell access
	 * await expect(table.rows.filter({ hasText: "Jane" }).cell("Status")).toHaveText("Active");
	 */
	get rows(): TableRow<H> {
		const rows = this.root.locator(this.selector({ op: "rows", cfg: this._config }));
		return new TableRow(this, described(rows, `${this.root.toString()}.rows`));
	}

	/**
	 * Body rows where every condition matches. Conditions are keyed by header; values are an exact
	 * string, a RegExp, or a {@link CellCondition}. Cell text is compared as the user sees it (see
	 * {@link CellCondition}), and header names are normalized like header text.
	 *
	 * The returned locator follows Playwright's strict mode: acting on it when several rows match throws.
	 *
	 * @param where - At least one condition. Unknown headers are compile-time errors.
	 * @returns A {@link TableRow} for the matching rows.
	 * @throws Error if no condition has a value.
	 *
	 * @example
	 * await expect(table.row({ Name: "John", Status: /active/i }).cell("Email")).toHaveText("john@example.com");
	 *
	 * @example
	 * // Declarative conditions
	 * await table.row({ Name: { startsWith: "Jo" }, Remarks: { empty: true } }).cell("Actions").click();
	 */
	row<W extends RowWhere<H>>(where: W & ValidRowWhere<H, W>): TableRow<H> {
		return this.matchingRows(where);
	}

	/** {@link row}, without the compile-time checks of the conditions. */
	private matchingRows(where: RowWhere<string>): TableRow<H> {
		const conditions = serializeWhere(where);
		if (conditions.length === 0) {
			throw new Error(`TableLocator.row() requires at least one condition.\nTable locator: ${this.root.toString()}`);
		}
		const rows = this.root.locator(this.selector({ op: "row", cfg: this._config, where: conditions }));
		return new TableRow(this, described(rows, `${this.root.toString()}.row(${describeWhere(where)})`));
	}

	/**
	 * The body row at `index`.
	 *
	 * @param index - The row number (0-based).
	 * @returns A {@link TableRow} for the row.
	 * @throws Error if index is not a non-negative integer.
	 *
	 * @example
	 * await expect(table.rowAt(0).cell("Name")).toHaveText("John");
	 */
	rowAt(index: number): TableRow<H> {
		if (index < 0 || !Number.isInteger(index)) {
			throw new Error(`Row index must be a non-negative integer, got: ${index}`);
		}
		const row = this.root.locator(this.selector({ op: "rows", cfg: this._config })).nth(index);
		return new TableRow(this, described(row, `${this.root.toString()}.rowAt(${index})`));
	}

	/**
	 * The cell under `column` for any row locator, for example one built with `filter()` or `nth()`.
	 *
	 * @param row - A locator for one or more body rows of this table.
	 * @param column - The header key of the column, or its 0-based index (also works without header rows).
	 * @returns A Playwright Locator for the cell.
	 * @throws Error if column is a number that is not a non-negative integer.
	 *
	 * @example
	 * const lastRow = table.rows.locator.last();
	 * await expect(table.cell(lastRow, "Name")).toHaveText("Jane");
	 */
	cell(row: Locator, column: ColumnKey<H>): Locator {
		const header = resolveColumn(column);
		// The engine finds the cell from the row alone, so it can't tell which table the row was meant to
		// be in. Intersecting with this table's column keeps it from resolving through another table.
		const cell = row
			.locator(this.selector({ op: "cell", cfg: this._config, header }))
			.and(this.root.locator(this.selector({ op: "column", cfg: this._config, header, f: 1 })));
		return described(cell, `${row.toString()}.cell(${JSON.stringify(column)})`);
	}

	/**
	 * All body cells under `column`. A cell spanning several rows is included once.
	 *
	 * @param column - The header key of the column, or its 0-based index (also works without header rows).
	 * @returns A Playwright Locator for the cells.
	 * @throws Error if column is a number that is not a non-negative integer.
	 *
	 * @example
	 * await expect(table.column("Status")).toHaveText(["Active", "Inactive", "Active"]);
	 * await expect(table.column(1)).toHaveText(["Active", "Inactive", "Active"]);
	 */
	column(column: ColumnKey<H>): Locator {
		const cells = this.root.locator(this.selector({ op: "column", cfg: this._config, header: resolveColumn(column) }));
		return described(cells, `${this.root.toString()}.column(${JSON.stringify(column)})`);
	}

	/**
	 * The header cell element for `column` in the main header row.
	 *
	 * @param column - The header key of the column, or its 0-based index.
	 * @returns A Playwright Locator for the header cell.
	 * @throws Error if column is a number that is not a non-negative integer.
	 *
	 * @example
	 * await table.header("Name").click(); // sort by name
	 */
	header(column: ColumnKey<H>): Locator {
		const cell = this.root.locator(this.selector({ op: "header", cfg: this._config, header: resolveColumn(column) }));
		return described(cell, `${this.root.toString()}.header(${JSON.stringify(column)})`);
	}

	/**
	 * Reads the current header keys of the main header row, exactly as the engine resolves them
	 * (including `__C`/`__D` suffixes and `{{Empty}}`). This is a snapshot, not a locator.
	 *
	 * @param options - Optional timeout for waiting until the table element is attached.
	 * @returns A promise that resolves to the header keys, or an empty array if there are no header rows.
	 *
	 * @example
	 * expect(await table.headerKeys()).toEqual(["Name", "Status", "Email"]);
	 */
	async headerKeys(options?: { timeout?: number }): Promise<string[]> {
		const request: EngineKeysRequest = { op: "keys", cfg: this._config };
		return this.root.evaluate(readTableHeaderKeys, request, options);
	}

	/**
	 * Reads every body row as an object keyed by header key, like `PlaywrightTable.getJson()`. Cells that
	 * span rows or columns are repeated in every position they cover; positions without a cell are `""`.
	 * Cell text is normalized as in row conditions: line breaks stay as one `\n` between trimmed lines.
	 * With `raw: true`, cells are returned exactly as the browser reads them.
	 *
	 * This is a snapshot, not a locator: without `minRows` or `stable` it reads the table once and does not
	 * wait for rows. With `minRows`, it first waits for a header row and at least that many body rows with
	 * content (a row where at least one cell has text), so empty placeholder rows don't count. With
	 * `stable`, it then waits until the table stops changing (see {@link waitForStable}). To wait for
	 * specific content, assert first (for example with `toHaveRow` or `toHaveRows`).
	 *
	 * @param options - Optional settings. See {@link TableJsonOptions}.
	 * @param options.columns - (Optional) Only these columns, in this order. Defaults to every column.
	 * @param options.parse - (Optional) Typed values for some columns: `"number"`, `"date"` or a function.
	 * @param options.decimal - (Optional) The decimal separator of `"number"` columns. Defaults to `"."`.
	 * @param options.minRows - (Optional) Wait for at least this many body rows with content. Defaults to `0` (no waiting).
	 * @param options.stable - (Optional) Wait until the table stops changing before reading it. Defaults to `false`.
	 * @param options.timeout - (Optional) With `minRows` or `stable`, the time to wait in milliseconds (default 5000).
	 *   Without them, the time to wait for the table element to be attached.
	 * @param options.raw - (Optional) Return the cell texts without normalization. Defaults to `false`.
	 * @returns A promise that resolves to one object per body row, or an empty array if there are no body rows.
	 * @throws Error if the table has no header row (without `minRows`).
	 * @throws Error if a key of `columns` or `parse` is not a header key of the table, with the available headers.
	 * @throws Error if a cell of a `parse` column cannot be parsed, with the row, the column and the text.
	 * @throws Error if `minRows` is not reached, or the table doesn't become stable, within the timeout.
	 * @throws Error if `minRows` is not a non-negative integer.
	 *
	 * @example
	 * expect(await users.toJson()).toEqual([
	 *   { Name: "John", Status: "Active" },
	 *   { Name: "Jane", Status: "Inactive" },
	 * ]);
	 *
	 * @example
	 * // Wait until at least one row is loaded
	 * const data = await users.toJson({ minRows: 1 });
	 *
	 * @example
	 * // Some columns, with typed values: { Id: string; Total: number | null }[]
	 * const totals = await orders.toJson({ columns: ["Id", "Total"], parse: { Total: "number" } });
	 */
	async toJson<const C extends HeaderKey<H> = HeaderKey<H>, const P extends ColumnParsers<C> = Record<never, never>>(
		options?: TableJsonOptions<C, P>
	): Promise<TableJsonRow<C, P>[]> {
		const columns: readonly string[] | undefined = options?.columns;
		const { keys, rows } = await this.readJsonTexts(options ?? {}, columns);
		const outputKeys = columns ?? keys;
		const parsers: [string, ColumnParser | undefined][] = Object.entries(options?.parse ?? {});
		this.checkJsonColumns(keys, outputKeys, columns ?? [], parsers);

		const decimal = options?.decimal ?? ".";
		const result = rows.map((cells, r) => {
			const row: Record<string, unknown> = {};
			outputKeys.forEach((key, index) => {
				row[key] = cells[index] ?? "";
			});
			for (const [key, parser] of parsers) {
				if (parser !== undefined) row[key] = parseCell(parser, String(row[key]), decimal, r, key);
			}
			return row;
		});
		// The values are built from `columns` and `parse`, exactly as `TableJsonRow` describes them.
		return result as TableJsonRow<C, P>[];
	}

	/**
	 * Reads the text of every body cell under `column`, one per body row. A cell that spans rows is
	 * repeated in every row it covers; a row without a cell there reads as `""`. Text is normalized as in
	 * row conditions.
	 *
	 * This is a snapshot, not a locator: it reads the table once. To wait for content, assert first, or
	 * use `toHaveColumnValues`.
	 *
	 * @param column - The header key of the column, or its 0-based index (also works without header rows).
	 * @param options - Optional timeout for waiting until the table element is attached.
	 * @returns A promise that resolves to the cell texts, or an empty array if there are no body rows.
	 * @throws Error if the table has no such column, with the available headers.
	 *
	 * @example
	 * expect(await users.columnValues("Status")).toEqual(["Active", "Inactive", "Active"]);
	 *
	 * @example
	 * // The distinct values of a column
	 * const statuses = new Set(await users.columnValues("Status"));
	 */
	async columnValues(column: ColumnKey<H>, options?: { timeout?: number }): Promise<string[]> {
		const request: EngineValuesRequest = { op: "values", cfg: this._config, column: resolveColumn(column) };
		const { keys, values } = await this.root.evaluate(readColumnValues, request, options);
		if (values === null) {
			throw new Error(
				`TableLocator.columnValues(): ` +
					(typeof column === "number" ? `column ${column} does not exist.` : `Header "${column}" not found.`) +
					`\nAvailable headers: [${keys.join(", ")}]\n` +
					`Table locator: ${this.root.toString()}`
			);
		}
		return values;
	}

	/**
	 * Waits until the table stops changing: the header keys and the text of every body cell stay the same
	 * for `quiet` milliseconds, and the `loading` indicator (if any) is hidden. Use it after an action that
	 * refreshes the table (searching, filtering, paging, sorting) before you read it with a snapshot method
	 * such as {@link toJson}.
	 *
	 * Locators and the table matchers retry by themselves and don't need it. A table that has not started
	 * to refresh yet looks stable, so pass `loading` when the table shows an indicator while it loads.
	 *
	 * @param options - Optional settings. See {@link StableOptions}.
	 * @param options.quiet - (Optional) How long nothing may change, in milliseconds. Defaults to 500.
	 * @param options.timeout - (Optional) The time to wait in milliseconds. Defaults to 5000.
	 * @param options.loading - (Optional) A loading indicator that must be hidden. Defaults to the `loading` option of the table.
	 * @returns A promise that resolves once the table is stable.
	 * @throws Error if the table is not stable within the timeout: it kept changing, the loading indicator
	 *   stayed visible, or the table could not be read.
	 *
	 * @example
	 * await page.getByLabel("Search").fill("Jo");
	 * await users.waitForStable({ loading: page.locator(".spinner") });
	 * const rows = await users.toJson();
	 */
	async waitForStable(options?: StableOptions): Promise<void> {
		const quiet = options?.quiet ?? 500;
		const timeout = options?.timeout ?? 5_000;
		if (!(quiet >= 0) || !Number.isFinite(quiet)) {
			throw new Error(`quiet must be a non-negative number, got: ${quiet}`);
		}
		const loading = this.resolveLoading(options?.loading);
		const request: EngineFingerprintRequest = { op: "fingerprint", cfg: this._config };
		const deadline = Date.now() + timeout;
		const state: StableState = { last: undefined, since: Date.now(), changes: 0, rows: undefined, busy: false };
		let error: unknown;
		// Sample often enough that a change within the quiet period is seen.
		const interval = Math.max(20, Math.min(100, quiet / 4));
		for (;;) {
			try {
				const readTimeout = Math.max(MIN_READ_TIMEOUT, deadline - Date.now());
				const print = await this.root.evaluate(readTableFingerprint, request, { timeout: readTimeout });
				const busy = loading !== undefined && (await isShown(loading));
				error = undefined;
				if (observe(state, print, busy, quiet)) return;
			} catch (readError) {
				error = readError;
				state.last = undefined;
			}
			const left = deadline - Date.now();
			if (left <= 0) break;
			await new Promise(resolve => setTimeout(resolve, Math.min(interval, left)));
		}

		throw new Error(
			`TableLocator.waitForStable() timed out after ${timeout}ms: ${describeUnstable(state, quiet)}.\n` +
				(state.rows === undefined ? "" : `Body rows: ${state.rows}\n`) +
				(loading === undefined ? "" : `Loading locator: ${loading.toString()}\n`) +
				describeLastError(error) +
				`Table locator: ${this.root.toString()}`
		);
	}

	/**
	 * Finds a body row on any page or scroll position: it searches the rows in view, then (with the
	 * `paginate` and `scroll` options) goes through the pages from the first one (with `paginate.first`)
	 * and scrolls each page from the top, until a row matches. The table is left showing that row, and the
	 * returned row locator resolves to it.
	 *
	 * Without `paginate` and `scroll`, it waits until a row in view matches, like a locator.
	 *
	 * @param where - At least one condition, as for {@link row}.
	 * @param options - Optional timeout for the whole search, in milliseconds. Defaults to 30000.
	 * @returns A promise that resolves to the {@link TableRow} for `row(where)`.
	 * @throws Error if no row matches on any page (or within `paginate.maxPages` and `scroll.maxSteps`), with
	 * the number of pages and scroll steps searched, and whether the search stopped early at the timeout.
	 *
	 * @example
	 * const orders = defineTable(page.getByRole("grid"), {
	 *   aria: true,
	 *   paginate: { next: page.getByRole("button", { name: "Next page" }) },
	 * });
	 * const row = await orders.findRow({ Id: "1042" });
	 * await row.cell("Status").click();
	 */
	async findRow<W extends RowWhere<H>>(
		where: W & ValidRowWhere<H, W>,
		options?: NavigationOptions
	): Promise<TableRow<H>> {
		const row = this.matchingRows(where);
		const request: EngineFindRequest = { op: "find", cfg: this._config, where: serializeWhere(where) };
		const timeout = options?.timeout ?? 30_000;
		const deadline = Date.now() + timeout;
		const matches = async (readTimeout: number): Promise<boolean> =>
			(await this.root.evaluate(findTableRows, request, { timeout: readTimeout })).matches > 0;

		const now = await pollUntil(
			matches,
			found => found || this._navigator.active,
			false,
			this._navigator.active ? Date.now() : deadline
		);
		if (now.value) return row;
		let last: NavigationPosition = { page: 0, step: 0 };
		// Why the search ended before the end of the table, if it did
		let stopped = "";
		let lastError = now.error;
		const timedOut = ", and timed out before the end of the table. Pass a larger timeout to search further";
		if (this._navigator.active) {
			try {
				for await (const position of this._navigator.positions(deadline)) {
					last = position;
					if (await matches(Math.max(MIN_READ_TIMEOUT, deadline - Date.now()))) return row;
					if (Date.now() >= deadline) {
						stopped = timedOut;
						break;
					}
				}
			} catch (error) {
				// A wait inside the navigation that ran out of time: report the timeout, with that error
				if (Date.now() < deadline) throw error;
				stopped = timedOut;
				lastError = error;
			}
		}
		throw new Error(
			`TableLocator.findRow() found no row matching ${describeWhere(where)}` +
				(this._navigator.active
					? ` on ${last.page + 1} page${last.page === 0 ? "" : "s"} (${last.step} scroll steps on the last page` +
						`${this._navigator.limitsReached(last)})`
					: "") +
				`${stopped}.\n` +
				describeLastError(lastError) +
				`Table locator: ${this.root.toString()}\n` +
				`Timeout: ${timeout}ms`
		);
	}

	/**
	 * The number of body rows in the whole table, also the rows that are not rendered or are on other pages.
	 *
	 * - A grid with `aria-rowcount` (on the root, inside it or around it) declares it: `aria-rowcount` minus
	 *   the rows it counts that are not body rows, such as header rows.
	 * - Otherwise, with the `paginate` or `scroll` option, every row is read, as `toJson({ allRows: true })` does.
	 * - Otherwise, the number of body rows.
	 *
	 * @param options - Optional timeout, in milliseconds. Defaults to 30000.
	 * @returns A promise that resolves to the number of body rows.
	 * @throws Error if it reads every row and the timeout passes before the end of the table.
	 *
	 * @example
	 * expect(await grid.totalRowCount()).toBe(200);
	 */
	async totalRowCount(options?: NavigationOptions): Promise<number> {
		const timeout = options?.timeout ?? 30_000;
		const deadline = Date.now() + timeout;
		const request: EngineTotalRequest = { op: "total", cfg: this._config };
		const total = await this.root.evaluate(readTableTotal, request, { timeout });
		if (total.ariaRowCount !== null) return Math.max(0, total.ariaRowCount - total.otherRows);
		if (!this._navigator.active) return total.bodyRows;
		return (await this.readAllTexts(false, undefined, { caller: "totalRowCount()", timeout, deadline })).rows.length;
	}

	/**
	 * The body rows in view as an aligned text table, with the row index in front, for logs and debugging.
	 * Cells longer than 30 characters are cut off, and line breaks show as `↵`.
	 *
	 * @param options - Optional settings.
	 * @param options.columns - (Optional) Only these columns. Unknown columns are skipped; if none is known,
	 * every column is shown. Defaults to every column.
	 * @param options.maxRows - (Optional) The most rows to show. Defaults to 50.
	 * @param options.timeout - (Optional) The time to wait for the table, in milliseconds.
	 * @returns A promise that resolves to the table as text.
	 *
	 * @example
	 * console.log(await users.format());
	 * //   # | Name | Status
	 * //   0 | John | Active
	 * //   1 | Jane | Inactive
	 */
	async format(options?: { columns?: readonly ColumnKey<H>[]; maxRows?: number; timeout?: number }): Promise<string> {
		const texts = await this.readTexts(false, undefined, { timeout: options?.timeout });
		return formatRows(texts, { columns: options?.columns, maxRows: options?.maxRows ?? 50 });
	}

	/**
	 * Waits until every expected header exists, and fails fast with the available headers if they don't.
	 *
	 * @param expected - The headers to check. Defaults to the `headers` option of this table.
	 * @param options - Optional timeout in milliseconds. Defaults to 5000.
	 * @returns A promise that resolves once all headers exist.
	 * @throws Error listing the missing and available headers when the timeout is reached.
	 * @throws Error if there are no headers to check.
	 *
	 * @example
	 * const users = new TableLocator(page.locator("table"), { headers: ["Name", "Status"] });
	 * await users.validateHeaders();
	 * // Error: Missing headers: [Status]
	 * //        Available headers: [Name, State]
	 */
	async validateHeaders(expected?: readonly HeaderKey<H>[], options?: { timeout?: number }): Promise<void> {
		const required: readonly string[] = expected ?? this._headers ?? [];
		if (required.length === 0) {
			throw new Error(
				"TableLocator.validateHeaders() needs headers: pass them as an argument or set `headers` in the options."
			);
		}

		const timeout = options?.timeout ?? 5_000;
		const missingFrom = (keys: readonly string[]): string[] =>
			required.filter(header => !keys.includes(normalizeLine(header)));
		const poll = await pollUntil(
			readTimeout => this.headerKeys({ timeout: readTimeout }),
			keys => missingFrom(keys).length === 0,
			[] as string[],
			Date.now() + timeout
		);
		const missing = missingFrom(poll.value);
		if (missing.length > 0) {
			throw new Error(
				`Missing headers: [${missing.join(", ")}]\n` +
					`Available headers: [${poll.value.join(", ")}]\n` +
					describeLastError(poll.error) +
					`Table locator: ${this.root.toString()}`
			);
		}
	}

	/** The texts for `toJson()`: read once, or after waiting for `minRows` and `stable`. */
	private async readJsonTexts(
		options: TableJsonOptions<string, unknown>,
		columns: readonly string[] | undefined
	): Promise<EngineTexts> {
		const minRows = checkMinRows(options.minRows);
		const raw = options.raw === true;
		// Each wait gets the whole timeout; reading all rows has its own, longer default.
		const timeout = options.timeout ?? 5_000;
		const stable = options.stable === false ? undefined : options.stable;
		let texts: EngineTexts | undefined;
		if (minRows > 0) {
			texts = await this.readTextsWithRows(minRows, timeout, raw, columns);
		}
		if (stable !== undefined) {
			await this.waitForStable({ timeout, ...(stable === true ? {} : stable) });
		}
		if (texts === undefined || stable !== undefined) {
			texts = await this.readTexts(raw, columns, { timeout: stable === undefined ? options.timeout : timeout });
		}
		if (texts.keys.length === 0) {
			const selector = this._config.headerRow;
			throw new Error(
				`TableLocator.toJson() needs a header row, but the table has none.\n` +
					(selector === undefined ? "" : `Header row selector: "${selector}"\n`) +
					`Table locator: ${this.root.toString()}`
			);
		}
		if (options.allRows !== true) return texts;
		const allRowsTimeout = options.timeout ?? 30_000;
		return this.readAllTexts(raw, columns, {
			caller: "toJson({ allRows: true })",
			timeout: allRowsTimeout,
			deadline: Date.now() + allRowsTimeout,
		});
	}

	/**
	 * Checks the `columns` and `parse` options of `toJson()` against the header keys of the table.
	 * @throws Error with the available headers if a key is not a header key, or a `parse` key is not in `columns`.
	 */
	private checkJsonColumns(
		keys: readonly string[],
		outputKeys: readonly string[],
		columns: readonly string[],
		parsers: readonly [string, unknown][]
	): void {
		const parseKeys = parsers.map(([key]) => key);
		const unknown = [
			...columns.filter(key => !keys.includes(normalizeLine(key))),
			...parseKeys.filter(key => !outputKeys.includes(key) && !keys.includes(key)),
		];
		if (unknown.length > 0) {
			throw new Error(
				`TableLocator.toJson(): ${unknown.map(key => `Header "${key}" not found.`).join(" ")}\n` +
					`Available headers: [${keys.join(", ")}]\n` +
					`Table locator: ${this.root.toString()}`
			);
		}
		const notSelected = parseKeys.filter(key => !outputKeys.includes(key));
		if (notSelected.length > 0) {
			throw new Error(
				`TableLocator.toJson(): parse has headers that are not in columns: [${notSelected.join(", ")}]\n` +
					`Columns: [${outputKeys.join(", ")}]\n` +
					`Table locator: ${this.root.toString()}`
			);
		}
	}

	/** The loading indicator for `loading`, or else the `loading` option of the table. */
	private resolveLoading(loading: LocatorRef | undefined): Locator | undefined {
		return loading === undefined ? this._loading : resolveRef(loading, this.root);
	}

	/** A fingerprint of the header keys and body cell texts. */
	private async fingerprint(timeout: number): Promise<string> {
		const request: EngineFingerprintRequest = { op: "fingerprint", cfg: this._config };
		const print = await this.root.evaluate(readTableFingerprint, request, { timeout });
		return `${print.rows}|${print.hash}`;
	}

	/**
	 * Reads every row on every page and scroll position. Rows are told apart by their key per page, and
	 * ordered by their index when every row has one. Header keys are merged across positions, so a grid
	 * that renders only some columns at a time still gets every column it showed.
	 *
	 * @throws Error if the deadline passes before every row is read (up to `paginate.maxPages` and
	 * `scroll.maxSteps`), so part of the rows is never returned as all of them.
	 */
	private async readAllTexts(
		raw: boolean,
		columns: readonly string[] | undefined,
		read: { caller: string; timeout: number; deadline: number }
	): Promise<EngineTexts> {
		const { caller, timeout, deadline } = read;
		const request: EngineWindowRequest = { op: "window", cfg: this._config };
		if (raw) request.raw = true;
		if (columns !== undefined) request.columns = [...columns];
		if (this._rowKey !== undefined) request.rowKey = this._rowKey;

		const keys: string[] = [];
		const rows: Record<string, string>[] = [];
		let page: Map<string, { index: number | null; cells: Record<string, string> }> = new Map();
		let pageNumber = 0;
		const flush = (): void => {
			const entries = [...page.values()];
			if (entries.every(entry => entry.index !== null)) {
				entries.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
			}
			rows.push(...entries.map(entry => entry.cells));
			page = new Map();
		};
		const progress = (): string =>
			`${rows.length + page.size} rows were read, on ${pageNumber + 1} page${pageNumber === 0 ? "" : "s"}`;
		let timedOut = false;
		let lastError: unknown;
		try {
			for await (const position of this._navigator.positions(deadline)) {
				// The navigation moved on, so there are rows left to read
				if (Date.now() >= deadline) {
					timedOut = true;
					break;
				}
				if (position.page !== pageNumber) {
					flush();
					pageNumber = position.page;
				}
				const window = await this.root.evaluate(readTableWindow, request, {
					timeout: Math.max(MIN_READ_TIMEOUT, deadline - Date.now()),
				});
				mergeWindow(window, columns, keys, page);
			}
		} catch (error) {
			// A wait inside the navigation that ran out of time: report the timeout, with that error
			if (Date.now() < deadline) throw error;
			timedOut = true;
			lastError = error;
		}
		if (timedOut) {
			throw new Error(
				`TableLocator.${caller} timed out after ${timeout}ms before reading every row; ${progress()}. ` +
					`Pass a larger timeout.\n` +
					describeLastError(lastError) +
					`Table locator: ${this.root.toString()}`
			);
		}
		flush();
		const names = columns ?? keys;
		return { keys, rows: rows.map(cells => names.map(name => cells[name] ?? "")) };
	}

	private readTexts(
		raw: boolean,
		columns: readonly string[] | undefined,
		options?: { timeout?: number }
	): Promise<EngineTexts> {
		const request: EngineTextsRequest = { op: "texts", cfg: this._config };
		if (raw) request.raw = true;
		if (columns !== undefined) request.columns = [...columns];
		return this.root.evaluate(readTableTexts, request, options);
	}

	/** Reads the table once it has a header row and at least `minRows` body rows with content. */
	private async readTextsWithRows(
		minRows: number,
		timeout: number,
		raw: boolean,
		columns: readonly string[] | undefined
	): Promise<EngineTexts> {
		// Raw texts are normalized to decide, so a cell with only a non-breaking space or a glyph is empty.
		const withContent = (texts: EngineTexts): number =>
			texts.rows.filter(row => row.some(text => normalizeCell(text) !== "")).length;
		const poll = await pollUntil(
			readTimeout => this.readTexts(raw, columns, { timeout: readTimeout }),
			texts => texts.keys.length > 0 && withContent(texts) >= minRows,
			{ keys: [], rows: [] },
			Date.now() + timeout
		);
		const texts = poll.value;
		if (texts.keys.length > 0 && withContent(texts) >= minRows) return texts;

		const found =
			texts.keys.length === 0
				? "the table has no header row"
				: `found ${withContent(texts)} (${texts.rows.length} body rows in total)`;
		throw new Error(
			`TableLocator.toJson() expected at least ${minRows} body rows with content, ${found}.\n` +
				`Header keys: [${texts.keys.join(", ")}]\n` +
				describeLastError(poll.error) +
				`Table locator: ${this.root.toString()}\n` +
				`Timeout: ${timeout}ms`
		);
	}

	private selector(query: EngineQuery): string {
		return `${TABLE_SELECTOR_ENGINE_NAME}=${JSON.stringify(query)}`;
	}
}

/**
 * Creates a {@link TableLocator}. Header names passed in `options.headers` are inferred as literal
 * types, so header arguments are checked and autocompleted.
 *
 * @param root - The Playwright `Locator` pointing to the root table element.
 * @param options - Optional configuration. See {@link TableLocatorOptions}.
 * @returns A new {@link TableLocator}.
 *
 * @example
 * const users = defineTable(page.locator("#users"), { headers: ["Name", "Status", "Email"] });
 * await expect(users.row({ Name: "John" }).cell("Email")).toHaveText("john@example.com");
 * // @ts-expect-error "Nme" is not a header of this table
 * users.row({ Nme: "John" });
 */
export function defineTable<const H extends string = string>(
	root: Locator,
	options?: TableLocatorOptions<H>
): TableLocator<H> {
	return new TableLocator<H>(root, options);
}

/**
 * The engine configuration for `options`. Only what differs from the defaults is set, so selectors stay
 * short; the engine fills in the default selectors.
 */
function resolveEngineConfig(options: TableLocatorOptions<string> = {}): EngineConfig {
	const { header = {}, row = {} } = options;
	TableUtils.warnOnIdenticalRowSelectors("TableLocator", header.rowSelector, row.rowSelector);
	const cfg: EngineConfig = {};
	if (options.aria === true) cfg.aria = 1;
	if (header.rowSelector !== undefined) cfg.headerRow = header.rowSelector;
	if (header.columnSelector !== undefined) cfg.headerCell = header.columnSelector;
	if (row.rowSelector !== undefined) cfg.bodyRow = row.rowSelector;
	if (row.columnSelector !== undefined) cfg.bodyCell = row.columnSelector;
	if (header.setMainHeaderRow !== undefined) cfg.mainHeaderRow = header.setMainHeaderRow;
	if (options.cellContentType === CellContentType.TextContent) cfg.textContent = 1;
	if (options.ignore !== undefined) cfg.ignore = [...options.ignore];
	if (options.footer?.rowSelector !== undefined) cfg.footerRow = options.footer.rowSelector;
	return cfg;
}

/** What `waitForStable()` has seen so far. */
type StableState = {
	/** The last fingerprint, or `undefined` while the table is loading or could not be read. */
	last: string | undefined;
	/** When the last fingerprint was first seen. */
	since: number;
	/** How often the fingerprint changed. */
	changes: number;
	/** The number of body rows of the last read, or `undefined` if no read succeeded. */
	rows: number | undefined;
	/** Whether the loading indicator was visible at the last read. */
	busy: boolean;
};

/** Records a read in `state`. Returns whether the table has stayed the same for `quiet` milliseconds. */
function observe(state: StableState, print: EngineFingerprint, busy: boolean, quiet: number): boolean {
	state.rows = print.rows;
	state.busy = busy;
	const current = busy ? undefined : `${print.rows}|${print.hash}`;
	if (current !== undefined && current === state.last) return Date.now() - state.since >= quiet;
	if (state.last !== undefined) state.changes++;
	state.last = current;
	state.since = Date.now();
	return false;
}

/** Why `waitForStable()` timed out. */
function describeUnstable(state: StableState, quiet: number): string {
	if (state.rows === undefined) return "the table could not be read";
	if (state.busy) return "the loading indicator is still visible";
	if (state.changes > 0) return `the table kept changing (${state.changes} changes seen)`;
	return `it did not stay the same for ${quiet}ms`;
}

/** `minRows` of `toJson()`, checked. */
function checkMinRows(minRows: number | undefined): number {
	const value = minRows ?? 0;
	if (value < 0 || !Number.isInteger(value)) {
		throw new Error(`minRows must be a non-negative integer, got: ${value}`);
	}
	return value;
}

/** Whether any element of `locator` is visible. Doesn't wait, and works when it matches several elements. */
async function isShown(locator: Locator): Promise<boolean> {
	const count = await locator.count();
	for (let i = 0; i < count; i++) {
		if (await locator.nth(i).isVisible()) return true;
	}
	return false;
}

/**
 * The value of a cell of a `parse` column of `toJson()`.
 * @throws Error with the row, the column and the text if the cell cannot be parsed.
 */
function parseCell(parser: ColumnParser, text: string, decimal: DecimalSeparator, row: number, key: string): unknown {
	const fail = (problem: string): Error =>
		new Error(`TableLocator.toJson(): row ${row} "${key}" (${JSON.stringify(text)}) ${problem}`);
	if (typeof parser === "function") {
		try {
			return parser(text);
		} catch (error) {
			throw fail(`could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	if (text.trim() === "") return null;
	if (parser === "number") {
		const value = parseNumber(text, decimal);
		if (isNaN(value)) throw fail(`is not a number (decimal separator "${decimal}")`);
		return value;
	}
	const time = Date.parse(text);
	if (isNaN(time)) throw fail("is not a date (parsed with Date.parse)");
	return new Date(time);
}

/** A column for the engine: a header name normalized like header text, or a checked column index. */
function resolveColumn(column: string | number): string | number {
	if (typeof column === "string") return normalizeLine(column);
	if (column < 0 || !Number.isInteger(column)) {
		throw new Error(`Column index must be a non-negative integer, got: ${column}`);
	}
	return column;
}

/**
 * `locator`, described as `description` in error messages, the call log and traces. `describe()` exists
 * since Playwright 1.53; on older versions the locator is returned as it is.
 */
function described(locator: Locator, description: string): Locator {
	// Through `unknown`, so this also compiles against the types of Playwright versions without `describe()`
	const describe = (locator as unknown as { describe?: (description: string) => Locator }).describe;
	return typeof describe === "function" ? describe.call(locator, description) : locator;
}

/**
 * Adds the rows of one screen of a table to the rows of its page, by row key, so a row seen at several
 * scroll positions is one row. New header keys are added to `keys`.
 */
function mergeWindow(
	window: EngineWindow,
	columns: readonly string[] | undefined,
	keys: string[],
	page: Map<string, { index: number | null; cells: Record<string, string> }>
): void {
	const names = columns ?? window.keys;
	for (const key of window.keys) if (!keys.includes(key)) keys.push(key);
	for (const row of window.rows) {
		const cells = page.get(row.key)?.cells ?? {};
		names.forEach((name, index) => {
			cells[name] = row.texts[index] ?? "";
		});
		page.set(row.key, { index: row.index, cells });
	}
}

/** Describes `Locator.filter()` options, such as `{ hasText: "Jane" }`. Locators show their own description. */
function describeFilter(options?: RowFilterOptions): string {
	const entries: [string, unknown][] = Object.entries(options ?? {});
	const parts = entries
		.filter(entry => entry[1] !== undefined)
		.map(([key, value]) => `${key}: ${typeof value === "string" ? JSON.stringify(value) : String(value)}`);
	return parts.length === 0 ? "" : `{ ${parts.join(", ")} }`;
}
