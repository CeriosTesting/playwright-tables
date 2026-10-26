import { Locator } from "@playwright/test";

import { CellContentType } from "./cell-content-type";
import { BodyRow, Cell } from "./row";
import { TableUtils } from "./table-utils";

/**
 * The DOM cell behind a grid position: the cell at index `cell` among the cells of body row `row`.
 * A rowspan cell is the source of positions in later rows too.
 */
export type CellSource = { row: number; cell: number };

/** Cell contents carried down by rowspans, by row index. Columns without a carried cell are holes. */
type SpannedCells = Record<number, ({ content: Cell; source: CellSource } | undefined)[]>;

type CellData = { content: string; rowspan: number; colspan: number };

/**
 * Utility class for extracting and processing table body rows.
 * Handles rowspan and colspan attributes to properly structure table data.
 * Contains only static methods - cannot be instantiated.
 */
export class TableBody {
	private constructor() {
		// Prevent instantiation - this class only has static methods
	}
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
		return (await this.getRowsWithSources(rowLocator, columnsSelector, bodyRowsOptions)).rows;
	}

	/**
	 * Like {@link getRows}, and also returns, for every grid position, the DOM cell it comes from.
	 * `sources[r][c]` is `undefined` for a position without a cell.
	 *
	 * @internal
	 */
	static async getRowsWithSources(
		rowLocator: Locator,
		columnsSelector: string,
		bodyRowsOptions?: {
			cellContentType?: CellContentType;
		}
	): Promise<{ rows: BodyRow[]; sources: (CellSource | undefined)[][] }> {
		if (!columnsSelector || columnsSelector.trim() === "") {
			throw new Error("columnsSelector cannot be empty");
		}

		const locatorDescription = rowLocator.toString();
		const rowsCount = await rowLocator.count();
		const cellContentType = bodyRowsOptions?.cellContentType ?? CellContentType.InnerText;

		// Read every row in parallel, one round trip each; the spans are resolved afterwards, in order.
		const cellData = await Promise.all(
			Array.from({ length: rowsCount }, async (_, rowIndex) => {
				try {
					return await TableUtils.readRowCells(rowLocator.nth(rowIndex), columnsSelector, cellContentType);
				} catch (error) {
					throw this.rowError(rowIndex, locatorDescription, columnsSelector, error);
				}
			})
		);

		const rows: BodyRow[] = [];
		const sources: (CellSource | undefined)[][] = [];
		const spannedCells: SpannedCells = {};
		for (const [rowIndex, cells] of cellData.entries()) {
			try {
				const row = this.placeCells(cells, rowIndex, spannedCells);
				rows.push(row.columns);
				sources.push(row.sources);
			} catch (error) {
				throw this.rowError(rowIndex, locatorDescription, columnsSelector, error);
			}
		}

		return { rows, sources };
	}

	private static rowError(
		rowIndex: number,
		locatorDescription: string,
		columnsSelector: string,
		error: unknown
	): Error {
		return new Error(
			`Failed to process body row at index ${rowIndex}.\n` +
				`Body row locator: ${locatorDescription}\n` +
				`Columns selector: "${columnsSelector}"\n` +
				`Error: ${error instanceof Error ? error.message : String(error)}`
		);
	}

	/** Places the cells of one row on the grid, skipping the positions taken by rowspans from above. */
	private static placeCells(
		cells: CellData[],
		rowIndex: number,
		spannedCells: SpannedCells
	): { columns: Cell[]; sources: (CellSource | undefined)[] } {
		const columns: Cell[] = [];
		const sources: (CellSource | undefined)[] = [];

		// First, determine which column positions are occupied by rowspans from above
		const spannedPositions = new Set<number>();
		spannedCells[rowIndex]?.forEach((spanned, colIndex) => {
			if (spanned !== undefined) {
				spannedPositions.add(colIndex);
			}
		});

		// Process cells, accounting for spanned positions
		let actualColIndex = 0;
		for (const [cellIndex, cellData] of cells.entries()) {
			// Skip columns that are occupied by rowspans from above
			while (spannedPositions.has(actualColIndex)) {
				actualColIndex++;
			}

			const source = { row: rowIndex, cell: cellIndex };
			for (let span = 0; span < cellData.colspan; span++) {
				columns[actualColIndex + span] = cellData.content;
				sources[actualColIndex + span] = source;
			}
			if (cellData.rowspan > 1) {
				this.storeSpannedCells(rowIndex, actualColIndex, cellData, source, spannedCells);
			}

			// Move past this cell and any colspan it creates
			actualColIndex += cellData.colspan;
		}

		// Apply any spanned cells, also when this row has no DOM cells
		spannedCells[rowIndex]?.forEach((spanned, colIndex) => {
			if (spanned !== undefined) {
				columns[colIndex] = spanned.content;
				sources[colIndex] = spanned.source;
			}
		});

		return { columns, sources };
	}

	private static storeSpannedCells(
		rowIndex: number,
		colIndex: number,
		cellData: CellData,
		source: CellSource,
		spannedCells: SpannedCells
	): void {
		for (let rowSpan = 1; rowSpan < cellData.rowspan; rowSpan++) {
			const spannedRow = spannedCells[rowIndex + rowSpan] ?? [];
			spannedCells[rowIndex + rowSpan] = spannedRow;
			// Store the content for each column covered by colspan
			for (let colSpan = 0; colSpan < cellData.colspan; colSpan++) {
				spannedRow[colIndex + colSpan] = { content: cellData.content, source };
			}
		}
	}
}
