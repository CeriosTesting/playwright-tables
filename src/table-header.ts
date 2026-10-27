import { Locator } from "@playwright/test";

import { CellContentType } from "./cell-content-type";
import { HeaderRow } from "./row";
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
 * @property normalizeWhitespace - If true, collapses line breaks, tabs and runs of whitespace to one space.
 * @property stripIconGlyphs - If true, removes icon-font glyphs (Unicode private use characters).
 */
export type HeaderRowOptions = {
	cellContentType?: CellContentType;
	emptyCellReplacement?: boolean;
	duplicateSuffix?: boolean;
	colspan?: { enabled?: boolean; suffix?: boolean };
	normalizeWhitespace?: boolean;
	stripIconGlyphs?: boolean;
};

/** The cells of earlier header rows that span into the next rows, by column, with the rows they still cover. */
type RowSpans = Map<number, { text: string; rows: number }>;

/**
 * Utility class for extracting and processing table header rows.
 * Handles complex scenarios including colspan, rowspan, empty cells, and duplicate header names.
 * Contains only static methods - cannot be instantiated.
 */
export class TableHeader {
	private constructor() {
		// Prevent instantiation - this class only has static methods
	}
	private static readonly EMPTY_CELL_PLACEHOLDER = "{{Empty}}";
	private static readonly COLSPAN_SUFFIX_PREFIX = "__C";
	private static readonly DUPLICATE_SUFFIX_PREFIX = "__D";
	private static readonly COLSPAN_PATTERN = /__C\d+/;
	private static readonly ICON_GLYPH_PATTERN = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;
	private static readonly CONTROL_WHITESPACE_PATTERN = /[\p{Cc}\p{Zl}\p{Zp}]+/gu;
	private static readonly WHITESPACE_PATTERN = /\s+/g;

	/**
	 * Extracts header rows from a table with optional processing for colspan, rowspan, and duplicates.
	 *
	 * @param headerRowLocator - The Playwright locator for header rows.
	 * @param columnsSelector - CSS selector for locating header columns (e.g., "th").
	 * @param headerRowOptions - Optional configuration for header processing.
	 * @returns Promise resolving to an array of processed header rows.
	 * @throws Error if columnsSelector is empty, or if a header row cannot be read.
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
		if (!columnsSelector || columnsSelector.trim() === "") {
			throw new Error("columnsSelector cannot be empty");
		}

		const locatorDescription = headerRowLocator.toString();
		const options = this.getDefaultOptions(headerRowOptions);
		const rowsCount = await headerRowLocator.count();
		const rowError = (rowIndex: number, error: unknown): Error =>
			new Error(
				`Failed to process header row at index ${rowIndex}.\n` +
					`Header row locator: ${locatorDescription}\n` +
					`Columns selector: "${columnsSelector}"\n` +
					`Error: ${error instanceof Error ? error.message : String(error)}`
			);

		// Read every row in parallel, one round trip each; the spans are resolved afterwards, in order.
		const cellData = await Promise.all(
			Array.from({ length: rowsCount }, async (_, rowIndex) => {
				try {
					const cells = await TableUtils.readRowCells(
						headerRowLocator.nth(rowIndex),
						columnsSelector,
						options.cellContentType
					);
					return cells.map(cell => ({
						text: this.sanitizeHeaderText(cell.content, options.normalizeWhitespace, options.stripIconGlyphs),
						rowspan: cell.rowspan,
						colspan: cell.colspan,
					}));
				} catch (error) {
					throw rowError(rowIndex, error);
				}
			})
		);

		const headerRows: HeaderRow[] = [];
		const rowSpans: RowSpans = new Map();
		for (const cells of cellData) {
			headerRows.push(this.processRow(cells, rowSpans, options));
		}

		this.applyColspanOptions(headerRows, options);
		this.applyDuplicateSuffix(headerRows, options);

		return headerRows;
	}

	private static getDefaultOptions(options: HeaderRowOptions = {}): Required<HeaderRowOptions> {
		const colspan = options.colspan ?? {};
		return {
			cellContentType: options.cellContentType ?? CellContentType.InnerText,
			emptyCellReplacement: options.emptyCellReplacement ?? false,
			duplicateSuffix: options.duplicateSuffix ?? false,
			normalizeWhitespace: options.normalizeWhitespace ?? false,
			stripIconGlyphs: options.stripIconGlyphs ?? false,
			colspan: {
				enabled: colspan.enabled ?? false,
				suffix: colspan.suffix ?? false,
			},
		};
	}

	private static processRow(
		cellDataArray: { text: string; rowspan: number; colspan: number }[],
		rowSpans: RowSpans,
		options: Required<HeaderRowOptions>
	): HeaderRow {
		const headerRow: HeaderRow = [];

		if (cellDataArray.length === 0) {
			// An empty row is still a row: the cells spanning into it end one row sooner.
			for (const column of [...rowSpans.keys()]) this.takeRowSpan(rowSpans, column);
			return headerRow;
		}

		let columnIndex = 0;
		for (const cellData of cellDataArray) {
			columnIndex = this.processHeaderCellData(
				cellData,
				headerRow,
				rowSpans,
				columnIndex,
				options.emptyCellReplacement
			);
		}

		this.addRemainingRowSpans(headerRow, rowSpans, columnIndex);
		return headerRow;
	}

	private static sanitizeHeaderText(text: string, normalizeWhitespace: boolean, stripIconGlyphs: boolean): string {
		let result = text;

		if (stripIconGlyphs) {
			result = result.replace(this.ICON_GLYPH_PATTERN, "");
		}

		if (normalizeWhitespace) {
			result = result.replace(this.CONTROL_WHITESPACE_PATTERN, " ").replace(this.WHITESPACE_PATTERN, " ");
		}

		return result.trim();
	}

	/**
	 * Processes pre-fetched header cell data and applies it to the header row.
	 * This method is purely computational and doesn't perform any DOM operations.
	 */
	private static processHeaderCellData(
		cellData: { text: string; rowspan: number; colspan: number },
		headerRow: HeaderRow,
		rowSpans: RowSpans,
		columnIndex: number,
		emptyCellReplacement: boolean
	): number {
		while (rowSpans.has(columnIndex)) {
			headerRow.push(this.takeRowSpan(rowSpans, columnIndex));
			columnIndex++;
		}

		let text = cellData.text;
		if (!text && emptyCellReplacement) {
			text = this.EMPTY_CELL_PLACEHOLDER;
		}

		const { colspan, rowspan } = cellData;

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
		rowSpans: RowSpans,
		text: string,
		columnIndex: number,
		colspan: number,
		rowspan: number
	): void {
		if (rowspan > 1) {
			for (let i = 0; i < colspan; i++) {
				rowSpans.set(columnIndex + i, { text, rows: rowspan - 1 });
			}
		}
	}

	/** The text of the cell spanning into `column` of this row; the span ends after its last row. */
	private static takeRowSpan(rowSpans: RowSpans, column: number): string {
		const span = rowSpans.get(column);
		if (span === undefined) return "";
		span.rows--;
		if (span.rows <= 0) rowSpans.delete(column);
		return span.text;
	}

	private static addRemainingRowSpans(headerRow: HeaderRow, rowSpans: RowSpans, columnIndex: number): void {
		while (rowSpans.has(columnIndex)) {
			headerRow.push(this.takeRowSpan(rowSpans, columnIndex));
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
		for (const [i, headerRow] of headerRows.entries()) {
			headerRows[i] = headerRow.filter(cell => !this.COLSPAN_PATTERN.test(cell));
		}
	}

	private static removeColspanSuffix(headerRows: HeaderRow[]): void {
		for (const headerRow of headerRows) {
			for (const [i, header] of headerRow.entries()) {
				if (this.COLSPAN_PATTERN.test(header)) {
					headerRow[i] = header.replace(this.COLSPAN_PATTERN, "");
				}
			}
		}
	}

	private static applyDuplicateSuffix(headerRows: HeaderRow[], options: Required<HeaderRowOptions>): void {
		if (!options.duplicateSuffix) return;

		for (const headerRow of headerRows) {
			const headerCountMap: Map<string, number> = new Map();
			for (const [i, header] of headerRow.entries()) {
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
