import { Locator } from "@playwright/test";
import { BodyRow, Cell } from "./row";

export abstract class TableBody {
	static async getRows(rowLocator: Locator, columnsSelector: string): Promise<BodyRow[]> {
		const rows: BodyRow[] = [];
		const rowsCount = await rowLocator.count();
		const spannedCells: Record<number, Cell[]> = {};

		for (let rowIndex = 0; rowIndex < rowsCount; rowIndex++) {
			const row = rowLocator.nth(rowIndex);
			const columns = await this.extractColumns(row, columnsSelector, rowIndex, spannedCells);
			rows.push(columns as BodyRow);
		}

		return rows;
	}

	private static async extractColumns(
		row: Locator,
		columnsSelector: string,
		rowIndex: number,
		spannedCells: Record<number, Cell[]>
	): Promise<Cell[]> {
		const columns: Cell[] = [];
		const columnLocators = row.locator(columnsSelector);
		const columnCount = await columnLocators.count();

		for (let colIndex = 0; colIndex < columnCount; colIndex++) {
			await this.processColumn(columnLocators.nth(colIndex), colIndex, columns, rowIndex, spannedCells);
		}

		this.applySpannedCells(spannedCells, rowIndex, columns);

		return columns;
	}

	private static async processColumn(
		column: Locator,
		colIndex: number,
		columns: Cell[],
		rowIndex: number,
		spannedCells: Record<number, Cell[]>
	): Promise<void> {
		const content = await column.textContent();
		const castedContent = this.castContent(content?.trim() || "");

		const rowspan = parseInt((await column.getAttribute("rowspan")) || "1", 10);
		const colspan = parseInt((await column.getAttribute("colspan")) || "1", 10);

		for (let span = 0; span < colspan; span++) {
			columns[colIndex + span] = castedContent;
		}

		if (rowspan > 1) {
			this.storeSpannedCells(rowIndex, colIndex, rowspan, castedContent, spannedCells);
		}
	}

	private static storeSpannedCells(
		rowIndex: number,
		colIndex: number,
		rowspan: number,
		content: Cell,
		spannedCells: Record<number, Cell[]>
	): void {
		for (let span = 1; span < rowspan; span++) {
			if (!spannedCells[rowIndex + span]) {
				spannedCells[rowIndex + span] = [];
			}
			spannedCells[rowIndex + span][colIndex] = content;
		}
	}

	private static applySpannedCells(spannedCells: Record<number, Cell[]>, rowIndex: number, columns: Cell[]): void {
		if (spannedCells[rowIndex]) {
			spannedCells[rowIndex].forEach((spannedContent, colIndex) => {
				if (spannedContent !== undefined) {
					columns[colIndex] = spannedContent;
				}
			});
		}
	}

	private static castContent(value: string): Cell {
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
	}
}
