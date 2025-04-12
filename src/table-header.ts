import { Locator } from "@playwright/test";
import { HeaderRow } from "./row";

export abstract class TableHeader {
	static async getHeaderRows(
		headerRowLocator: Locator,
		columnsSelector: string,
		options?: { duplicateSuffix?: boolean; colspanEnabled?: boolean }
	): Promise<HeaderRow[]> {
		const headerRows: HeaderRow[] = [];
		const rowSpans: (string | null)[] = [];
		const duplicateSuffix = options?.duplicateSuffix ?? false;
		const colspanEnabled = options?.colspanEnabled ?? false;

		for (let i = 0; i < (await headerRowLocator.count()); i++) {
			const row = headerRowLocator.nth(i);
			const columns = row.locator(columnsSelector);
			const columnTexts = await this.processRow(columns, rowSpans, i, duplicateSuffix, colspanEnabled);
			headerRows.push(columnTexts);
		}

		return headerRows;
	}

	private static async processRow(
		columns: Locator,
		rowSpans: (string | null)[],
		rowIndex: number,
		duplicateSuffix: boolean,
		colspanEnabled: boolean
	): Promise<string[]> {
		const columnTexts: string[] = [];
		const nameCount: Record<string, number> = {};
		let colIndex = 0;

		for (let j = 0; j < (await columns.count()); j++) {
			const column = columns.nth(j);
			colIndex = await this.processColumn(
				column,
				columnTexts,
				rowSpans,
				nameCount,
				colIndex,
				rowIndex,
				duplicateSuffix,
				colspanEnabled
			);
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
		rowIndex: number,
		duplicateSuffix: boolean,
		colspanEnabled: boolean
	): Promise<number> {
		let text = await column.innerText();
		text = text.trim();

		const colspan = colspanEnabled ? parseInt((await column.getAttribute("colspan")) || "1", 10) : 1;
		const rowspan = parseInt((await column.getAttribute("rowspan")) || "1", 10);

		text = this.handleDuplicateHeaderNames(text, nameCount, duplicateSuffix);

		colIndex = this.insertRowSpans(columnTexts, rowSpans, colIndex);
		columnTexts.push(text);

		this.fillRowSpans(rowSpans, text, colIndex, rowspan, rowIndex);

		colIndex++;

		colIndex = this.handleColspan(columnTexts, text, colIndex, colspan, duplicateSuffix, nameCount, colspanEnabled);

		return colIndex;
	}

	private static handleDuplicateHeaderNames(
		text: string,
		nameCount: Record<string, number>,
		duplicateSuffix: boolean
	): string {
		if (!duplicateSuffix) {
			return text;
		}

		if (nameCount[text] !== undefined) {
			nameCount[text]++;
			return `${text}_${nameCount[text]}`;
		} else {
			nameCount[text] = 0;
			return text;
		}
	}

	private static handleColspan(
		columnTexts: string[],
		text: string,
		colIndex: number,
		colspan: number,
		duplicateSuffix: boolean,
		nameCount: Record<string, number>,
		colspanEnabled: boolean
	): number {
		if (!colspanEnabled) {
			return colIndex;
		}
		for (let c = 1; c < colspan; c++) {
			let colspanText = text;
			if (duplicateSuffix) {
				if (nameCount[text] !== undefined) {
					nameCount[text]++;
					colspanText = `${text}_${nameCount[text]}`;
				} else {
					nameCount[text] = 0;
					colspanText = `${text}_1`;
				}
			}
			columnTexts.push(colspanText);
			colIndex++;
		}
		return colIndex;
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
}
