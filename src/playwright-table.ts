import { Locator } from "@playwright/test";
import { TableBody } from "./table-body";
import { BodyRow, Cell, HeaderRow } from "./row";
import { HeaderRowOptions, TableHeader } from "./table-header";
import { RowKind, TableWait } from "./table-wait";
import { CellContentType } from "./cell-content-type";
import { Poll, PollingOptions } from "./polling";

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
};

/**
 * Options for waiting for table rows to appear or meet certain conditions.
 *
 * @property row - Row validation criteria.
 * @property row.amount - Expected exact number of rows. If not specified, validates at least one row exists.
 * @property row.cell - Cell validation criteria.
 * @property row.cell.totalCount - Expected number of cells per row (regardless of content).
 * @property row.cell.contentCount - Expected number of cells with non-empty content per row.
 *
 * @example
 * // Wait for at least 3 body rows, each with 3 cells containing content
 * const waitOptions: WaitForTableRowsOptions = {
 *   row: {
 *     amount: 3,
 *     cell: {
 *       totalCount: 3,
 *       contentCount: 3,
 *     },
 *   },
 * };
 * await table.waitForBodyRows(waitOptions);
 */
export type WaitForTableRowsOptions = {
	/** Row and cell count/content conditions. */
	row?: {
		/** Expected number of rows. */
		amount?: number;
		cell?: {
			/** Expected number of cells per row. */
			totalCount?: number;
			/** Expected number of cells with content per row. */
			contentCount?: number;
		};
	};
};

/**
 * Options for waiting for table stability.
 *
 * @property stabilityDuration - Duration in ms that table must remain unchanged. Defaults to 500ms.
 * @property checkInterval - Interval in ms between stability checks. Defaults to 100ms.
 * @property timeout - Maximum time to wait in ms. Defaults to 30000ms (30 seconds).
 */
export type WaitForStableOptions = {
	/** Duration in ms that table must remain unchanged. Defaults to 500. */
	stabilityDuration?: number;
	/** Interval in ms between stability checks. Defaults to 100. */
	checkInterval?: number;
} & PollingOptions;

/**
 * Options for waiting for rows matching conditions.
 *
 * @property minRows - Minimum number of rows that must match the conditions. Defaults to 1.
 *
 * @example
 * // Wait for at least 3 rows where Country is "USA"
 * await table.waitForRowByConditions(
 *   { Country: "USA" },
 *   { minRows: 3, timeout: 10000 }
 * );
 */
export type WaitForRowByConditionsOptions = {
	/** Minimum number of matching rows expected. Defaults to 1. */
	minRows?: number;
} & PollingOptions;

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
		this._headerRowLocator = this._tableLocator.locator(this._options?.header?.rowSelector ?? "thead>tr");
		this._headerColumnSelector = this._options?.header?.columnSelector ?? "th";
		this._bodyRowLocator = this._tableLocator.locator(this._options?.row?.rowSelector ?? "tbody>tr");
		this._bodyRowColumnSelector = this._options?.row?.columnSelector ?? "td";
	}

	/**
	 * Retrieves all header rows of the table.
	 * @param options - Optional parameters for header row parsing configuration.
	 * @returns A promise that resolves to an array of header rows.
	 * @throws Error if no header rows found after table loads.
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
	 * @throws Error if no header rows available.
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
	 * @param options - Optional configuration for body row parsing.
	 * @param options.cellContentType - Content extraction type. See {@link CellContentType}. Defaults to InnerText.
	 * @returns A promise that resolves to an array of body rows.
	 * @throws Error if no body rows found after table loads.
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
	 */
	async getBodyRows(options?: { cellContentType?: CellContentType }): Promise<BodyRow[]> {
		const table = await this.getTable({
			bodyRowOptions: options,
			headerRowOptions: {
				colspan: { enabled: true },
			},
		});
		return table.bodyRows;
	}

	/**
	 * Retrieves a specific cell locator in the body of the table by row and column index.
	 * @param rowNumber - The row number (0-based index).
	 * @param headerPosition - The column/header position (0-based index).
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
	 * @param conditions - An object where keys are header names and values are expected cell contents.
	 * @param targetHeader - The header name of the column containing the cell to retrieve.
	 * @param options - Optional table loading options. See {@link TableOptions}.
	 * @returns A promise that resolves to a Playwright Locator for the matching cell.
	 * @throws Error if no row matches all specified conditions.
	 * @throws Error if any condition header or target header is not found in the table.
	 *
	 * @example
	 * // Find cell in "Email" column where "First name" is "John" and "Status" is "Active"
	 * const emailLocator = await table.getBodyCellLocatorByRowConditions(
	 *   { "First name": "John", "Status": "Active" },
	 *   "Email"
	 * );
	 * await expect(emailLocator).toContainText('@example.com');
	 *
	 * @example
	 * // Click button in "Actions" column for specific user
	 * const actionCell = await table.getBodyCellLocatorByRowConditions(
	 *   { "Username": "john.doe" },
	 *   "Actions"
	 * );
	 * await actionCell.locator('button').click();
	 *
	 * @see {@link getBodyCellLocator} for getting cells by direct index
	 * @see {@link getAllBodyCellLocatorsByHeaderName} for getting all cells in a column
	 */
	async getBodyCellLocatorByRowConditions(
		conditions: Record<string, string>,
		targetHeader: string,
		options?: TableOptions
	): Promise<Locator> {
		const table = await this.getTable(options);
		const mainHeader = this.mainHeaderRow(table.headerRows);

		const targetHeaderIndex = mainHeader.indexOf(targetHeader);
		if (targetHeaderIndex === -1) {
			throw new Error(
				`Header "${targetHeader}" not found.\n` +
					`Available headers: [${mainHeader.join(", ")}]\n` +
					`Header row locator: ${this._headerRowLocator.toString()}`
			);
		}

		for (let rowIndex = 0; rowIndex < table.bodyRows.length; rowIndex++) {
			const row = table.bodyRows[rowIndex];
			let matches = true;

			for (const [header, value] of Object.entries(conditions)) {
				const headerIndex = mainHeader.indexOf(header);
				if (headerIndex === -1) {
					throw new Error(
						`Header "${header}" not found.\n` +
							`Available headers: [${mainHeader.join(", ")}]\n` +
							`Header row locator: ${this._headerRowLocator.toString()}`
					);
				}
				const cellValue = row[headerIndex] ?? "";
				if (cellValue !== value) {
					matches = false;
					break;
				}
			}

			if (matches) {
				return this.getBodyCellLocator(rowIndex, targetHeaderIndex);
			}
		}

		throw new Error(
			`No row found matching conditions: ${JSON.stringify(conditions)}\n` +
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
	 * @throws Error if the header is not found in the table.
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
		const table = await this.getTable(options);
		const headers = this.mainHeaderRow(table.headerRows);
		const headerIndex = headers.indexOf(header);
		if (headerIndex === -1) {
			throw new Error(
				`Header "${header}" not found.\n` +
					`Available headers: [${headers.join(", ")}]\n` +
					`Header row locator: ${this._headerRowLocator.toString()}`
			);
		}
		const locators: Locator[] = [];
		for (let rowIndex = 0; rowIndex < table.bodyRows.length; rowIndex++) {
			const cellLocator = this.getBodyCellLocator(rowIndex, headerIndex);
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
	 * @throws Error if the header index is out of bounds (negative or >= column count).
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
		const table = await this.getTable(options);
		const columnCount = this.mainHeaderRow(table.headerRows).length;
		if (headerIndex < 0 || headerIndex >= columnCount) {
			throw new Error(
				`Header index ${headerIndex} out of bounds. Table has ${columnCount} columns.\n` +
					`Header row locator: ${this._headerRowLocator.toString()}`
			);
		}
		const locators: Locator[] = [];
		for (let rowIndex = 0; rowIndex < table.bodyRows.length; rowIndex++) {
			const cellLocator = this.getBodyCellLocator(rowIndex, headerIndex);
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
	async getJson(options?: TableOptions): Promise<any> {
		const table = await this.getTable({
			bodyRowOptions: options?.bodyRowOptions,
			headerRowOptions: {
				colspan: {
					enabled: options?.headerRowOptions?.colspan?.enabled ?? true,
					suffix: options?.headerRowOptions?.colspan?.suffix ?? true,
				},
				duplicateSuffix: options?.headerRowOptions?.duplicateSuffix ?? true,
				emptyCellReplacement: options?.headerRowOptions?.emptyCellReplacement ?? true,
			},
		});

		const headers = this.mainHeaderRow(table.headerRows);
		return table.bodyRows.map(row => {
			const rowObj: Record<string, Cell> = {};
			headers.forEach((header, index) => {
				rowObj[header] = row[index] || "";
			});
			return rowObj;
		});
	}

	/**
	 * Waits for the header rows to be loaded and meet specified conditions.
	 * Uses polling to retry until conditions are met or timeout is reached.
	 * @param options - Row validation and polling options.
	 * @returns A promise that resolves when the header rows meet the specified conditions.
	 * @throws Error if conditions are not met within the timeout period.
	 *
	 * @example
	 * // Wait for at least 1 header row with 5 cells
	 * await table.waitForHeaderRows({
	 *   row: {
	 *     amount: 1,
	 *     cell: { totalCount: 5 }
	 *   },
	 *   timeout: 5000
	 * });
	 *
	 * @see {@link waitForBodyRows} for waiting on body rows
	 * @see {@link WaitForTableRowsOptions} for all validation options
	 */
	async waitForHeaderRows(options?: WaitForTableRowsOptions & PollingOptions): Promise<void> {
		await Poll(async () => {
			await TableWait.waitForRows(this._headerRowLocator, this._headerColumnSelector, RowKind.Header, options);
		}, options);
	}

	/**
	 * Waits for the body rows to be loaded and meet specified conditions.
	 * Uses polling to retry until conditions are met or timeout is reached.
	 * @param options - Row validation and polling options.
	 * @returns A promise that resolves when the body rows meet the specified conditions.
	 * @throws Error if conditions are not met within the timeout period.
	 *
	 * @example
	 * // Wait for at least 10 body rows
	 * await table.waitForBodyRows({
	 *   row: { amount: 10 },
	 *   timeout: 10000
	 * });
	 *
	 * @example
	 * // Wait for rows with specific structure
	 * await table.waitForBodyRows({
	 *   row: {
	 *     amount: 5,
	 *     cell: {
	 *       totalCount: 4,
	 *       contentCount: 4
	 *     }
	 *   }
	 * });
	 *
	 * @see {@link waitForHeaderRows} for waiting on header rows
	 * @see {@link WaitForTableRowsOptions} for all validation options
	 */
	async waitForBodyRows(options?: WaitForTableRowsOptions & PollingOptions): Promise<void> {
		await Poll(async () => {
			await TableWait.waitForRows(this._bodyRowLocator, this._bodyRowColumnSelector, RowKind.Body, options);
		}, options);
	}

	/**
	 * Waits for the table to become stable (no changes for a specified duration).
	 * Useful for tables with lazy loading, streaming data, or animations.
	 * @param options - Options for stability duration and polling. See {@link WaitForStableOptions}.
	 * @returns A promise that resolves when table is stable.
	 * @throws Error if table does not stabilize within timeout period.
	 *
	 * @example
	 * // Wait for table to remain unchanged for 500ms
	 * await table.waitForStable({ stabilityDuration: 500 });
	 *
	 * @example
	 * // Wait with custom check interval
	 * await table.waitForStable({
	 *   stabilityDuration: 1000,
	 *   checkInterval: 100,
	 *   timeout: 10000
	 * });
	 *
	 * @see {@link waitForBodyRows} for waiting on row count/structure
	 * @see {@link waitForNonEmpty} for waiting until table has data
	 */
	async waitForStable(options?: WaitForStableOptions): Promise<void> {
		const stabilityDuration = options?.stabilityDuration ?? 500;
		const checkInterval = options?.checkInterval ?? 100;
		const timeout = options?.timeout ?? 30_000;

		const startTime = Date.now();
		let lastSnapshot: string | null = null;
		let stableStartTime: number | null = null;

		while (Date.now() - startTime < timeout) {
			try {
				const table = await this.getTable({
					headerRowOptions: { colspan: { enabled: true } },
				});

				// Create a snapshot of current table state
				const currentSnapshot = JSON.stringify({
					rowCount: table.bodyRows.length,
					data: table.bodyRows,
				});

				if (lastSnapshot === null) {
					// First check
					lastSnapshot = currentSnapshot;
					stableStartTime = Date.now();
				} else if (currentSnapshot === lastSnapshot) {
					// Table hasn't changed
					const stableDuration = Date.now() - (stableStartTime ?? Date.now());
					if (stableDuration >= stabilityDuration) {
						// Table has been stable long enough
						return;
					}
				} else {
					// Table changed, reset stability timer
					lastSnapshot = currentSnapshot;
					stableStartTime = Date.now();
				}
			} catch (error) {
				// If table not loaded yet, reset
				lastSnapshot = null;
				stableStartTime = null;
			}

			await new Promise(resolve => setTimeout(resolve, checkInterval));
		}

		throw new Error(
			`Table did not stabilize within ${timeout}ms.\n` +
				`Stability duration required: ${stabilityDuration}ms\n` +
				`Table locator: ${this._tableLocator.toString()}`
		);
	}

	/**
	 * Waits for the table body to be empty (no body rows).
	 * @param options - Polling options (timeout, interval, retries).
	 * @returns A promise that resolves when table body is empty.
	 * @throws Error if table is not empty within timeout period.
	 *
	 * @example
	 * // Wait for table to clear after delete operation
	 * await table.waitForEmpty({ timeout: 5000 });
	 *
	 * @see {@link waitForNonEmpty} for waiting until table has data
	 * @see {@link waitForBodyRows} for waiting on specific row counts
	 */
	async waitForEmpty(options?: PollingOptions): Promise<void> {
		await Poll(async () => {
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
	 * @param options - Polling options (timeout, interval, retries).
	 * @returns A promise that resolves when table has at least one body row with content.
	 * @throws Error if table remains empty or has no rows with content within timeout period.
	 *
	 * @example
	 * // Wait for table to populate after search
	 * await table.waitForNonEmpty({ timeout: 5000 });
	 *
	 * @see {@link waitForEmpty} for waiting until table is cleared
	 * @see {@link waitForBodyRows} for waiting on specific row counts
	 */
	async waitForNonEmpty(options?: PollingOptions): Promise<void> {
		await Poll(async () => {
			const rows = await this._bodyRowLocator.all();
			if (rows.length === 0) {
				throw new Error(
					`Expected table to be non-empty, but found 0 body rows.\n` +
						`Body row locator: ${this._bodyRowLocator.toString()}`
				);
			}

			// Check if at least one row has content in at least one cell
			let hasRowWithContent = false;
			for (const row of rows) {
				const cells = await row.locator(this._bodyRowColumnSelector).all();
				for (const cell of cells) {
					const content = await cell.innerText();
					if (content.trim().length > 0) {
						hasRowWithContent = true;
						break;
					}
				}
				if (hasRowWithContent) break;
			}

			if (!hasRowWithContent) {
				throw new Error(
					`Expected table to have at least one row with content, but all ${rows.length} rows are empty.\n` +
						`Body row locator: ${this._bodyRowLocator.toString()}`
				);
			}
		}, options);
	}

	/**
	 * Waits for at least one row (or N rows) matching the specified conditions.
	 * Useful for waiting for specific data to appear in the table.
	 * @param conditions - Record of header names and expected cell values to match.
	 * @param options - Options including minimum rows and polling. See {@link WaitForRowByConditionsOptions}.
	 * @returns A promise that resolves when matching rows are found.
	 * @throws Error if conditions not met within timeout.
	 * @throws Error if specified headers don't exist in the table.
	 *
	 * @example
	 * // Wait for at least one row where Status="Active" and Type="User"
	 * await table.waitForRowByConditions({ Status: "Active", Type: "User" });
	 *
	 * @example
	 * // Wait for at least 3 rows matching conditions
	 * await table.waitForRowByConditions(
	 *   { Country: "USA" },
	 *   { minRows: 3, timeout: 10000 }
	 * );
	 *
	 * @example
	 * // Wait for specific user after search
	 * await searchInput.fill('john.doe');
	 * await table.waitForRowByConditions(
	 *   { Username: "john.doe", Status: "Active" },
	 *   { timeout: 5000 }
	 * );
	 *
	 * @see {@link getBodyCellLocatorByRowConditions} for getting cells from matching rows
	 * @see {@link waitForBodyRows} for waiting on row counts without content matching
	 */
	async waitForRowByConditions(
		conditions: Record<string, string>,
		options?: WaitForRowByConditionsOptions
	): Promise<void> {
		const minRows = options?.minRows ?? 1;

		await Poll(async () => {
			const table = await this.getTable({
				headerRowOptions: { colspan: { enabled: true } },
			});
			const mainHeader = this.mainHeaderRow(table.headerRows);

			// Validate all condition headers exist
			for (const header of Object.keys(conditions)) {
				if (!mainHeader.includes(header)) {
					throw new Error(
						`Header "${header}" not found.\n` +
							`Available headers: [${mainHeader.join(", ")}]\n` +
							`Header row locator: ${this._headerRowLocator.toString()}`
					);
				}
			}

			// Count matching rows
			let matchingRowCount = 0;
			for (const row of table.bodyRows) {
				let rowMatches = true;
				for (const [header, expectedValue] of Object.entries(conditions)) {
					const headerIndex = mainHeader.indexOf(header);
					const cellValue = String(row[headerIndex] ?? "");
					if (cellValue !== expectedValue) {
						rowMatches = false;
						break;
					}
				}
				if (rowMatches) {
					matchingRowCount++;
				}
			}

			if (matchingRowCount < minRows) {
				throw new Error(
					`Expected at least ${minRows} rows matching conditions, but found ${matchingRowCount}.\n` +
						`Conditions: ${JSON.stringify(conditions)}\n` +
						`Total rows searched: ${table.bodyRows.length}\n` +
						`Body row locator: ${this._bodyRowLocator.toString()}`
				);
			}
		}, options);
	}

	/**
	 * Waits for a specific body row at the given index to exist.
	 * More efficient than loading all table data when you only need to verify row existence.
	 * @param index - The 0-based row index to wait for.
	 * @param options - Polling options (timeout, interval, retries).
	 * @returns A promise that resolves when the row at the specified index exists.
	 * @throws Error if row at index doesn't exist within timeout period.
	 *
	 * @example
	 * // Wait for the 10th row to appear (index 9)
	 * await table.waitForRowByIndex(9, { timeout: 5000 });
	 *
	 * @example
	 * // Wait for first row after triggering load
	 * await page.locator('button.load-more').click();
	 * await table.waitForRowByIndex(0);
	 *
	 * @see {@link waitForBodyRows} for waiting on row counts with content validation
	 * @see {@link getRowCount} for getting current row counts
	 */
	async waitForRowByIndex(index: number, options?: PollingOptions): Promise<void> {
		if (index < 0 || !Number.isInteger(index)) {
			throw new Error(`Row index must be a non-negative integer, got: ${index}`);
		}

		await Poll(async () => {
			const rows = await this._bodyRowLocator.all();
			if (rows.length <= index) {
				throw new Error(
					`Expected row at index ${index} to exist, but table only has ${rows.length} rows.\n` +
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
	 *
	 * @see {@link waitForBodyRows} for waiting until specific row count is reached
	 */
	async getRowCount(): Promise<{ header: number; body: number }> {
		const [headerRows, bodyRows] = await Promise.all([this._headerRowLocator.all(), this._bodyRowLocator.all()]);
		return {
			header: headerRows.length,
			body: bodyRows.length,
		};
	}

	/**
	 * Finds the index of the first body row matching the specified conditions.
	 * Returns -1 if no matching row is found.
	 * @param conditions - Record of header names and expected cell values to match.
	 * @param options - Optional table loading options. See {@link TableOptions}.
	 * @returns A promise that resolves to the 0-based index of the first matching row, or -1 if not found.
	 * @throws Error if specified headers don't exist in the table.
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
	 * @see {@link waitForRowByConditions} for waiting until matching row appears
	 */
	async findRowIndex(conditions: Record<string, string>, options?: TableOptions): Promise<number> {
		const table = await this.getTable({
			headerRowOptions: { colspan: { enabled: true }, ...options?.headerRowOptions },
			bodyRowOptions: options?.bodyRowOptions,
		});
		const mainHeader = this.mainHeaderRow(table.headerRows);

		// Validate all condition headers exist
		for (const header of Object.keys(conditions)) {
			if (!mainHeader.includes(header)) {
				throw new Error(
					`Header "${header}" not found.\n` +
						`Available headers: [${mainHeader.join(", ")}]\n` +
						`Header row locator: ${this._headerRowLocator.toString()}`
				);
			}
		}

		// Find first matching row
		for (let rowIndex = 0; rowIndex < table.bodyRows.length; rowIndex++) {
			const row = table.bodyRows[rowIndex];
			let rowMatches = true;

			for (const [header, expectedValue] of Object.entries(conditions)) {
				const headerIndex = mainHeader.indexOf(header);
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

	private async getTable(options?: TableOptions): Promise<{ headerRows: HeaderRow[]; bodyRows: BodyRow[] }> {
		const [headerRows, bodyRows] = await Promise.all([
			TableHeader.getRows(this._headerRowLocator, this._headerColumnSelector, options?.headerRowOptions),
			TableBody.getRows(this._bodyRowLocator, this._bodyRowColumnSelector, options?.bodyRowOptions),
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

		return { headerRows, bodyRows };
	}

	private mainHeaderRow(headers: HeaderRow[]): HeaderRow {
		if (headers.length === 0) {
			throw new Error(
				`No header rows available. Ensure table has been loaded.\n` +
					`Header row locator: ${this._headerRowLocator.toString()}`
			);
		}

		const headerIndex = this._options?.header?.setMainHeaderRow ?? headers.length - 1;
		if (headerIndex < 0 || headerIndex >= headers.length) {
			throw new Error(
				`Header row index ${headerIndex} out of bounds. Table has ${headers.length} header rows.\n` +
					`Header row locator: ${this._headerRowLocator.toString()}`
			);
		}

		return headers[headerIndex];
	}
}
