import { Locator } from "@playwright/test";

import { CellContentType } from "./cell-content-type";
import { describeWhere, serializeWhere } from "./cell-matcher-serializer";
import { describeLastError, MIN_READ_TIMEOUT, pollUntil } from "./polling";
import {
	ColumnKey,
	ColumnParser,
	ColumnParsers,
	DecimalSeparator,
	EngineConfig,
	EngineFingerprint,
	EngineFingerprintRequest,
	EngineKeysRequest,
	EngineQuery,
	EngineTexts,
	EngineTextsRequest,
	EngineValuesRequest,
	HeaderKey,
	RowWhere,
	StableOptions,
	TableJsonOptions,
	TableJsonRow,
	TableLocatorOptions,
	ValidRowWhere,
} from "./table-locator.types";
import {
	normalizeCell,
	normalizeLine,
	parseNumber,
	readColumnValues,
	readTableFingerprint,
	readTableHeaderKeys,
	readTableTexts,
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
			.and(this.root.locator(this.selector({ op: "column", cfg: this._config, header })));
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
	 * @param options.loading - (Optional) A loading indicator that must be hidden.
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
		const loading = options?.loading;
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
		const minRows = options.minRows ?? 0;
		if (minRows < 0 || !Number.isInteger(minRows)) {
			throw new Error(`minRows must be a non-negative integer, got: ${minRows}`);
		}
		const raw = options.raw === true;
		const timeout = options.timeout ?? 5_000;
		const deadline = Date.now() + timeout;
		const stable = options.stable === undefined || options.stable === false ? undefined : options.stable;
		let texts: EngineTexts | undefined;
		if (minRows > 0) {
			texts = await this.readTextsWithRows(minRows, timeout, raw, columns);
		}
		if (stable !== undefined) {
			await this.waitForStable({
				timeout: Math.max(MIN_READ_TIMEOUT, deadline - Date.now()),
				...(stable === true ? {} : stable),
			});
		}
		if (texts === undefined || stable !== undefined) {
			texts = await this.readTexts(raw, columns, {
				timeout: stable === undefined ? options.timeout : MIN_READ_TIMEOUT,
			});
		}
		if (texts.keys.length === 0) {
			const selector = this._config.headerRow;
			throw new Error(
				`TableLocator.toJson() needs a header row, but the table has none.\n` +
					(selector === undefined ? "" : `Header row selector: "${selector}"\n`) +
					`Table locator: ${this.root.toString()}`
			);
		}
		return texts;
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
	const describe = (locator as Partial<Pick<Locator, "describe">>).describe;
	return typeof describe === "function" ? describe.call(locator, description) : locator;
}

/** Describes `Locator.filter()` options, such as `{ hasText: "Jane" }`. Locators show their own description. */
function describeFilter(options?: RowFilterOptions): string {
	const entries: [string, unknown][] = Object.entries(options ?? {});
	const parts = entries
		.filter(entry => entry[1] !== undefined)
		.map(([key, value]) => `${key}: ${typeof value === "string" ? JSON.stringify(value) : String(value)}`);
	return parts.length === 0 ? "" : `{ ${parts.join(", ")} }`;
}
