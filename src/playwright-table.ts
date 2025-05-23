import { expect, Locator } from "@playwright/test";
import { TableBody } from "./table-body";
import { BodyRow, Cell, HeaderRow } from "./row";
import { HeaderRowOptions, TableHeader } from "./table-header";
import { RowKind, TableWait } from "./table-wait";
import { CellContentType } from "./cell-content-type";

/**
 * Options for loading table data, headers, and rows.
 *
 * @example
 * // Wait up to 5 seconds and use custom cell content type for body rows
 * const options: LoadOptions = {
 *   timeout: 5000,
 *   bodyRowOptions: { cellContentType: CellContentType.TextContent },
 *   headerRowOptions: {
 *     colspan: { enabled: true, suffix: true },
 *     duplicateSuffix: true,
 *     emptyCellReplacement: false,
 *   },
 * };
 * await table.getBodyRows(options);
 */
export type LoadOptions = {
	/** Timeout in milliseconds for loading table data. */
	timeout?: number;
	/** See {@link HeaderRowOptions} for available options. */
	headerRowOptions?: HeaderRowOptions;
	/** Options for parsing body rows. */
	bodyRowOptions?: { cellContentType?: CellContentType };
};

/**
 * Options for waiting for table rows to appear or meet certain conditions.
 *
 * @example
 * // Wait for at least 3 body rows, each with 3 cells containing content, within 2 seconds
 * const waitOptions: WaitForTableRowsOptions = {
 *   timeout: 2000,
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
	/** Timeout in milliseconds for waiting. */
	timeout?: number;
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
 * Represents a table in Playwright, providing methods to interact with its headers, rows, and cells.
 */
export class PlaywrightTable {
	private _headers: HeaderRow[] = [];
	private _rows: BodyRow[] = [];
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
	 * @param options - Optional parameters for timeout and header row options.
	 * @param options.timeout - Timeout in milliseconds for loading table data.
	 * @param options.headerRowOptions - See {@link HeaderRowOptions} for available options.
	 * @returns A promise that resolves to an array of header rows.
	 */
	async getHeaderRows(options?: Pick<LoadOptions, "timeout" | "headerRowOptions">): Promise<HeaderRow[]> {
		await this.load(options);
		return this._headers;
	}

	/**
	 * Retrieves the main header row of the table.
	 * @param options - Optional parameters for timeout and header row options.
	 * @param options.timeout - Timeout in milliseconds for loading table data.
	 * @param options.headerRowOptions - See {@link HeaderRowOptions} for available options.
	 * @returns A promise that resolves to the main header row.
	 */
	async getMainHeaderRow(options?: Pick<LoadOptions, "timeout" | "headerRowOptions">): Promise<HeaderRow> {
		await this.load(options);
		return this.mainHeaderRow();
	}

	/**
	 * Retrieves all body rows of the table.
	 * @param options.timout - Timeout in milliseconds for loading table data.
	 * @param options.bodyRowOptions.cellContentType - The content type for the body rows.
	 * @returns A promise that resolves to an array of body rows.
	 */
	async getBodyRows(options?: Pick<LoadOptions, "timeout" | "bodyRowOptions">): Promise<BodyRow[]> {
		await this.load({
			timeout: options?.timeout,
			bodyRowOptions: options?.bodyRowOptions,
			headerRowOptions: {
				colspan: { enabled: true },
			},
		});
		return this._rows;
	}

	/**
	 * Retrieves a specific cell locator in the body of the table.
	 * @param rowNumber - The row number (0-based index).
	 * @param headerPosition - The header position (0-based index).
	 * @returns A Playwright Locator for the specified cell.
	 */
	getBodyCellLocator(rowNumber: number, headerPosition: number): Locator {
		return this._bodyRowLocator.nth(rowNumber).locator(this._bodyRowColumnSelector).nth(headerPosition);
	}

	/**
	 * Retrieves a cell locator in the body of the table based on row conditions and a target header.
	 * @param conditions - A record of header names and their expected values.
	 * @param targetHeader - The target header name for the desired cell.
	 * @param options - See {@link LoadOptions} for available options.
	 * @returns A promise that resolves to a Playwright Locator for the matching cell.
	 * @throws An error if no matching row is found or if a header is not found.
	 */
	async getBodyCellLocatorByRowConditions(
		conditions: Record<string, string>,
		targetHeader: string,
		options?: LoadOptions
	): Promise<Locator> {
		await this.load(options);
		const headers = await this.getMainHeaderRow();

		const targetHeaderIndex = headers.indexOf(targetHeader);
		if (targetHeaderIndex === -1) {
			throw new Error(`Header "${targetHeader}" not found.`);
		}

		for (let rowIndex = 0; rowIndex < this._rows.length; rowIndex++) {
			const row = this._rows[rowIndex];
			let matches = true;

			for (const [header, value] of Object.entries(conditions)) {
				const headerIndex = headers.indexOf(header);
				if (headerIndex === -1) {
					throw new Error(`Header "${header}" not found.`);
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

		throw new Error(`No row found matching conditions: ${JSON.stringify(conditions)}`);
	}

	/**
	 * Retrieves all cell locators in the body of the table for a specific header name.
	 * @param header - The header name.
	 * @param options - See {@link LoadOptions} for available options.
	 * @returns A promise that resolves to an array of Playwright Locators for the cells.
	 * @throws An error if the header is not found.
	 */
	async getAllBodyCellLocatorsByHeaderName(header: string, options?: LoadOptions): Promise<Locator[]> {
		await this.load(options);
		const headers = await this.getMainHeaderRow();
		const headerIndex = headers.indexOf(header);
		if (headerIndex === -1) {
			throw new Error(`Header "${header}" not found.`);
		}
		const locators: Locator[] = [];
		for (let rowIndex = 0; rowIndex < this._rows.length; rowIndex++) {
			const cellLocator = this.getBodyCellLocator(rowIndex, headerIndex);
			locators.push(cellLocator);
		}
		return locators;
	}

	/**
	 * Retrieves all cell locators in the body of the table for a specific header index.
	 * @param headerIndex - The header index (0-based).
	 * @param options - See {@link LoadOptions} for available options.
	 * @returns A promise that resolves to an array of Playwright Locators for the cells.
	 */
	async getAllBodyCellLocatorsByHeaderIndex(headerIndex: number, options?: LoadOptions): Promise<Locator[]> {
		await this.load(options);
		const locators: Locator[] = [];
		for (let rowIndex = 0; rowIndex < this._rows.length; rowIndex++) {
			const cellLocator = this.getBodyCellLocator(rowIndex, headerIndex);
			locators.push(cellLocator);
		}
		return locators;
	}

	/**
	 * Converts the table data into a JSON object.
	 * @param options - See {@link LoadOptions} for available options.
	 * @returns A promise that resolves to a JSON representation of the table.
	 */
	async getJson(options?: LoadOptions): Promise<any> {
		await this.load({
			timeout: options?.timeout,
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

		const headers = this.mainHeaderRow();
		return this._rows.map(row => {
			const rowObj: Record<string, Cell> = {};
			headers.forEach((header, index) => {
				rowObj[header] = row[index] || "";
			});
			return rowObj;
		});
	}

	/**
	 * Waits for the header rows to be loaded.
	 * @param options - See {@link WaitForTableRowsOptions} for available options.
	 * @returns A promise that resolves when the header rows are loaded.
	 */
	async waitForHeaderRows(options?: WaitForTableRowsOptions): Promise<void> {
		await expect(
			async () =>
				await TableWait.waitForRows(this._headerRowLocator, this._headerColumnSelector, RowKind.Header, options)
		).toPass({
			timeout: options?.timeout,
		});
	}

	/**
	 * Waits for the body rows to be loaded.
	 * @param options - See {@link WaitForTableRowsOptions} for available options.
	 * @returns A promise that resolves when the body rows are loaded.
	 */
	async waitForBodyRows(options?: WaitForTableRowsOptions): Promise<void> {
		await expect(
			async () => await TableWait.waitForRows(this._bodyRowLocator, this._bodyRowColumnSelector, RowKind.Body, options)
		).toPass({
			timeout: options?.timeout,
		});
	}

	private async load(options?: LoadOptions): Promise<void> {
		await expect(async () => {
			await TableWait.waitForRows(this._headerRowLocator, this._headerColumnSelector, RowKind.Header);
			await TableWait.waitForRows(this._bodyRowLocator, this._bodyRowColumnSelector, RowKind.Body);
		}).toPass({ timeout: options?.timeout });

		this._headers = await TableHeader.getRows(
			this._headerRowLocator,
			this._headerColumnSelector,
			options?.headerRowOptions
		);
		this._rows = await TableBody.getRows(this._bodyRowLocator, this._bodyRowColumnSelector, options?.bodyRowOptions);
	}

	private mainHeaderRow(): HeaderRow {
		return this._options?.header?.setMainHeaderRow
			? this._headers[this._options.header.setMainHeaderRow]
			: this._headers[this._headers.length - 1];
	}
}
