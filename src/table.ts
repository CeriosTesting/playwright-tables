import { Locator } from "@playwright/test";
import { TableHeaderIndexer } from "./table-header-indexer";

export type Column = (string | boolean | number);

export interface Row {
	columns: Column[];
}

export class Table {
	private _headers: string[] = [];
	private _rows: Row[] = [];

	constructor(
    private readonly _tableLocator: Locator,
    private readonly _options?: {
      headersSelector?: string;
      rowsSelector?: string;
      columnsSelector?: string;
    },
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
			const rowObj: Record<string, Column> = {};
			this._headers.forEach((header, index) => {
				rowObj[header] = row.columns[index] || "";
			});
			return rowObj;
		});
	}

	private async load(options?: { timeout?: number }): Promise<void> {
    const headersLocator = this._tableLocator.locator(this._options?.headersSelector ?? "thead>tr:last-of-type>th");
    const rowsLocator = this._tableLocator.locator(this._options?.rowsSelector ?? "tbody>tr");
    const columnsSelector = this._options?.columnsSelector ?? "td";

		await Promise.all([
			headersLocator.last().waitFor({ state: "visible", ...options }),
			rowsLocator
				.locator(columnsSelector)
				.last()
				.waitFor({ state: "visible", ...options }),
		]);

		this._headers = await TableHeaderIndexer.HeadersIncludingColspanAndDuplicateAsync(headersLocator);

		this._rows = await rowsLocator.evaluateAll((rows, columnsSelector) => {
       // Tracks rowspan cells for each column index
			const spannedCells: Record<number, Column[]> = {};

			const castContent = (value: string): Column => {
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
		}, columnsSelector);
	}
}
