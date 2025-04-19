import { Locator, expect } from "@playwright/test";

export enum RowKind {
	Header = "header",
	Body = "body",
}

export abstract class TableWait {
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
		const validateCellsWithContent = async (): Promise<void> => {
			const cells = await rowLocator.locator(cellSelector).all();
			const cellsWithContent = (
				await Promise.all(
					cells.map(async cell => {
						const content = await cell.textContent();
						return content !== null && content.trim() !== "" ? cell : null;
					})
				)
			).filter(cell => cell !== null);
			expect(cellsWithContent.length, `No ${rowKind} cells with content found`).toBeGreaterThan(0);
		};

		const validateRowAmount = (rows: Locator[], expectedAmount: number): void => {
			expect(rows.length, `Expected ${expectedAmount} ${rowKind} rows, but found ${rows.length}`).toBe(expectedAmount);
		};

		const validateCellCount = async (rows: Locator[], expectedCount: number): Promise<void> => {
			const rowsWithMatchingCells = (
				await Promise.all(
					rows.map(async row => {
						const cellCount = await row.locator(cellSelector).count();
						return cellCount === expectedCount ? row : null;
					})
				)
			).filter(row => row !== null);
			expect(
				rowsWithMatchingCells.length,
				`Expected amount of ${expectedCount} ${rowKind} cells for row not found`
			).toBeGreaterThan(0);
		};

		const validateCellContentCount = async (rows: Locator[], expectedContentCount: number): Promise<void> => {
			const rowsWithMatchingContent = (
				await Promise.all(
					rows.map(async row => {
						const cells = await row.locator(cellSelector).all();
						const cellsWithContent = (
							await Promise.all(
								cells.map(async cell => {
									const content = await cell.textContent();
									return content !== null && content.trim() !== "" ? cell : null;
								})
							)
						).filter(cell => cell !== null);
						return cellsWithContent.length === expectedContentCount ? row : null;
					})
				)
			).filter(row => row !== null);
			expect(
				rowsWithMatchingContent.length,
				`Expected amount of ${expectedContentCount} ${rowKind} cells with content for row not found`
			).toBeGreaterThan(0);
		};

		const rows = await rowLocator.all();

		if (options?.row) {
			if (options.row.amount) {
				validateRowAmount(rows, options.row.amount);
			} else {
				expect(rows.length, `No ${rowKind} rows found`).toBeGreaterThan(0);
			}

			if (options.row.cell) {
				if (options.row.cell.totalCount) {
					await validateCellCount(rows, options.row.cell.totalCount);
				}
				if (options.row.cell.contentCount) {
					await validateCellContentCount(rows, options.row.cell.contentCount);
				} else {
					await validateCellsWithContent();
				}
			} else {
				await validateCellsWithContent();
			}
		} else {
			await validateCellsWithContent();
		}
	}
}
