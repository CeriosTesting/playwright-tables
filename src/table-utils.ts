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
		const count = await cell.count();
		if (count === 0) {
			throw new Error("Cannot get content from non-existent cell locator");
		}

		const content = cellContentType === CellContentType.InnerText ? await cell.innerText() : await cell.textContent();
		return content?.trim() || "";
	}

	/**
	 * Parses rowspan and colspan attributes from a table cell.
	 * @param cell - The Playwright locator for the cell.
	 * @returns Object containing rowspan and colspan values (defaults to 1 if not present).
	 * @throws Error if attributes contain invalid values (non-numeric or less than 1).
	 */
	static async parseSpanAttributes(cell: Locator): Promise<{ rowspan: number; colspan: number }> {
		const [rowspanAttr, colspanAttr] = await Promise.all([cell.getAttribute("rowspan"), cell.getAttribute("colspan")]);

		const rowspan = parseInt(rowspanAttr || "1", 10);
		const colspan = parseInt(colspanAttr || "1", 10);

		if (isNaN(rowspan) || rowspan < 1) {
			throw new Error(`Invalid rowspan attribute: "${rowspanAttr}". Expected positive integer.`);
		}
		if (isNaN(colspan) || colspan < 1) {
			throw new Error(`Invalid colspan attribute: "${colspanAttr}". Expected positive integer.`);
		}

		return { rowspan, colspan };
	}
}
