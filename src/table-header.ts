import { Locator } from "@playwright/test";
import { HeaderRow } from "./row";

export type HeaderRowsOptions = {
	emptyCellReplacement?: boolean;
	duplicateSuffix?: boolean;
	colspan?: { enabled?: boolean; suffix?: boolean };
};

export abstract class TableHeader {
	static async getHeaderRows(
		headerRowLocator: Locator,
		columnsSelector: string,
		headerRowsOptions?: HeaderRowsOptions
	): Promise<HeaderRow[]> {
		const options = this.getDefaultOptions(headerRowsOptions);
		const rows = await headerRowLocator.all();
		const headerRows: HeaderRow[] = [];
		const rowSpans: Map<number, string> = new Map();

		for (const row of rows) {
			const headerRow = await this.processRow(row, columnsSelector, rowSpans, options);
			headerRows.push(headerRow);
		}

		this.applyColspanOptions(headerRows, options);
		this.applyDuplicateSuffix(headerRows, options);

		return headerRows;
	}

	private static getDefaultOptions(options?: HeaderRowsOptions): Required<HeaderRowsOptions> {
		return {
			emptyCellReplacement: options?.emptyCellReplacement ?? true,
			duplicateSuffix: options?.duplicateSuffix ?? false,
			colspan: {
				enabled: options?.colspan?.enabled ?? true,
				suffix: options?.colspan?.suffix ?? false,
			},
		};
	}

	private static async processRow(
		row: Locator,
		columnsSelector: string,
		rowSpans: Map<number, string>,
		options: Required<HeaderRowsOptions>
	): Promise<HeaderRow> {
		const headerRow: HeaderRow = [];
		const cells = await row.locator(columnsSelector).all();
		let columnIndex = 0;

		for (const cell of cells) {
			columnIndex = await this.processCell(cell, headerRow, rowSpans, columnIndex, options);
		}

		this.addRemainingRowSpans(headerRow, rowSpans, columnIndex);
		return headerRow;
	}

	private static async processCell(
		cell: Locator,
		headerRow: HeaderRow,
		rowSpans: Map<number, string>,
		columnIndex: number,
		options: Required<HeaderRowsOptions>
	): Promise<number> {
		while (rowSpans.has(columnIndex)) {
			headerRow.push(rowSpans.get(columnIndex)!);
			rowSpans.delete(columnIndex);
			columnIndex++;
		}

		let text = (await cell.textContent())?.trim() || "";
		if (!text && options.emptyCellReplacement) {
			text = "{{Empty}}";
		}

		const colspan = parseInt((await cell.getAttribute("colspan")) || "1", 10);
		const rowspan = parseInt((await cell.getAttribute("rowspan")) || "1", 10);

		headerRow.push(text);
		this.handleColspan(headerRow, text, colspan);
		this.handleRowspan(rowSpans, text, columnIndex, colspan, rowspan);

		return columnIndex + colspan;
	}

	private static handleColspan(headerRow: HeaderRow, text: string, colspan: number): void {
		for (let i = 1; i < colspan; i++) {
			headerRow.push(`${text}__C${i}`);
		}
	}

	private static handleRowspan(
		rowSpans: Map<number, string>,
		text: string,
		columnIndex: number,
		colspan: number,
		rowspan: number
	): void {
		if (rowspan > 1) {
			for (let i = 0; i < colspan; i++) {
				rowSpans.set(columnIndex + i, text);
			}
		}
	}

	private static addRemainingRowSpans(headerRow: HeaderRow, rowSpans: Map<number, string>, columnIndex: number): void {
		while (rowSpans.has(columnIndex)) {
			headerRow.push(rowSpans.get(columnIndex)!);
			rowSpans.delete(columnIndex);
			columnIndex++;
		}
	}

	private static applyColspanOptions(headerRows: HeaderRow[], options: Required<HeaderRowsOptions>): void {
		if (!options.colspan.enabled) {
			this.removeColspanCells(headerRows);
		}

		if (!options.colspan.suffix) {
			this.removeColspanSuffix(headerRows);
		}
	}

	private static removeColspanCells(headerRows: HeaderRow[]): void {
		for (const headerRow of headerRows) {
			for (let i = 0; i < headerRow.length; i++) {
				if (/__C\d/.test(headerRow[i])) {
					headerRow.splice(i, 1);
					i--;
				}
			}
		}
	}

	private static removeColspanSuffix(headerRows: HeaderRow[]): void {
		for (const headerRow of headerRows) {
			for (let i = 0; i < headerRow.length; i++) {
				if (/__C\d/.test(headerRow[i])) {
					headerRow[i] = headerRow[i].replace(/__C\d/, "");
				}
			}
		}
	}

	private static applyDuplicateSuffix(headerRows: HeaderRow[], options: Required<HeaderRowsOptions>): void {
		if (!options.duplicateSuffix) return;

		for (const headerRow of headerRows) {
			const headerCountMap: Map<string, number> = new Map();
			for (let i = 0; i < headerRow.length; i++) {
				const header = headerRow[i];
				if (headerCountMap.has(header)) {
					const count = headerCountMap.get(header)!;
					headerRow[i] = `${header}__D${count}`;
					headerCountMap.set(header, count + 1);
				} else {
					headerCountMap.set(header, 1);
				}
			}
		}
	}
}
