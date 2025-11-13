import { Locator, expect } from "@playwright/test";

export enum RowKind {
	Header = "header",
	Body = "body",
}

/**
 * Utility class for waiting and validating table row conditions.
 * Provides static methods to ensure table rows and cells meet expected criteria before proceeding.
 * This class is used internally by PlaywrightTable but can also be used directly for custom validations.
 *
 * @see {@link RowKind} for row type enumeration
 */
export abstract class TableWait {
	/**
	 * Waits for table rows to meet specified conditions regarding row count, cell count, and cell content.
	 * This method validates table structure and content before allowing further operations.
	 * Used internally by PlaywrightTable.waitForHeaderRows() and PlaywrightTable.waitForBodyRows().
	 *
	 * @param rowLocator - The Playwright locator for the table rows (e.g., page.locator('tbody tr')).
	 * @param cellSelector - CSS selector for locating cells within rows (e.g., "td" for body, "th" for header).
	 * @param rowKind - The type of row being validated. See {@link RowKind}. Used in error messages for clarity.
	 * @param options - Optional validation criteria for rows and cells.
	 * @param options.row - Row-level validation options.
	 * @param options.row.amount - Expected exact number of rows. If not specified, validates at least one row exists.
	 * @param options.row.cell - Cell-level validation options.
	 * @param options.row.cell.totalCount - Expected number of cells per row (regardless of content). At least one row must match.
	 * @param options.row.cell.contentCount - Expected number of cells with non-empty content per row. At least one row must match.
	 *
	 * @returns Promise that resolves when all validations pass.
	 * @throws Error if cellSelector is empty or whitespace.
	 * @throws Error if any numeric option is not a positive integer.
	 * @throws Error if no rows found matching the criteria.
	 * @throws Error if row count doesn't match expected amount.
	 * @throws Error if no rows have the expected cell count.
	 * @throws Error if no rows have the expected content count.
	 * @throws Error if no cells with content found (when no specific contentCount provided).
	 *
	 * @example
	 * // Wait for at least 3 body rows, each with 5 cells containing content
	 * await TableWait.waitForRows(
	 *   page.locator('tbody tr'),
	 *   'td',
	 *   RowKind.Body,
	 *   { row: { amount: 3, cell: { totalCount: 5, contentCount: 5 } } }
	 * );
	 *
	 * @example
	 * // Wait for any header rows with at least some content
	 * await TableWait.waitForRows(
	 *   page.locator('thead tr'),
	 *   'th',
	 *   RowKind.Header
	 * );
	 */
	static async waitForRows(
		rowLocator: Locator,
		cellSelector: string,
		rowKind: RowKind,
		options?: {
			row?: {
				amount?: number;
				cell?: {
					totalCount?: number;
					contentCount?: number;
				};
			};
		}
	): Promise<void> {
		this.validateInputs(cellSelector, options);

		const locatorDescription = rowLocator.toString();
		const rows = await rowLocator.all();

		const expectedRowCount = options?.row?.amount;
		if (expectedRowCount) {
			this.validateExactRowCount(rows, expectedRowCount, rowKind, locatorDescription);
		} else {
			this.validateHasRows(rows, rowKind, locatorDescription);
		}

		const cellOptions = options?.row?.cell;
		if (cellOptions) {
			const validations: Promise<void>[] = [];

			if (cellOptions.totalCount) {
				validations.push(
					this.validateCellCount(rows, cellSelector, cellOptions.totalCount, rowKind, locatorDescription)
				);
			}

			if (cellOptions.contentCount) {
				validations.push(
					this.validateCellContentCount(rows, cellSelector, cellOptions.contentCount, rowKind, locatorDescription)
				);
			} else {
				validations.push(this.validateHasCellsWithContent(rowLocator, cellSelector, rowKind, locatorDescription));
			}

			await Promise.all(validations);
		} else {
			await this.validateHasCellsWithContent(rowLocator, cellSelector, rowKind, locatorDescription);
		}
	}

	/**
	 * Validates input parameters before processing.
	 */
	private static validateInputs(
		cellSelector: string,
		options?: {
			row?: {
				amount?: number;
				cell?: {
					totalCount?: number;
					contentCount?: number;
				};
			};
		}
	): void {
		if (!cellSelector || cellSelector.trim() === "") {
			throw new Error("cellSelector cannot be empty");
		}

		this.validatePositiveInteger(options?.row?.amount, "row.amount");
		this.validatePositiveInteger(options?.row?.cell?.totalCount, "row.cell.totalCount");
		this.validatePositiveInteger(options?.row?.cell?.contentCount, "row.cell.contentCount");
	}

	/**
	 * Validates a value is a positive integer if defined.
	 */
	private static validatePositiveInteger(value: number | undefined, paramName: string): void {
		if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
			throw new Error(`${paramName} must be a positive integer, got: ${value}`);
		}
	}

	/**
	 * Checks if a cell has non-empty content.
	 */
	private static async cellHasContent(cell: Locator): Promise<boolean> {
		const content = await cell.textContent();
		return content !== null && content.trim() !== "";
	}

	/**
	 * Filters cells to only those with content.
	 */
	private static async getCellsWithContent(cells: Locator[]): Promise<Locator[]> {
		const results = await Promise.all(cells.map(async cell => ((await this.cellHasContent(cell)) ? cell : null)));
		return results.filter((cell): cell is Locator => cell !== null);
	}

	/**
	 * Validates that at least one row exists.
	 */
	private static validateHasRows(rows: Locator[], rowKind: RowKind, locatorDescription: string): void {
		expect(rows.length, `No ${rowKind} rows found.\nRow locator: ${locatorDescription}`).toBeGreaterThan(0);
	}

	/**
	 * Validates the exact number of rows.
	 */
	private static validateExactRowCount(
		rows: Locator[],
		expectedCount: number,
		rowKind: RowKind,
		locatorDescription: string
	): void {
		expect(
			rows.length,
			`Expected ${expectedCount} ${rowKind} rows, but found ${rows.length}.\nRow locator: ${locatorDescription}`
		).toBe(expectedCount);
	}

	/**
	 * Validates that at least some cells have content.
	 */
	private static async validateHasCellsWithContent(
		rowLocator: Locator,
		cellSelector: string,
		rowKind: RowKind,
		locatorDescription: string
	): Promise<void> {
		const cells = await rowLocator.locator(cellSelector).all();
		const cellsWithContent = await this.getCellsWithContent(cells);
		expect(
			cellsWithContent.length,
			`No ${rowKind} cells with content found.\nRow locator: ${locatorDescription}\nCell selector: "${cellSelector}"`
		).toBeGreaterThan(0);
	}

	/**
	 * Validates that at least one row has exactly the expected number of cells.
	 */
	private static async validateCellCount(
		rows: Locator[],
		cellSelector: string,
		expectedCount: number,
		rowKind: RowKind,
		locatorDescription: string
	): Promise<void> {
		const matchingRows = await this.findRowsWithCellCount(rows, cellSelector, expectedCount);
		expect(
			matchingRows.length,
			`No ${rowKind} rows found with exactly ${expectedCount} cells. Checked ${rows.length} rows.\n` +
				`Row locator: ${locatorDescription}\nCell selector: "${cellSelector}"`
		).toBeGreaterThan(0);
	}

	/**
	 * Finds rows that have exactly the expected number of cells.
	 */
	private static async findRowsWithCellCount(
		rows: Locator[],
		cellSelector: string,
		expectedCount: number
	): Promise<Locator[]> {
		const results = await Promise.all(
			rows.map(async row => {
				const cellCount = await row.locator(cellSelector).count();
				return cellCount === expectedCount ? row : null;
			})
		);
		return results.filter((row): row is Locator => row !== null);
	}

	/**
	 * Validates that at least one row has exactly the expected number of cells with content.
	 */
	private static async validateCellContentCount(
		rows: Locator[],
		cellSelector: string,
		expectedContentCount: number,
		rowKind: RowKind,
		locatorDescription: string
	): Promise<void> {
		const matchingRows = await this.findRowsWithContentCount(rows, cellSelector, expectedContentCount);
		expect(
			matchingRows.length,
			`No ${rowKind} rows found with exactly ${expectedContentCount} cells containing content. Checked ${rows.length} rows.\n` +
				`Row locator: ${locatorDescription}\nCell selector: "${cellSelector}"`
		).toBeGreaterThan(0);
	}

	/**
	 * Finds rows that have exactly the expected number of cells with content.
	 */
	private static async findRowsWithContentCount(
		rows: Locator[],
		cellSelector: string,
		expectedContentCount: number
	): Promise<Locator[]> {
		const results = await Promise.all(
			rows.map(async row => {
				const cells = await row.locator(cellSelector).all();
				const cellsWithContent = await this.getCellsWithContent(cells);
				return cellsWithContent.length === expectedContentCount ? row : null;
			})
		);
		return results.filter((row): row is Locator => row !== null);
	}
}
