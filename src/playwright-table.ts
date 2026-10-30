import { Locator } from "@playwright/test";

import { CellContentType } from "./cell-content-type";
import { pollTable, PollingOptions } from "./polling";
import { BodyRow, Cell, HeaderRow } from "./row";
import { CellSource, TableBody } from "./table-body";
import { HeaderRowOptions, TableHeader } from "./table-header";
import { TableUtils } from "./table-utils";

/**
 * Options for loading table data, headers, and rows.
 *
 * @example
 * // Use custom cell content type for body rows and header options
 * const options: TableOptions = {
 *   bodyRowOptions: { cellContentType: CellContentType.TextContent },
 *   headerRowOptions: {
 *     colspan: { enabled: true, suffix: true },
 *     duplicateSuffix: true,
 *     emptyCellReplacement: false,
 *   },
 * };
 * await table.getBodyRows(options);
 */
export type TableOptions = {
	/** See {@link HeaderRowOptions} for available options. */
	headerRowOptions?: HeaderRowOptions;
	/** Options for parsing body rows. */
	bodyRowOptions?: { cellContentType?: CellContentType };
	/** @deprecated Use `bodyRowOptions.cellContentType` instead. */
	cellContentType?: CellContentType;
};

/** Fallbacks for header row options the caller did not set. */
type HeaderRowOptionDefaults = {
	defaultColspanEnabled?: boolean;
	defaultColspanSuffix?: boolean;
	defaultDuplicateSuffix?: boolean;
	defaultEmptyCellReplacement?: boolean;
	defaultNormalizeWhitespace?: boolean;
	defaultStripIconGlyphs?: boolean;
	forceColspanEnabled?: boolean;
};

/**
 * Represents a table in Playwright, providing methods to interact with its headers, rows, and cells.
 */
export class PlaywrightTable {
	private _bodyRowLocator: Locator;
	private _bodyRowColumnSelector: string;
	private _headerRowLocator: Locator;
	private _headerColumnSelector: string;

	/**
	 * Creates an instance of the table handler with customizable selectors for headers and rows.
	 *
	 * @param _tableLocator - The Playwright `Locator` pointing to the root table element.
	 * @param _options - Optional configuration for customizing header and row selectors.
	 * @param _options.header - Options for header row and columns.
	 * @param _options.header.setMainHeaderRow - (Optional) Index of the main header row if multiple header rows exist.
	 * @param _options.header.rowSelector - (Optional) CSS selector for locating header rows. Defaults to `"thead>tr"`.
	 * @param _options.header.columnSelector - (Optional) CSS selector for locating header columns. Defaults to `"th"`.
	 * @param _options.row - Options for body rows and columns.
	 * @param _options.row.rowSelector - (Optional) CSS selector for locating body rows. Defaults to `"tbody>tr"`.
	 * @param _options.row.columnSelector - (Optional) CSS selector for locating body columns. Defaults to `"td"`.
	 *
	 * @example
	 * const table = new PlaywrightTable(
	 *   page.locator('table.my-table'),
	 *   {
	 *     header: {
	 *       rowSelector: 'thead tr.header',
	 *       columnSelector: 'th.header-cell'
	 *     },
	 *     row: {
	 *       rowSelector: 'tbody tr.data-row',
	 *       columnSelector: 'td.data-cell'
	 *     }
	 *   }
	 * );
	 */
	constructor(
		private readonly _tableLocator: Locator,
		private readonly _options?: {
			header?: {
				setMainHeaderRow?: number;
				rowSelector?: string;
				columnSelector?: string;
			};
			row?: {
				rowSelector?: string;
				columnSelector?: string;
			};
		}
	) {
		const { header = {}, row = {} } = this._options ?? {};
		TableUtils.warnOnIdenticalRowSelectors("PlaywrightTable", header.rowSelector, row.rowSelector);

		this._headerRowLocator = this._tableLocator.locator(header.rowSelector ?? "thead>tr");
		this._headerColumnSelector = header.columnSelector ?? "th";
		this._bodyRowLocator = this._tableLocator.locator(row.rowSelector ?? "tbody>tr");
		this._bodyRowColumnSelector = row.columnSelector ?? "td";
	}

	/**
	 * Retrieves all header rows of the table.
	 * @param options - Optional parameters for header row parsing configuration.
	 * @returns A promise that resolves to an array of header rows.
	 * @throws Error if the table has no header rows or no body rows.
	 *
	 * @example
	 * // Get headers with colspan enabled
	 * const headers = await table.getHeaderRows({
	 *   colspan: { enabled: true, suffix: true },
	 *   duplicateSuffix: true
	 * });
	 *
	 * @see {@link getMainHeaderRow} for getting only the main header row
	 * @see {@link HeaderRowOptions} for all available configuration options
	 */
	async getHeaderRows(options?: HeaderRowOptions): Promise<HeaderRow[]> {
		const table = await this.getTable({
			headerRowOptions: options,
		});
		return table.headerRows;
	}

	/**
	 * Retrieves the main header row of the table.
	 * By default, uses the last header row if multiple exist. Can be customized via constructor.
	 * @param options - Optional parameters for header row parsing configuration.
	 * @returns A promise that resolves to the main header row.
	 * @throws Error if the table has no header rows or no body rows.
	 * @throws Error if setMainHeaderRow index is out of bounds (negative or >= header row count).
	 *
	 * @example
	 * // Get main header with custom index set in constructor
	 * const table = new PlaywrightTable(page.locator('table'), {
	 *   header: { setMainHeaderRow: 0 }  // Use first row as main header
	 * });
	 * const mainHeader = await table.getMainHeaderRow();
	 *
	 * @see {@link getHeaderRows} for getting all header rows
	 */
	async getMainHeaderRow(options?: HeaderRowOptions): Promise<HeaderRow> {
		const table = await this.getTable({
			headerRowOptions: options,
		});
		return this.mainHeaderRow(table.headerRows);
	}

	/**
	 * Retrieves all body rows of the table.
	 * @param options - Optional table or body-row configuration.
	 * @param options.cellContentType - Legacy shortcut for body row content extraction. See {@link CellContentType}.
	 * @param options.bodyRowOptions - Body row parsing options.
	 * @param options.headerRowOptions - Header parsing options used when resolving row/colspan layouts.
	 * @returns A promise that resolves to an array of body rows.
	 * @throws Error if the table has no header rows or no body rows.
	 *
	 * @example
	 * // Get body rows with TextContent (includes hidden elements)
	 * const rows = await table.getBodyRows({
	 *   cellContentType: CellContentType.TextContent
	 * });
	 *
	 * @example
	 * // Get body rows with default InnerText
	 * const rows = await table.getBodyRows();
	 *
	 * @example
	 * // Use full table options (for example to sanitize noisy treegrid headers)
	 * const rows = await table.getBodyRows({
	 *   bodyRowOptions: { cellContentType: CellContentType.InnerText },
	 *   headerRowOptions: { normalizeWhitespace: true, stripIconGlyphs: true }
	 * });
	 */
	async getBodyRows(options?: TableOptions): Promise<BodyRow[]> {
		const tableOptions = this.normalizeGetBodyRowsOptions(options);

		const table = await this.getTable({
			bodyRowOptions: tableOptions.bodyRowOptions,
			headerRowOptions: this.resolveHeaderRowOptions(tableOptions.headerRowOptions, {
				forceColspanEnabled: true,
			}),
		});
		return table.bodyRows;
	}

	/**
	 * Retrieves a specific cell locator in the body of the table by row and column index.
	 * Both are positions in the DOM: `headerPosition` is the index among the cells of the row, so with
	 * colspan or rowspan it can differ from the column. The methods that find cells by header name
	 * account for spans.
	 * @param rowNumber - The row number (0-based index).
	 * @param headerPosition - The cell position within the row (0-based index).
	 * @returns A Playwright Locator for the specified cell.
	 *
	 * @example
	 * // Get cell at row 1, column 2
	 * const cellLocator = table.getBodyCellLocator(1, 2);
	 * await expect(cellLocator).toHaveText('Expected Text');
	 *
	 * @example
	 * // Get first cell in first row
	 * const firstCell = table.getBodyCellLocator(0, 0);
	 * await firstCell.click();
	 *
	 * @see {@link getBodyCellLocatorByRowConditions} for finding cells by content matching
	 * @see {@link getAllBodyCellLocatorsByHeaderIndex} for getting all cells in a column
	 * @see {@link getAllBodyCellLocatorsByHeaderName} for getting all cells under a header
	 */
	getBodyCellLocator(rowNumber: number, headerPosition: number): Locator {
		return this._bodyRowLocator.nth(rowNumber).locator(this._bodyRowColumnSelector).nth(headerPosition);
	}

	/**
	 * Retrieves a cell locator in the body of the table based on row conditions and a target header.
	 * Finds the first row where all conditions match, then returns the cell in the target column.
	 * @param conditions - An object where keys are header names and values are expected cell contents, or a single [header, value] tuple.
	 * @param targetHeader - The header name of the column containing the cell to retrieve.
	 * @param options - Optional table loading options. See {@link TableOptions}.
	 * @returns A promise that resolves to a Playwright Locator for the matching cell.
	 * @throws Error if no row matches all specified conditions.
	 * @throws Error if any condition header or target header is not found in the table.
	 *
	 * @example
	 * // Find cell with multiple conditions
	 * const emailLocator = await table.getBodyCellLocatorByRowConditions(
	 *   { "First name": "John", "Status": "Active" },
	 *   "Email"
	 * );
	 * await expect(emailLocator).toContainText('@example.com');
	 *
	 * @example
	 * // Find cell with single condition using tuple syntax
	 * const actionCell = await table.getBodyCellLocatorByRowConditions(
	 *   ["Username", "john.doe"],
	 *   "Actions"
	 * );
	 * await actionCell.locator('button').click();
	 *
	 * @example
	 * // Find cell with single condition using object syntax
	 * const statusCell = await table.getBodyCellLocatorByRowConditions(
	 *   { "Username": "john.doe" },
	 *   "Status"
	 * );
	 *
	 * @see {@link getBodyCellLocator} for getting cells by direct index
	 * @see {@link getAllBodyCellLocatorsByHeaderName} for getting all cells in a column
	 */
	async getBodyCellLocatorByRowConditions(
		conditions: Record<string, string> | [string, string],
		targetHeader: string,
		options?: TableOptions
	): Promise<Locator> {
		const table = await this.getTable(this.resolveTableOptionsForHeaderKeyMethods(options));
		const mainHeader = this.mainHeaderRow(table.headerRows);

		const targetHeaderIndex = this.getHeaderIndex(targetHeader, mainHeader);

		// Normalize conditions to object format
		const conditionsObj = Array.isArray(conditions) ? { [conditions[0]]: conditions[1] } : conditions;

		for (const [rowIndex, row] of table.bodyRows.entries()) {
			let matches = true;

			for (const [header, value] of Object.entries(conditionsObj)) {
				const headerIndex = this.getHeaderIndex(header, mainHeader);
				const cellValue = row[headerIndex] ?? "";
				if (cellValue !== value) {
					matches = false;
					break;
				}
			}

			if (matches) {
				return this.gridCellLocator(table.sources, rowIndex, targetHeaderIndex);
			}
		}

		throw new Error(
			`No row found matching conditions: ${JSON.stringify(conditionsObj)}\n` +
				`Target header: "${targetHeader}"\n` +
				`Searched ${table.bodyRows.length} rows\n` +
				`Body row locator: ${this._bodyRowLocator.toString()}`
		);
	}

	/**
	 * Retrieves all cell locators in the body of the table for a specific header name.
	 * Returns locators for every cell in the column identified by the header.
	 * @param header - The header name identifying the column.
	 * @param options - Optional table loading options. See {@link TableOptions}.
	 * @returns A promise that resolves to an array of Playwright Locators for all cells in the column.
	 * @throws Error if the header is not found, or if the table has no header rows or no body rows.
	 *
	 * @example
	 * // Get all cells in the "Status" column
	 * const statusCells = await table.getAllBodyCellLocatorsByHeaderName("Status");
	 * for (const cell of statusCells) {
	 *   await expect(cell).toHaveText(/Active|Inactive/);
	 * }
	 *
	 * @example
	 * // Get text from all cells in "Name" column
	 * const nameCells = await table.getAllBodyCellLocatorsByHeaderName("Name");
	 * const names = await Promise.all(nameCells.map(cell => cell.textContent()));
	 *
	 * @see {@link getAllBodyCellLocatorsByHeaderIndex} for getting cells by column index
	 * @see {@link getBodyCellLocatorByRowConditions} for finding specific cells by content
	 */
	async getAllBodyCellLocatorsByHeaderName(header: string, options?: TableOptions): Promise<Locator[]> {
		const table = await this.getTable(this.resolveTableOptionsForHeaderKeyMethods(options));
		const headers = this.mainHeaderRow(table.headerRows);
		const headerIndex = this.getHeaderIndex(header, headers);
		const locators: Locator[] = [];
		for (let rowIndex = 0; rowIndex < table.bodyRows.length; rowIndex++) {
			const cellLocator = this.gridCellLocator(table.sources, rowIndex, headerIndex);
			locators.push(cellLocator);
		}
		return locators;
	}

	/**
	 * Retrieves all cell locators in the body of the table for a specific header index.
	 * Returns locators for every cell in the column at the specified position.
	 * @param headerIndex - The header/column index (0-based).
	 * @param options - Optional table loading options. See {@link TableOptions}.
	 * @returns A promise that resolves to an array of Playwright Locators for all cells in the column.
	 * @throws Error if the header index is out of bounds (negative or >= the number of columns, counting colspans).
	 *
	 * @example
	 * // Get all cells in the third column (index 2)
	 * const thirdColumnCells = await table.getAllBodyCellLocatorsByHeaderIndex(2);
	 * for (const cell of thirdColumnCells) {
	 *   await expect(cell).toBeVisible();
	 * }
	 *
	 * @example
	 * // Get all cells in first column
	 * const firstColumnCells = await table.getAllBodyCellLocatorsByHeaderIndex(0);
	 * const values = await Promise.all(firstColumnCells.map(c => c.textContent()));
	 *
	 * @see {@link getAllBodyCellLocatorsByHeaderName} for getting cells by header name
	 * @see {@link getBodyCellLocator} for getting a specific cell by row and column index
	 */
	async getAllBodyCellLocatorsByHeaderIndex(headerIndex: number, options?: TableOptions): Promise<Locator[]> {
		// Count the columns that colspans cover, as the grid positions of the body cells do
		const tableOptions = this.normalizeGetBodyRowsOptions(options);
		const table = await this.getTable({
			bodyRowOptions: tableOptions.bodyRowOptions,
			headerRowOptions: this.resolveHeaderRowOptions(tableOptions.headerRowOptions, { forceColspanEnabled: true }),
		});
		const columnCount = this.mainHeaderRow(table.headerRows).length;
		if (headerIndex < 0 || headerIndex >= columnCount) {
			throw new Error(
				`Header index ${headerIndex} out of bounds. Table has ${columnCount} columns.\n` +
					`Header row locator: ${this._headerRowLocator.toString()}`
			);
		}
		const locators: Locator[] = [];
		for (let rowIndex = 0; rowIndex < table.bodyRows.length; rowIndex++) {
			const cellLocator = this.gridCellLocator(table.sources, rowIndex, headerIndex);
			locators.push(cellLocator);
		}
		return locators;
	}

	/**
	 * Converts the table data into a JSON array where each object represents a row.
	 * Keys are header names, values are cell contents.
	 * @param options - Optional table loading options. See {@link TableOptions}.
	 * @returns A promise that resolves to an array of objects representing table rows.
	 * @throws Error if no header rows or body rows found.
	 *
	 * @example
	 * // Convert table to JSON with default options
	 * const data = await table.getJson();
	 * // Result: [{"Name": "John", "Age": "30"}, {"Name": "Jane", "Age": "25"}]
	 *
	 * @example
	 * // Convert with colspan enabled and duplicate suffix
	 * const data = await table.getJson({
	 *   headerRowOptions: {
	 *     colspan: { enabled: true, suffix: true },
	 *     duplicateSuffix: true,
	 *     emptyCellReplacement: true
	 *   }
	 * });
	 */
	async getJson(options?: TableOptions): Promise<Record<string, string>[]> {
		const tableOptions = this.normalizeGetBodyRowsOptions(options);
		const table = await this.getTable({
			bodyRowOptions: tableOptions.bodyRowOptions,
			headerRowOptions: this.resolveHeaderRowOptionsForJsonKeys(tableOptions.headerRowOptions),
		});

		const headers = this.mainHeaderRow(table.headerRows);
		return table.bodyRows.map(row => {
			const rowObj: Record<string, Cell> = {};
			headers.forEach((header, index) => {
				rowObj[header] = row[index] ?? "";
			});
			return rowObj;
		});
	}

	/**
	 * Waits for the table body to be empty (no body rows).
	 * @param options - Polling options (`timeout`, default 30000 ms; `interval`, default 100 ms).
	 * @returns A promise that resolves when table body is empty.
	 * @throws Error if table is not empty within timeout period.
	 *
	 * @example
	 * // Wait for table to clear after delete operation
	 * await table.waitForEmpty({ timeout: 5000 });
	 *
	 * @see {@link waitForNonEmpty} for waiting until table has data
	 *
	 * @remarks
	 * **Alternative:** Consider using Playwright's `expect.poll` for more flexibility. Count the rows with
	 * `getRowCount()`: the methods that read the table throw while the body is empty.
	 * ```ts
	 * await expect.poll(async () => (await table.getRowCount()).body).toBe(0);
	 * ```
	 */
	async waitForEmpty(options?: PollingOptions): Promise<void> {
		await pollTable(async () => {
			const rows = await this._bodyRowLocator.all();
			if (rows.length > 0) {
				throw new Error(
					`Expected table to be empty, but found ${rows.length} body rows.\n` +
						`Body row locator: ${this._bodyRowLocator.toString()}`
				);
			}
		}, options);
	}

	/**
	 * Waits for the table body to be non-empty (at least one body row with content).
	 * A row is considered valid if it has at least one cell containing text.
	 * @param options - Polling options (`timeout`, default 30000 ms; `interval`, default 100 ms).
	 * @returns A promise that resolves when table has at least one body row with content.
	 * @throws Error if table remains empty or has no rows with content within timeout period.
	 *
	 * @example
	 * // Wait for table to populate after search
	 * await table.waitForNonEmpty({ timeout: 5000 });
	 *
	 * @see {@link waitForEmpty} for waiting until table is cleared
	 *
	 * @remarks
	 * **Alternative:** Consider using Playwright's `expect.poll` for more flexibility:
	 * ```ts
	 * await expect.poll(async () => (await table.getBodyRows()).length).toBeGreaterThan(0);
	 * ```
	 */
	async waitForNonEmpty(options?: PollingOptions): Promise<void> {
		await pollTable(async () => {
			const rowCount = await this._bodyRowLocator.count();
			if (rowCount === 0) {
				throw new Error(
					`Expected table to be non-empty, but found 0 body rows.\n` +
						`Body row locator: ${this._bodyRowLocator.toString()}`
				);
			}

			// Check if at least one row has content in at least one cell, in one round trip
			const hasRowWithContent = await this._bodyRowLocator
				.locator(this._bodyRowColumnSelector)
				.evaluateAll(cells =>
					cells.some(cell => ("innerText" in cell ? cell.innerText : cell.textContent).trim() !== "")
				);

			if (!hasRowWithContent) {
				throw new Error(
					`Expected table to have at least one row with content, but all ${rowCount} rows are empty.\n` +
						`Body row locator: ${this._bodyRowLocator.toString()}`
				);
			}
		}, options);
	}

	/**
	 * Waits for the table body to have exactly N rows.
	 * @param count - The exact number of body rows expected.
	 * @param options - Polling options (`timeout`, default 30000 ms; `interval`, default 100 ms).
	 * @returns A promise that resolves when the table has exactly the specified number of rows.
	 * @throws Error if row count doesn't match within timeout period.
	 *
	 * @example
	 * // Wait for exactly 10 rows after pagination
	 * await table.waitForExactRowCount(10, { timeout: 5000 });
	 *
	 * @example
	 * // Verify table has exactly 0 rows (alternative to waitForEmpty)
	 * await table.waitForExactRowCount(0);
	 *
	 * @see {@link getRowCount} for getting current row counts
	 *
	 * @remarks
	 * **Alternative:** Consider using Playwright's `expect.poll` for more flexibility:
	 * ```ts
	 * await expect.poll(async () => (await table.getBodyRows()).length).toBe(10);
	 * ```
	 */
	async waitForExactRowCount(count: number, options?: PollingOptions): Promise<void> {
		if (count < 0 || !Number.isInteger(count)) {
			throw new Error(`Row count must be a non-negative integer, got: ${count}`);
		}

		await pollTable(async () => {
			const rows = await this._bodyRowLocator.all();
			if (rows.length !== count) {
				throw new Error(
					`Expected exactly ${count} rows, but found ${rows.length}.\n` +
						`Body row locator: ${this._bodyRowLocator.toString()}`
				);
			}
		}, options);
	}

	/**
	 * Gets the count of header and body rows in the table.
	 * Lightweight method that doesn't fetch cell data, only counts rows.
	 * @returns A promise that resolves to an object with header and body row counts.
	 *
	 * @example
	 * // Get current row counts
	 * const counts = await table.getRowCount();
	 * console.log(`Headers: ${counts.header}, Body: ${counts.body}`);
	 *
	 * @example
	 * // Assert specific row count
	 * const { body } = await table.getRowCount();
	 * expect(body).toBe(10);
	 */
	async getRowCount(): Promise<{ header: number; body: number }> {
		const [header, body] = await Promise.all([this._headerRowLocator.count(), this._bodyRowLocator.count()]);
		return { header, body };
	}

	/**
	 * Gets all distinct (unique) values from a specific column.
	 * Returns a sorted array of unique string values, excluding empty values.
	 * @param headerName - The header name of the column to extract distinct values from.
	 * @param options - Optional table loading options. See {@link TableOptions}.
	 * @returns A promise that resolves to a sorted array of distinct values.
	 * @throws Error if the header is not found, or if the table has no header rows or no body rows.
	 *
	 * @example
	 * // Get all unique status values
	 * const statuses = await table.getDistinctColumnValues("Status");
	 * // Result: ["Active", "Inactive", "Pending"]
	 *
	 * @example
	 * // Get distinct countries for filtering
	 * const countries = await table.getDistinctColumnValues("Country");
	 * console.log(`Available countries: ${countries.join(", ")}`);
	 *
	 * @example
	 * // Verify expected values exist
	 * const roles = await table.getDistinctColumnValues("Role");
	 * expect(roles).toContain("Admin");
	 * expect(roles).toHaveLength(3);
	 *
	 * @see {@link getAllBodyCellLocatorsByHeaderName} for getting all cell locators in a column
	 * @see {@link getJson} for getting full table data
	 */
	async getDistinctColumnValues(headerName: string, options?: TableOptions): Promise<string[]> {
		const table = await this.getTable(this.resolveTableOptionsForHeaderKeyMethods(options));
		const mainHeader = this.mainHeaderRow(table.headerRows);
		const headerIndex = this.getHeaderIndex(headerName, mainHeader);

		const values = new Set<string>();
		for (const row of table.bodyRows) {
			const value = String(row[headerIndex] ?? "").trim();
			if (value) values.add(value);
		}

		return Array.from(values).sort();
	}

	/**
	 * Finds the index of the first body row matching the specified conditions.
	 * Returns -1 if no matching row is found.
	 * @param conditions - Record of header names and expected cell values to match.
	 * @param options - Optional table loading options. See {@link TableOptions}.
	 * @returns A promise that resolves to the 0-based index of the first matching row, or -1 if not found.
	 * @throws Error if specified headers don't exist, or if the table has no header rows or no body rows.
	 *
	 * @example
	 * // Find index of row where Status is "Active"
	 * const index = await table.findRowIndex({ Status: "Active" });
	 * if (index >= 0) {
	 *   console.log(`Found at row ${index}`);
	 * }
	 *
	 * @example
	 * // Find row and interact with it
	 * const rowIndex = await table.findRowIndex({ Username: "john.doe" });
	 * if (rowIndex >= 0) {
	 *   const cell = table.getBodyCellLocator(rowIndex, 0);
	 *   await cell.click();
	 * }
	 *
	 * @see {@link getBodyCellLocatorByRowConditions} for getting cell locators from matching rows
	 */
	async findRowIndex(conditions: Record<string, string>, options?: TableOptions): Promise<number> {
		const table = await this.getTable(this.resolveTableOptionsForHeaderKeyMethods(options));
		const mainHeader = this.mainHeaderRow(table.headerRows);

		// Validate all condition headers exist and get their indices
		const expected = Object.entries(conditions).map(([header, value]) => ({
			headerIndex: this.getHeaderIndex(header, mainHeader),
			value,
		}));

		// Find first matching row
		for (const [rowIndex, row] of table.bodyRows.entries()) {
			let rowMatches = true;

			for (const { headerIndex, value: expectedValue } of expected) {
				const cellValue = String(row[headerIndex] ?? "");
				if (cellValue !== expectedValue) {
					rowMatches = false;
					break;
				}
			}

			if (rowMatches) {
				return rowIndex;
			}
		}

		return -1;
	}

	private async getTable(
		options?: TableOptions
	): Promise<{ headerRows: HeaderRow[]; bodyRows: BodyRow[]; sources: (CellSource | undefined)[][] }> {
		const [headerRows, { rows: bodyRows, sources }] = await Promise.all([
			TableHeader.getRows(this._headerRowLocator, this._headerColumnSelector, options?.headerRowOptions),
			TableBody.getRowsWithSources(this._bodyRowLocator, this._bodyRowColumnSelector, options?.bodyRowOptions),
		]);

		if (headerRows.length === 0) {
			throw new Error(
				`No header rows found, is table loaded completely?\n` +
					`Header row locator: ${this._headerRowLocator.toString()}\n` +
					`Table locator: ${this._tableLocator.toString()}`
			);
		}
		if (bodyRows.length === 0) {
			throw new Error(
				`No body rows found, is table loaded completely?\n` +
					`Body row locator: ${this._bodyRowLocator.toString()}\n` +
					`Table locator: ${this._tableLocator.toString()}`
			);
		}

		return { headerRows, bodyRows, sources };
	}

	/**
	 * The locator of the DOM cell at a grid position, so colspan and rowspan don't shift it. A cell that
	 * spans rows is located in the row it starts in.
	 */
	private gridCellLocator(sources: (CellSource | undefined)[][], rowIndex: number, columnIndex: number): Locator {
		const source = sources[rowIndex]?.[columnIndex];
		return source === undefined
			? this.getBodyCellLocator(rowIndex, columnIndex)
			: this.getBodyCellLocator(source.row, source.cell);
	}

	private normalizeGetBodyRowsOptions(options?: TableOptions): TableOptions {
		if (!options) {
			return {};
		}

		// oxlint-disable-next-line typescript/no-deprecated -- still supported for backwards compatibility
		const { cellContentType } = options;
		// The deprecated option applies to the body cells, unless `bodyRowOptions` sets its own.
		if (cellContentType === undefined || options.bodyRowOptions?.cellContentType !== undefined) {
			return options;
		}
		return {
			...options,
			bodyRowOptions: { ...options.bodyRowOptions, cellContentType },
		};
	}

	private resolveHeaderRowOptionsForJsonKeys(headerOptions?: HeaderRowOptions): HeaderRowOptions {
		return this.resolveHeaderRowOptions(headerOptions, {
			defaultColspanEnabled: true,
			defaultColspanSuffix: true,
			defaultDuplicateSuffix: true,
			defaultEmptyCellReplacement: true,
			defaultNormalizeWhitespace: false,
			defaultStripIconGlyphs: false,
		});
	}

	private resolveTableOptionsForHeaderKeyMethods(options?: TableOptions): TableOptions {
		const tableOptions = this.normalizeGetBodyRowsOptions(options);
		return {
			bodyRowOptions: tableOptions.bodyRowOptions,
			headerRowOptions: this.resolveHeaderRowOptionsForJsonKeys(tableOptions.headerRowOptions),
		};
	}

	private resolveHeaderRowOptions(
		headerOptions: HeaderRowOptions = {},
		defaults: HeaderRowOptionDefaults = {}
	): HeaderRowOptions {
		return {
			cellContentType: headerOptions.cellContentType,
			emptyCellReplacement: headerOptions.emptyCellReplacement ?? defaults.defaultEmptyCellReplacement,
			duplicateSuffix: headerOptions.duplicateSuffix ?? defaults.defaultDuplicateSuffix,
			normalizeWhitespace: headerOptions.normalizeWhitespace ?? defaults.defaultNormalizeWhitespace,
			stripIconGlyphs: headerOptions.stripIconGlyphs ?? defaults.defaultStripIconGlyphs,
			colspan: this.resolveColspanOptions(headerOptions.colspan, defaults),
		};
	}

	private resolveColspanOptions(
		colspan: HeaderRowOptions["colspan"] = {},
		defaults: HeaderRowOptionDefaults
	): NonNullable<HeaderRowOptions["colspan"]> {
		return {
			enabled: defaults.forceColspanEnabled === true ? true : (colspan.enabled ?? defaults.defaultColspanEnabled),
			suffix: colspan.suffix ?? defaults.defaultColspanSuffix,
		};
	}

	private mainHeaderRow(headers: HeaderRow[]): HeaderRow {
		if (headers.length === 0) {
			throw new Error(
				`No header rows available. Ensure table has been loaded.\n` +
					`Header row locator: ${this._headerRowLocator.toString()}`
			);
		}

		const headerIndex = this._options?.header?.setMainHeaderRow ?? headers.length - 1;
		const mainHeader = headers[headerIndex];
		if (mainHeader === undefined) {
			throw new Error(
				`Header row index ${headerIndex} out of bounds. Table has ${headers.length} header rows.\n` +
					`Header row locator: ${this._headerRowLocator.toString()}`
			);
		}

		return mainHeader;
	}

	/**
	 * Gets the index of a header in the main header row, throwing an error if not found.
	 * @param header - The header name to find.
	 * @param mainHeader - The main header row to search in.
	 * @returns The 0-based index of the header.
	 * @throws Error if the header is not found.
	 */
	private getHeaderIndex(header: string, mainHeader: HeaderRow): number {
		const index = mainHeader.indexOf(header);
		if (index === -1) {
			throw new Error(
				`Header "${header}" not found.\n` +
					`Available headers: [${mainHeader.join(", ")}]\n` +
					`Header row locator: ${this._headerRowLocator.toString()}`
			);
		}
		return index;
	}
}
