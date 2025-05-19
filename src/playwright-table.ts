import { expect, Locator } from "@playwright/test";
import { TableBody } from "./table-body";
import { BodyRow, Cell, HeaderRow } from "./row";
import { HeaderRowOptions, TableHeader } from "./table-header";
import { RowKind, TableWait } from "./table-wait";

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
	 * Constructs a new instance of the PlaywrightTable class.
	 * @param _tableLocator - The Playwright Locator for the table element.
	 * @param _options - Optional configuration for header and row selectors.
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
	 * @returns A promise that resolves to an array of header rows.
	 */
	async getHeaderRows(options?: {
		timeout?: number;
		duplicateSuffix?: boolean;
		headerRowOptions?: HeaderRowOptions;
	}): Promise<HeaderRow[]> {
		await this.load(options);
		return this._headers;
	}

	/**
	 * Retrieves the main header row of the table.
	 * @param options - Optional parameters for timeout and header row options.
	 * @returns A promise that resolves to the main header row.
	 */
	async getMainHeaderRow(options?: {
		timeout?: number;
		duplicateSuffix?: boolean;
		headerRowOptions?: HeaderRowOptions;
	}): Promise<HeaderRow> {
		const headerRows = await this.getHeaderRows(options);
		const headers = this._options?.header?.setMainHeaderRow
			? headerRows[this._options.header.setMainHeaderRow]
			: headerRows[this._headers.length - 1];
		return headers;
	}

	/**
	 * Retrieves all body rows of the table.
	 * @param options - Optional parameters for timeout.
	 * @returns A promise that resolves to an array of body rows.
	 */
	async getBodyRows(options?: { timeout?: number }): Promise<BodyRow[]> {
		await this.load({ ...options, headerRowOptions: { colspan: { enabled: true } } });
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
	 * @param options - Optional parameters for timeout and other configurations.
	 * @returns A promise that resolves to a Playwright Locator for the matching cell.
	 * @throws An error if no matching row is found or if a header is not found.
	 */
	async getBodyCellLocatorByRowConditions(
		conditions: Record<string, string>,
		targetHeader: string,
		options?: { timeout?: number; duplicateSuffix?: boolean; colspanEnabled?: boolean }
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
	 * @param options - Optional parameters for timeout.
	 * @returns A promise that resolves to an array of Playwright Locators for the cells.
	 * @throws An error if the header is not found.
	 */
	async getAllBodyCellLocatorsByHeaderName(header: string, options?: { timeout?: number }): Promise<Locator[]> {
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
	 * @returns A promise that resolves to an array of Playwright Locators for the cells.
	 */
	async getAllBodyCellLocatorsByHeaderIndex(headerIndex: number): Promise<Locator[]> {
		await this.load();
		const locators: Locator[] = [];
		for (let rowIndex = 0; rowIndex < this._rows.length; rowIndex++) {
			const cellLocator = this.getBodyCellLocator(rowIndex, headerIndex);
			locators.push(cellLocator);
		}
		return locators;
	}

	/**
	 * Converts the table data into a JSON object.
	 * @param options - Optional parameters for timeout.
	 * @returns A promise that resolves to a JSON representation of the table.
	 */
	async getJson(options?: { timeout?: number }): Promise<any> {
		const headers = await this.getMainHeaderRow({
			timeout: options?.timeout,
			duplicateSuffix: true,
			headerRowOptions: {
				colspan: { enabled: true, suffix: true },
				duplicateSuffix: true,
				emptyCellReplacement: true,
			},
		});
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
	 * @param options - Optional parameters for timeout and row conditions.
	 * @returns A promise that resolves when the header rows are loaded.
	 */
	async waitForHeaderRows(options?: {
		timeout?: number;
		row?: {
			amount?: number;
			cell?: {
				totalCount?: number;
				contentCount?: number;
			};
		};
	}): Promise<void> {
		await expect(
			async () =>
				await TableWait.waitForRows(this._headerRowLocator, this._headerColumnSelector, RowKind.Header, options)
		).toPass({
			timeout: options?.timeout,
		});
	}

	/**
	 * Waits for the body rows to be loaded.
	 * @param options - Optional parameters for timeout and row conditions.
	 * @returns A promise that resolves when the body rows are loaded.
	 */
	async waitForBodyRows(options?: {
		timeout?: number;
		row?: {
			amount?: number;
			cell?: {
				totalCount?: number;
				contentCount?: number;
			};
		};
	}): Promise<void> {
		await expect(
			async () => await TableWait.waitForRows(this._bodyRowLocator, this._bodyRowColumnSelector, RowKind.Body, options)
		).toPass({
			timeout: options?.timeout,
		});
	}

	/**
	 * Loads the table data, including headers and rows.
	 * @param options - Optional parameters for timeout and header row options.
	 * @returns A promise that resolves when the table data is loaded.
	 */
	private async load(options?: { timeout?: number; headerRowOptions?: HeaderRowOptions }): Promise<void> {
		await expect(async () => {
			await TableWait.waitForRows(this._headerRowLocator, this._headerColumnSelector, RowKind.Header);
			await TableWait.waitForRows(this._bodyRowLocator, this._bodyRowColumnSelector, RowKind.Body);
		}).toPass({ timeout: options?.timeout });

		this._headers = await TableHeader.getRows(
			this._headerRowLocator,
			this._headerColumnSelector,
			options?.headerRowOptions
		);
		this._rows = await TableBody.getRows(this._bodyRowLocator, this._bodyRowColumnSelector);
	}
}
