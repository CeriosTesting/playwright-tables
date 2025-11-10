import { Locator } from "@playwright/test";
import { CellContentType } from "./cell-content-type";

export abstract class TableUtils {
	/**
	 * Extracts text content from a table cell.
	 * @param cell - The Playwright locator for the cell.
	 * @param cellContentType - The type of content to extract (InnerText or TextContent).
	 * @returns The trimmed text content of the cell, or empty string if no content.
	 * @throws Error if the cell locator doesn't exist in the DOM.
	 */
	static async getCellContent(cell: Locator, cellContentType: CellContentType): Promise<string> {
		try {
			const count = await cell.count();
			if (count === 0) {
				throw new Error("Cell locator does not exist in the DOM");
			}

			const content = cellContentType === CellContentType.InnerText ? await cell.innerText() : await cell.textContent();
			return content?.trim() || "";
		} catch (error) {
			const locatorDescription = this.getLocatorDescription(cell);
			throw new Error(
				`Failed to get cell content.\n` +
					`Locator: ${locatorDescription}\n` +
					`Content type: ${cellContentType}\n` +
					`Error: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Parses rowspan and colspan attributes from a table cell.
	 * Fetches both attributes in parallel for optimal performance.
	 * @param cell - The Playwright locator for the cell.
	 * @returns Object containing rowspan and colspan values (defaults to 1 if not present).
	 * @throws Error if attributes contain invalid values (non-numeric or less than 1).
	 */
	static async parseSpanAttributes(cell: Locator): Promise<{ rowspan: number; colspan: number }> {
		try {
			const [rowspanAttr, colspanAttr] = await Promise.all([
				cell.getAttribute("rowspan"),
				cell.getAttribute("colspan"),
			]);

			const rowspan = parseInt(rowspanAttr || "1", 10);
			const colspan = parseInt(colspanAttr || "1", 10);

			if (isNaN(rowspan) || rowspan < 1) {
				throw new Error(`Invalid rowspan attribute: "${rowspanAttr}". Expected positive integer.`);
			}
			if (isNaN(colspan) || colspan < 1) {
				throw new Error(`Invalid colspan attribute: "${colspanAttr}". Expected positive integer.`);
			}

			return { rowspan, colspan };
		} catch (error) {
			const locatorDescription = this.getLocatorDescription(cell);
			throw new Error(
				`Failed to parse span attributes.\n` +
					`Locator: ${locatorDescription}\n` +
					`Error: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Extracts a human-readable locator description from a Playwright Locator.
	 * This captures Playwright's internal selector chain for better error messages.
	 * @param locator - The Playwright locator to describe.
	 * @returns A string representation of the locator's selector chain.
	 */
	private static getLocatorDescription(locator: Locator): string {
		const locatorString = locator.toString();
		// Example: "Locator@#root >> table >> tbody >> tr >> td"
		return locatorString;
	}
}
