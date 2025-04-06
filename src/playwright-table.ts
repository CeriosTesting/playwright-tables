import { Locator } from "@playwright/test";
import { TableBodyRow } from "./table-body-row";
import { BodyRow, Cell, HeaderRow } from "./row";
import { TableHeaderRow } from "./table-header-row";

export class PlaywrightTable {
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

	async getHeaderRows(): Promise<HeaderRow[]> {
		await this.load();
		return this._headers;
	}

	async getMainHeaderRow(): Promise<string[]> {
		const headerRows = await this.getHeaderRows();
		const headers = this._options?.header?.setMainHeaderRow
			? headerRows[this._options.header.setMainHeaderRow]
			: headerRows[this._headers.length - 1];
		return headers.map(header => header);
	}

	async getBodyRows(): Promise<BodyRow[]> {
		await this.load();
		return this._rows;
	}

	async getCellLocator(rowNumber: number, headerPosition: number): Promise<Locator> {
		return this._bodyRowLocator.nth(rowNumber).locator(this._bodyRowColumnSelector).nth(headerPosition);
	}

	async getCellLocatorByRowConditions(
		conditions: Record<string, string>,
		targetHeader: string
	): Promise<Locator> {
		await this.load();
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
				return this.getCellLocator(rowIndex, targetHeaderIndex);
			}
		}
	
		throw new Error(`No row found matching conditions: ${JSON.stringify(conditions)}`);
	}

	async getJson(): Promise<any> {
		await this.load();
		const headers = await this.getMainHeaderRow();
		return this._rows.map(row => {
			const rowObj: Record<string, Cell> = {};
			headers.forEach((header, index) => {
				rowObj[header] = row[index] || "";
			});
			return rowObj;
		});
	}

	private async load(options?: { timeout?: number }): Promise<void> {
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

		this._headers = await TableHeaderRow.getHeaderRows(this._headerRowLocator, this._headerColumnSelector);
		this._rows = await TableBodyRow.getRows(this._bodyRowLocator, this._bodyRowColumnSelector);
	}
}
