import { expect, Locator } from "@playwright/test";
import { TableBody } from "./table-body";
import { BodyRow, Cell, HeaderRow } from "./row";
import { HeaderRowsOptions, TableHeader } from "./table-header";
import { RowKind, TableWait } from "./table-wait";

export class Table {
	private _headers: HeaderRow[] = [];
	private _rows: BodyRow[] = [];
	private _bodyRowLocator: Locator;
	private _bodyRowColumnSelector: string;
	private _headerRowLocator: Locator;
	private _headerColumnSelector: string;

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

	async getHeaderRows(options?: {
		timeout?: number;
		duplicateSuffix?: boolean;
		headerRowsOptions?: HeaderRowsOptions;
	}): Promise<HeaderRow[]> {
		await this.load(options);
		return this._headers;
	}

	async getMainHeaderRow(options?: {
		timeout?: number;
		duplicateSuffix?: boolean;
		headerRowsOptions?: HeaderRowsOptions;
	}): Promise<HeaderRow> {
		const headerRows = await this.getHeaderRows(options);
		const headers = this._options?.header?.setMainHeaderRow
			? headerRows[this._options.header.setMainHeaderRow]
			: headerRows[this._headers.length - 1];
		return headers;
	}

	async getBodyRows(options?: { timeout?: number }): Promise<BodyRow[]> {
		await this.load({ ...options, headerRowsOptions: { colspan: { enabled: true } } });
		return this._rows;
	}

	getBodyCellLocator(rowNumber: number, headerPosition: number): Locator {
		return this._bodyRowLocator.nth(rowNumber).locator(this._bodyRowColumnSelector).nth(headerPosition);
	}

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
				if (row[headerIndex] !== value) {
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

	async getAllBodyCellLocatorsByHeaderIndex(headerIndex: number): Promise<Locator[]> {
		await this.load();
		const locators: Locator[] = [];
		for (let rowIndex = 0; rowIndex < this._rows.length; rowIndex++) {
			const cellLocator = this.getBodyCellLocator(rowIndex, headerIndex);
			locators.push(cellLocator);
		}
		return locators;
	}

	async getJson(options?: { timeout?: number }): Promise<any> {
		const headers = await this.getMainHeaderRow({
			timeout: options?.timeout,
			duplicateSuffix: true,
			headerRowsOptions: {
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

	private async load(options?: { timeout?: number; headerRowsOptions?: HeaderRowsOptions }): Promise<void> {
		await expect(async () => {
			await TableWait.waitForRows(this._headerRowLocator, this._headerColumnSelector, RowKind.Header);
			await TableWait.waitForRows(this._bodyRowLocator, this._bodyRowColumnSelector, RowKind.Body);
		}).toPass({ timeout: options?.timeout });

		this._headers = await TableHeader.getHeaderRows(
			this._headerRowLocator,
			this._headerColumnSelector,
			options?.headerRowsOptions
		);
		this._rows = await TableBody.getRows(this._bodyRowLocator, this._bodyRowColumnSelector);
	}
}
