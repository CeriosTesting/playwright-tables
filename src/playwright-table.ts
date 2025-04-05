import { Locator } from "@playwright/test";
import { TableBodyRow } from "./table-body-row";
import { BodyRow, Cell, HeaderRow } from "./row";
import { TableHeaderRow } from "./table-header-row";

export class PlaywrightTable {
	private _headers: HeaderRow[] = [];
	private _rows: BodyRow[] = [];

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
	) {}

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

	async getRows(): Promise<TableBodyRow[]> {
		await this.load();
		return this._rows;
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
		const headersLocator = this._tableLocator.locator(this._options?.header?.rowSelector ?? "thead>tr");
		const headersColumnSelector = this._options?.header?.columnSelector ?? "th";
		const rowsLocator = this._tableLocator.locator(this._options?.row?.rowSelector ?? "tbody>tr");
		const rowColumnSelector = this._options?.row?.columnSelector ?? "td";

		await Promise.all([
			headersLocator
				.locator(headersColumnSelector)
				.last()
				.waitFor({ state: "visible", ...options }),
			rowsLocator
				.locator(rowColumnSelector)
				.last()
				.waitFor({ state: "visible", ...options }),
		]);

		this._headers = await TableHeaderRow.getHeaderRows(headersLocator, headersColumnSelector);
		this._rows = await TableBodyRow.getRows(rowsLocator, rowColumnSelector);
	}
}
