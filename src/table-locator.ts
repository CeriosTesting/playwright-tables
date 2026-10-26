import { Locator } from "@playwright/test";

import { CellContentType } from "./cell-content-type";
import { serializeWhere } from "./cell-matcher-serializer";
import { describeLastError, pollUntil } from "./polling";
import {
	ColumnKey,
	EngineConfig,
	EngineKeysRequest,
	EngineQuery,
	EngineTexts,
	EngineTextsRequest,
	HeaderKey,
	RowWhere,
	TableJsonOptions,
	TableLocatorOptions,
	ValidRowWhere,
} from "./table-locator.types";
import { readTableHeaderKeys, readTableTexts, TABLE_SELECTOR_ENGINE_NAME } from "./table-selector-engine";
import { TableUtils } from "./table-utils";

/** Filter options accepted by `Locator.filter()`. */
export type RowFilterOptions = Parameters<Locator["filter"]>[0];

type DefaultSelectors = Pick<EngineConfig, "headerRow" | "headerCell" | "bodyRow" | "bodyCell">;

/**
 * Header rows of a table without a `<thead>`: the leading rows of its first `<tbody>` that have `<th>`
 * cells and no `<td>`. A row with both (a row header and data) stays a body row.
 */
const TBODY_HEADER_ROW =
	"table:not(:has(> thead)) > tbody:first-of-type > tr:has(> th):not(:has(> td)):not(tr:has(> td) ~ tr)";

/** Default selectors for HTML tables. Row header cells (`<th>` in a body row) are body cells too. */
const HTML_SELECTORS: DefaultSelectors = {
	headerRow: `thead>tr, ${TBODY_HEADER_ROW}`,
	headerCell: "th, td",
	bodyRow: `tbody>tr:not(${TBODY_HEADER_ROW})`,
	bodyCell: "td, th",
};

/** Default selectors for ARIA grids (`role="grid"`, `"treegrid"` or `"table"` built from other elements). */
const ARIA_SELECTORS: DefaultSelectors = {
	headerRow: "[role=row]:has([role=columnheader])",
	headerCell: "[role=columnheader]",
	bodyRow: "[role=row]:not(:has([role=columnheader]))",
	bodyCell: "[role=gridcell], [role=cell], [role=rowheader]",
};

/**
 * One or more body rows of a {@link TableLocator}, with typed access to their cells.
 *
 * Instances are created by {@link TableLocator.row}, {@link TableLocator.rowAt} and {@link TableLocator.rows}.
 *
 * @example
 * const row = table.row({ Name: "John" });
 * await expect(row.locator).toBeVisible();
 * await expect(row.cell("Status")).toHaveText("Active");
 */
export class TableRow<H extends string = string> {
	/**
	 * @param table - The table this row belongs to.
	 * @param locator - The Playwright `Locator` for the row element(s).
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
		return new TableRow(this.table, this.locator.first());
	}

	/**
	 * The last of these rows, with typed cell access.
	 *
	 * @example
	 * await expect(table.rows.last().cell("Name")).toHaveText("Jane");
	 */
	last(): TableRow<H> {
		return new TableRow(this.table, this.locator.last());
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
		return new TableRow(this.table, this.locator.nth(index));
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
		return new TableRow(this.table, this.locator.filter(options));
	}
}

/**
 * A type-safe table API that only returns Playwright `Locator`s.
 *
 * Header names are resolved to columns inside the browser by the `pw-table-v1` selector engine on every
 * evaluation, so every locator auto-waits for late headers and rows, and keeps working when columns are
 * reordered at runtime. Building locators is synchronous.
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
	 * @param options.header.stripIconGlyphs - (Optional) Remove icon font glyphs from header text. Defaults to `false`.
	 * @param options.row.rowSelector - (Optional) CSS selector for body rows. Defaults to `"tbody>tr"`, without those header rows.
	 * @param options.row.columnSelector - (Optional) CSS selector for body cells. Defaults to `"td, th"`.
	 * @param options.cellContentType - (Optional) How cell text is read. Defaults to `InnerText`.
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
		return new TableRow(this, this.root.locator(this.selector({ op: "rows", cfg: this._config })));
	}

	/**
	 * Body rows where every condition matches. Conditions are keyed by header; values are an exact
	 * string, a RegExp, or a {@link CellCondition}. Cell text is whitespace-collapsed and trimmed.
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
		const conditions = serializeWhere(where);
		if (conditions.length === 0) {
			throw new Error(`TableLocator.row() requires at least one condition.\nTable locator: ${this.root.toString()}`);
		}
		return new TableRow(this, this.root.locator(this.selector({ op: "row", cfg: this._config, where: conditions })));
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
		return new TableRow(this, this.rows.locator.nth(index));
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
		const header = checkColumn(column);
		// The engine finds the cell from the row alone, so it can't tell which table the row was meant to
		// be in. Intersecting with this table's column keeps it from resolving through another table.
		return row
			.locator(this.selector({ op: "cell", cfg: this._config, header }))
			.and(this.root.locator(this.selector({ op: "column", cfg: this._config, header })));
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
		return this.root.locator(this.selector({ op: "column", cfg: this._config, header: checkColumn(column) }));
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
		return this.root.locator(this.selector({ op: "header", cfg: this._config, header: checkColumn(column) }));
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
	 * Cell text is whitespace-collapsed and trimmed, as in row conditions.
	 *
	 * This is a snapshot, not a locator: without `minRows` it reads the table once and does not wait for
	 * rows. With `minRows`, it first waits for a header row and at least that many body rows with content
	 * (a row where at least one cell has text), so empty placeholder rows don't count. To wait for specific
	 * content, assert first (for example with `toHaveRow` or `toHaveRows`).
	 *
	 * @param options - Optional settings. See {@link TableJsonOptions}.
	 * @param options.minRows - (Optional) Wait for at least this many body rows with content. Defaults to `0` (no waiting).
	 * @param options.timeout - (Optional) With `minRows`, the time to wait in milliseconds (default 5000).
	 *   Without it, the time to wait for the table element to be attached.
	 * @returns A promise that resolves to one object per body row, or an empty array if there are no body rows.
	 * @throws Error if the table has no header row (without `minRows`).
	 * @throws Error if `minRows` is not reached within the timeout, with the rows that were found.
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
	 */
	async toJson(options?: TableJsonOptions): Promise<Record<HeaderKey<H>, string>[]> {
		const minRows = options?.minRows ?? 0;
		if (minRows < 0 || !Number.isInteger(minRows)) {
			throw new Error(`minRows must be a non-negative integer, got: ${minRows}`);
		}
		const { keys, rows } =
			minRows > 0 ? await this.readTextsWithRows(minRows, options?.timeout ?? 5_000) : await this.readTexts(options);
		if (keys.length === 0) {
			throw new Error(
				`TableLocator.toJson() needs a header row, but the table has none.\n` +
					`Header row selector: "${this._config.headerRow}"\n` +
					`Table locator: ${this.root.toString()}`
			);
		}
		return rows.map(texts => {
			const row: Record<string, string> = {};
			keys.forEach((key, index) => {
				row[key] = texts[index] ?? "";
			});
			return row;
		});
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
		const missingFrom = (keys: readonly string[]): string[] => required.filter(header => !keys.includes(header));
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

	private readTexts(options?: { timeout?: number }): Promise<EngineTexts> {
		const request: EngineTextsRequest = { op: "texts", cfg: this._config };
		return this.root.evaluate(readTableTexts, request, options);
	}

	/** Reads the table once it has a header row and at least `minRows` body rows with content. */
	private async readTextsWithRows(minRows: number, timeout: number): Promise<EngineTexts> {
		const withContent = (texts: EngineTexts): number => texts.rows.filter(row => row.some(text => text !== "")).length;
		const poll = await pollUntil(
			readTimeout => this.readTexts({ timeout: readTimeout }),
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

/** The engine configuration for `options`, with the default selectors filled in. */
function resolveEngineConfig(options: TableLocatorOptions<string> = {}): EngineConfig {
	const { header = {}, row = {} } = options;
	TableUtils.warnOnIdenticalRowSelectors("TableLocator", header.rowSelector, row.rowSelector);
	const defaults = options.aria === true ? ARIA_SELECTORS : HTML_SELECTORS;
	return {
		headerRow: header.rowSelector ?? defaults.headerRow,
		headerCell: header.columnSelector ?? defaults.headerCell,
		bodyRow: row.rowSelector ?? defaults.bodyRow,
		bodyCell: row.columnSelector ?? defaults.bodyCell,
		mainHeaderRow: header.setMainHeaderRow ?? null,
		contentType: options.cellContentType === CellContentType.TextContent ? "textContent" : "innerText",
		stripIconGlyphs: header.stripIconGlyphs === true,
	};
}

function checkColumn(column: string | number): string | number {
	if (typeof column === "number" && (column < 0 || !Number.isInteger(column))) {
		throw new Error(`Column index must be a non-negative integer, got: ${column}`);
	}
	return column;
}
