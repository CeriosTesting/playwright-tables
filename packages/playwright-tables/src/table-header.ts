import { Locator } from "@playwright/test";
import { HeaderRow } from "./row";

export abstract class TableHeader {
	static async getHeaderRows(headerRowLocator: Locator, columnsSelector: string): Promise<HeaderRow[]> {
		const headerRows: HeaderRow[] = [];
		const rowSpans: (string | null)[] = [];

		for (let i = 0; i < (await headerRowLocator.count()); i++) {
			const row = headerRowLocator.nth(i);
			const columns = row.locator(columnsSelector);
			const columnTexts = await this.processRow(columns, rowSpans, i);
			headerRows.push(columnTexts);
		}

		return headerRows;
	}

	private static async processRow(columns: Locator, rowSpans: (string | null)[], rowIndex: number): Promise<string[]> {
		const columnTexts: string[] = [];
		const nameCount: Record<string, number> = {};
		let colIndex = 0;

		for (let j = 0; j < (await columns.count()); j++) {
			const column = columns.nth(j);
			colIndex = await this.processColumn(column, columnTexts, rowSpans, nameCount, colIndex, rowIndex);
		}

		while (rowSpans[colIndex]) {
			columnTexts.push(rowSpans[colIndex]!);
			rowSpans[colIndex] = null;
			colIndex++;
		}

		return columnTexts;
	}

	private static async processColumn(
		column: Locator,
		columnTexts: string[],
		rowSpans: (string | null)[],
		nameCount: Record<string, number>,
		colIndex: number,
		rowIndex: number
	): Promise<number> {
		let text = await column.innerText();
		text = text.trim();

		const colspan = parseInt((await column.getAttribute("colspan")) || "1", 10);
		const rowspan = parseInt((await column.getAttribute("rowspan")) || "1", 10);

		text = this.handleDuplicateHeaderNames(text, nameCount);

		colIndex = this.insertRowSpans(columnTexts, rowSpans, colIndex);
		columnTexts.push(text);

		this.fillRowSpans(rowSpans, text, colIndex, rowspan, rowIndex);

		colIndex++;

		colIndex = this.handleColspan(columnTexts, text, colIndex, colspan);

		return colIndex;
	}

	private static handleDuplicateHeaderNames(text: string, nameCount: Record<string, number>): string {
		if (nameCount[text] !== undefined) {
			nameCount[text]++;
			return `${text}_${nameCount[text]}`;
		} else {
			nameCount[text] = 0;
			return text;
		}
	}

	private static insertRowSpans(columnTexts: string[], rowSpans: (string | null)[], colIndex: number): number {
		while (rowSpans[colIndex]) {
			columnTexts.push(rowSpans[colIndex]!);
			rowSpans[colIndex] = null;
			colIndex++;
		}
		return colIndex;
	}

	private static fillRowSpans(
		rowSpans: (string | null)[],
		text: string,
		colIndex: number,
		rowspan: number,
		rowIndex: number
	): void {
		for (let r = 1; r < rowspan; r++) {
			if (rowIndex + r >= rowSpans.length) {
				rowSpans.push(null);
			}
			rowSpans[colIndex] = text;
		}
	}

	private static handleColspan(columnTexts: string[], text: string, colIndex: number, colspan: number): number {
		for (let c = 1; c < colspan; c++) {
			columnTexts.push(`${text}_${c}`);
			colIndex++;
		}
		return colIndex;
	}
}
