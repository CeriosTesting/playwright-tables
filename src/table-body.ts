import { Locator } from "@playwright/test";
import { BodyRow, Cell } from "./row";
import { CellContentType } from "./cell-content-type";
import { TableUtils } from "./table-utils";

/**
 * Utility class for extracting and processing table body rows.
 * Handles rowspan and colspan attributes to properly structure table data.
 */
export abstract class TableBody {
	/**
	 * Extracts body rows from a table with proper handling of rowspan and colspan.
	 *
	 * @param rowLocator - The Playwright locator for body rows.
	 * @param columnsSelector - CSS selector for locating columns within rows (e.g., "td").
	 * @param bodyRowsOptions - Optional configuration for cell content extraction.
	 * @param bodyRowsOptions.cellContentType - The type of content to extract (InnerText or TextContent).
	 * @returns Promise resolving to an array of processed body rows.
	 * @throws Error if columnsSelector is empty or if row processing fails.
	 *
	 * @example
	 * const rows = await TableBody.getRows(
	 *   page.locator('tbody tr'),
	 *   'td',
	 *   { cellContentType: CellContentType.TextContent }
	 * );
	 */
	static async getRows(
		rowLocator: Locator,
		columnsSelector: string,
		bodyRowsOptions?: {
			cellContentType?: CellContentType;
		}
	): Promise<BodyRow[]> {
		if (!columnsSelector || columnsSelector.trim() === "") {
			throw new Error("columnsSelector cannot be empty");
		}

		const locatorDescription = rowLocator.toString();
		const rows: BodyRow[] = [];
		const rowsCount = await rowLocator.count();

		if (rowsCount === 0) {
			return rows;
		}

		const spannedCells: Record<number, Cell[]> = {};

		for (let rowIndex = 0; rowIndex < rowsCount; rowIndex++) {
			try {
				const row = rowLocator.nth(rowIndex);
				const columns = await this.extractColumns(
					row,
					columnsSelector,
					rowIndex,
					spannedCells,
					bodyRowsOptions?.cellContentType
				);
				rows.push(columns as BodyRow);
			} catch (error) {
				throw new Error(
					`Failed to process body row at index ${rowIndex}.\n` +
						`Body row locator: ${locatorDescription}\n` +
						`Columns selector: "${columnsSelector}"\n` +
						`Error: ${error instanceof Error ? error.message : String(error)}`
				);
			}
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

		if (columnCount === 0) {
			return columns;
		}

		const cellDataPromises = [];
		for (let colIndex = 0; colIndex < columnCount; colIndex++) {
			cellDataPromises.push(this.fetchCellData(columnLocators.nth(colIndex), cellContentType));
		}
		const cellDataArray = await Promise.all(cellDataPromises);

		for (let colIndex = 0; colIndex < columnCount; colIndex++) {
			const cellData = cellDataArray[colIndex];
			this.processCellData(cellData, colIndex, columns, rowIndex, spannedCells);
		}

		this.applySpannedCells(spannedCells, rowIndex, columns);

		return columns;
	}

	/**
	 * Fetches cell content and span attributes in parallel.
	 * This method performs DOM operations that can be parallelized across multiple cells.
	 */
	private static async fetchCellData(
		column: Locator,
		cellContentType: CellContentType = CellContentType.InnerText
	): Promise<{ content: string; rowspan: number; colspan: number }> {
		const [content, spanAttributes] = await Promise.all([
			TableUtils.getCellContent(column, cellContentType),
			TableUtils.parseSpanAttributes(column),
		]);

		return {
			content,
			rowspan: spanAttributes.rowspan,
			colspan: spanAttributes.colspan,
		};
	}

	/**
	 * Processes pre-fetched cell data and applies it to the columns array.
	 * This method is purely computational and doesn't perform any DOM operations.
	 */
	private static processCellData(
		cellData: { content: string; rowspan: number; colspan: number },
		colIndex: number,
		columns: Cell[],
		rowIndex: number,
		spannedCells: Record<number, Cell[]>
	): void {
		const { content, rowspan, colspan } = cellData;

		if (colIndex < 0) {
			throw new Error(`Invalid column index: ${colIndex}. Must be non-negative.`);
		}
		if (rowIndex < 0) {
			throw new Error(`Invalid row index: ${rowIndex}. Must be non-negative.`);
		}

		for (let span = 0; span < colspan; span++) {
			columns[colIndex + span] = content;
		}

		if (rowspan > 1) {
			this.storeSpannedCells(rowIndex, colIndex, rowspan, content, spannedCells);
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
