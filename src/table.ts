import { Locator } from "@playwright/test";
import { TableHeaderIndexer } from "./table-header-indexer";

export interface Row {
	columns: (string | boolean | number)[];
}

export class Table {
	private _headers: string[] = [];
	private _rows: Row[] = [];

	constructor(
		private readonly _headersLocator: Locator,
		private readonly _rowsLocator: Locator,
		private readonly _columnsSelector: string
	) {}

	async getHeaders(): Promise<string[]> {
		await this.load();
		return this._headers;
	}

	async getRows(): Promise<Row[]> {
		await this.load();
		return this._rows;
	}

	async getJson(): Promise<any> {
		await this.load();
		return this._rows.map(row => {
			const rowObj: Record<string, string | boolean | number> = {};
			this._headers.forEach((header, index) => {
				rowObj[header] = row.columns[index] || "";
			});
			return rowObj;
		});
	}

	private async load(options?: { timeout?: number }): Promise<void> {
		await Promise.all([
			this._headersLocator.last().waitFor({ state: "visible", ...options }),
			this._rowsLocator
				.locator(this._columnsSelector)
				.last()
				.waitFor({ state: "visible", ...options }),
		]);

		this._headers = await TableHeaderIndexer.HeadersIncludingColspanAndDuplicateAsync(this._headersLocator);

		this._rows = await this._rowsLocator.evaluateAll((rows, columnsSelector) => {
       // Tracks rowspan cells for each column index
			const spannedCells: Record<number, (string | boolean | number)[]> = {};

			const castContent = (value: string): string | number | boolean => {
				const lowerInput = value.trim().toLowerCase();
				if (lowerInput === "true") return true;
				if (lowerInput === "false") return false;

				const num = Number(value);
				const isNumber = !isNaN(num);
				const isDate = !isNaN(Date.parse(value)) && /\d{4}-\d{2}-\d{2}/.test(value);

				if (isDate) {
					return value;
				}

				if (isNumber) {
					return num;
				}

				return value;
			};

			return rows.map((row, rowIndex) => {
				const columns = Array.from(row.querySelectorAll(columnsSelector)).flatMap((col, colIndex) => {
					const rowspan = parseInt(col.getAttribute("rowspan") || "1", 10);
					const content = castContent(col.textContent?.trim() || "");

					if (rowspan > 1) {
						// Store the spanned content for subsequent rows
						for (let i = 1; i < rowspan; i++) {
							if (!spannedCells[rowIndex + i]) {
								spannedCells[rowIndex + i] = [];
							}
							spannedCells[rowIndex + i][colIndex] = content;
						}
					}

					return content;
				});

				// Merge spanned cells from previous rows
				if (spannedCells[rowIndex]) {
					spannedCells[rowIndex].forEach((spannedContent, colIndex) => {
						if (spannedContent !== undefined) {
							columns[colIndex] = spannedContent;
						}
					});
				}

				return { columns };
			});
		}, this._columnsSelector);
	}
}
