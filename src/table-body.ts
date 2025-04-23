import { Locator } from "@playwright/test";
import { BodyRow, Cell } from "./row";
import { CellContentType } from "./cell-content-type";
import { TableUtils } from "./table-utils";

export abstract class TableBody {
	static async getRows(
		rowLocator: Locator,
		columnsSelector: string,
		bodyRowsOptions?: {
			cellContentType?: CellContentType;
		}
	): Promise<BodyRow[]> {
		const rows: BodyRow[] = [];
		const rowsCount = await rowLocator.count();
		const spannedCells: Record<number, Cell[]> = {};

		for (let rowIndex = 0; rowIndex < rowsCount; rowIndex++) {
			const row = rowLocator.nth(rowIndex);
			const columns = await this.extractColumns(
				row,
				columnsSelector,
				rowIndex,
				spannedCells,
				bodyRowsOptions?.cellContentType
			);
			rows.push(columns as BodyRow);
		}

		return rows;
	}

	private static async extractColumns(
		row: Locator,
		columnsSelector: string,
		rowIndex: number,
		spannedCells: Record<number, Cell[]>,
		cellContentType?: CellContentType
	): Promise<Cell[]> {
		const columns: Cell[] = [];
		const columnLocators = row.locator(columnsSelector);
		const columnCount = await columnLocators.count();

		for (let colIndex = 0; colIndex < columnCount; colIndex++) {
			await this.processColumn(
				columnLocators.nth(colIndex),
				colIndex,
				columns,
				rowIndex,
				spannedCells,
				cellContentType
			);
		}

		this.applySpannedCells(spannedCells, rowIndex, columns);

		return columns;
	}

	private static async processColumn(
		column: Locator,
		colIndex: number,
		columns: Cell[],
		rowIndex: number,
		spannedCells: Record<number, Cell[]>,
		cellContentType: CellContentType = CellContentType.InnerText
	): Promise<void> {
		const content = await TableUtils.getCellContent(column, cellContentType);
		const castedContent = TableUtils.castContent(content);

		const { rowspan, colspan } = await TableUtils.parseSpanAttributes(column);

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
}
