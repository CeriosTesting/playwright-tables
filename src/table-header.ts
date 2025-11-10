import { Locator } from "@playwright/test";
import { HeaderRow } from "./row";
import { CellContentType } from "./cell-content-type";
import { TableUtils } from "./table-utils";

/**
 * Options for configuring a table header row.
 *
 * @property cellContentType - The type of content allowed in the header cell.
 * @property emptyCellReplacement - If true, replaces empty header cells with a default value.
 * @property duplicateSuffix - If true, appends a suffix to duplicate header values.
 * @property colspan - Configuration for column spanning in the header row.
 * @property colspan.enabled - If true, enables column spanning.
 * @property colspan.suffix - If true, appends a suffix to spanned columns.
 */
export type HeaderRowOptions = {
	cellContentType?: CellContentType;
	emptyCellReplacement?: boolean;
	duplicateSuffix?: boolean;
	colspan?: { enabled?: boolean; suffix?: boolean };
};

/**
 * Utility class for extracting and processing table header rows.
 * Handles complex scenarios including colspan, rowspan, empty cells, and duplicate header names.
 */
export abstract class TableHeader {
	private static readonly EMPTY_CELL_PLACEHOLDER = "{{Empty}}";
	private static readonly COLSPAN_SUFFIX_PREFIX = "__C";
	private static readonly DUPLICATE_SUFFIX_PREFIX = "__D";
	private static readonly COLSPAN_PATTERN = /__C\d+/;

	/**
	 * Extracts header rows from a table with optional processing for colspan, rowspan, and duplicates.
	 *
	 * @param headerRowLocator - The Playwright locator for header rows.
	 * @param columnsSelector - CSS selector for locating header columns (e.g., "th").
	 * @param headerRowOptions - Optional configuration for header processing.
	 * @returns Promise resolving to an array of processed header rows.
	 * @throws Error if columnsSelector is empty or if no header rows are found.
	 *
	 * @example
	 * const headers = await TableHeader.getRows(
	 *   page.locator('thead tr'),
	 *   'th',
	 *   { duplicateSuffix: true, colspan: { enabled: true } }
	 * );
	 */
	static async getRows(
		headerRowLocator: Locator,
		columnsSelector: string,
		headerRowOptions?: HeaderRowOptions
	): Promise<HeaderRow[]> {
		// Input validation
		if (!columnsSelector || columnsSelector.trim() === "") {
			throw new Error("columnsSelector cannot be empty");
		}

		const locatorDescription = headerRowLocator.toString();
		const options = this.getDefaultOptions(headerRowOptions);
		const rows = await headerRowLocator.all();

		const headerRows: HeaderRow[] = [];

		// Allow zero rows - validation happens at TableWait level
		if (rows.length === 0) {
			return headerRows;
		}

		const rowSpans: Map<number, string> = new Map();

		for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
			try {
				const headerRow = await this.processRow(rows[rowIndex], columnsSelector, rowSpans, options);
				headerRows.push(headerRow);
			} catch (error) {
				throw new Error(
					`Failed to process header row at index ${rowIndex}.\n` +
						`Header row locator: ${locatorDescription}\n` +
						`Columns selector: "${columnsSelector}"\n` +
						`Error: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}

		this.applyColspanOptions(headerRows, options);
		this.applyDuplicateSuffix(headerRows, options);

		return headerRows;
	}

	private static getDefaultOptions(options?: HeaderRowOptions): Required<HeaderRowOptions> {
		return {
			cellContentType: options?.cellContentType ?? CellContentType.InnerText,
			emptyCellReplacement: options?.emptyCellReplacement ?? false,
			duplicateSuffix: options?.duplicateSuffix ?? false,
			colspan: {
				enabled: options?.colspan?.enabled ?? false,
				suffix: options?.colspan?.suffix ?? false,
			},
		};
	}

	private static async processRow(
		row: Locator,
		columnsSelector: string,
		rowSpans: Map<number, string>,
		options: Required<HeaderRowOptions>
	): Promise<HeaderRow> {
		const headerRow: HeaderRow = [];
		const cells = await row.locator(columnsSelector).all();

		if (cells.length === 0) {
			return headerRow;
		}

		// Phase 1: Fetch all cell data in parallel (major performance win!)
		const cellDataArray = await Promise.all(cells.map(cell => this.fetchHeaderCellData(cell, options.cellContentType)));

		// Phase 2: Process cells sequentially with pre-fetched data
		let columnIndex = 0;
		for (let i = 0; i < cellDataArray.length; i++) {
			columnIndex = this.processHeaderCellData(
				cellDataArray[i],
				headerRow,
				rowSpans,
				columnIndex,
				options.emptyCellReplacement
			);
		}

		this.addRemainingRowSpans(headerRow, rowSpans, columnIndex);
		return headerRow;
	}

	/**
	 * Fetches header cell content and span attributes in parallel.
	 * This method performs DOM operations that can be parallelized across multiple cells.
	 */
	private static async fetchHeaderCellData(
		cell: Locator,
		cellContentType: CellContentType
	): Promise<{ text: string; rowspan: number; colspan: number }> {
		// Fetch content and span attributes in parallel for each cell
		const [text, spanAttributes] = await Promise.all([
			TableUtils.getCellContent(cell, cellContentType),
			TableUtils.parseSpanAttributes(cell),
		]);

		return {
			text,
			rowspan: spanAttributes.rowspan,
			colspan: spanAttributes.colspan,
		};
	}

	/**
	 * Processes pre-fetched header cell data and applies it to the header row.
	 * This method is purely computational and doesn't perform any DOM operations.
	 */
	private static processHeaderCellData(
		cellData: { text: string; rowspan: number; colspan: number },
		headerRow: HeaderRow,
		rowSpans: Map<number, string>,
		columnIndex: number,
		emptyCellReplacement: boolean
	): number {
		// Insert any rowspan cells that belong in this position
		while (rowSpans.has(columnIndex)) {
			headerRow.push(rowSpans.get(columnIndex)!);
			rowSpans.delete(columnIndex);
			columnIndex++;
		}

		// Apply empty cell replacement if needed
		let text = cellData.text;
		if (!text && emptyCellReplacement) {
			text = this.EMPTY_CELL_PLACEHOLDER;
		}

		const { colspan, rowspan } = cellData;

		// Add the cell and handle spanning
		headerRow.push(text);
		this.handleColspan(headerRow, text, colspan);
		this.handleRowspan(rowSpans, text, columnIndex, colspan, rowspan);

		return columnIndex + colspan;
	}

	private static handleColspan(headerRow: HeaderRow, text: string, colspan: number): void {
		for (let i = 1; i < colspan; i++) {
			headerRow.push(`${text}${this.COLSPAN_SUFFIX_PREFIX}${i}`);
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

	private static applyColspanOptions(headerRows: HeaderRow[], options: Required<HeaderRowOptions>): void {
		if (!options.colspan.enabled) {
			this.removeColspanCells(headerRows);
		}

		if (!options.colspan.suffix) {
			this.removeColspanSuffix(headerRows);
		}
	}

	private static removeColspanCells(headerRows: HeaderRow[]): void {
		for (let i = 0; i < headerRows.length; i++) {
			headerRows[i] = headerRows[i].filter(cell => !this.COLSPAN_PATTERN.test(cell));
		}
	}

	private static removeColspanSuffix(headerRows: HeaderRow[]): void {
		for (const headerRow of headerRows) {
			for (let i = 0; i < headerRow.length; i++) {
				if (this.COLSPAN_PATTERN.test(headerRow[i])) {
					headerRow[i] = headerRow[i].replace(this.COLSPAN_PATTERN, "");
				}
			}
		}
	}

	private static applyDuplicateSuffix(headerRows: HeaderRow[], options: Required<HeaderRowOptions>): void {
		if (!options.duplicateSuffix) return;

		for (const headerRow of headerRows) {
			const headerCountMap: Map<string, number> = new Map();
			for (let i = 0; i < headerRow.length; i++) {
				const header = headerRow[i];
				const currentCount = headerCountMap.get(header);
				if (currentCount !== undefined) {
					headerRow[i] = `${header}${this.DUPLICATE_SUFFIX_PREFIX}${currentCount}`;
					headerCountMap.set(header, currentCount + 1);
				} else {
					headerCountMap.set(header, 1);
				}
			}
		}
	}
}
