import { Locator } from "@playwright/test";
import { TableBody } from "./table-body";
import { BodyRow, Cell, HeaderRow } from "./row";
import { TableHeader } from "./table-header";

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
		colspanEnabled?: boolean;
	}): Promise<HeaderRow[]> {
		await this.load(options);
		return this._headers;
	}

	async getMainHeaderRow(options?: {
		timeout?: number;
		duplicateSuffix?: boolean;
		colspanEnabled?: boolean;
	}): Promise<string[]> {
		const headerRows = await this.getHeaderRows(options);
		const headers = this._options?.header?.setMainHeaderRow
			? headerRows[this._options.header.setMainHeaderRow]
			: headerRows[this._headers.length - 1];
		return headers.map(header => header);
	}

	async getBodyRows(options?: { timeout?: number }): Promise<BodyRow[]> {
		await this.load({ ...options, duplicateSuffix: true, colspanEnabled: true });
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
		await this.load({ ...options, duplicateSuffix: true, colspanEnabled: true });
		const headers = await this.getMainHeaderRow({ duplicateSuffix: true, colspanEnabled: true });
		return this._rows.map(row => {
			const rowObj: Record<string, Cell> = {};
			headers.forEach((header, index) => {
				rowObj[header] = row[index] || "";
			});
			return rowObj;
		});
	}

	private async load(options?: {
		timeout?: number;
		duplicateSuffix?: boolean;
		colspanEnabled?: boolean;
	}): Promise<void> {
		await Promise.all([
			this._headerRowLocator
				.locator(this._headerColumnSelector)
				.last()
				.waitFor({ state: "visible", ...options }),
			this._bodyRowLocator
				.locator(this._bodyRowColumnSelector)
				.last()
				.waitFor({ state: "visible", ...options }),
		]);

		this._headers = await TableHeader.getHeaderRows(this._headerRowLocator, this._headerColumnSelector, options);
		this._rows = await TableBody.getRows(this._bodyRowLocator, this._bodyRowColumnSelector);
	}
}
