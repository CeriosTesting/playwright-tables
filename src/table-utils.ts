import { Locator } from "@playwright/test";

import { CellContentType } from "./cell-content-type";

/**
 * Utility class for extracting table cell content and attributes.
 * Contains only static methods - cannot be instantiated.
 */
export class TableUtils {
	private constructor() {
		// Prevent instantiation - this class only has static methods
	}
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
			return content?.trim() ?? "";
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
			return this.parseSpans(rowspanAttr, colspanAttr);
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
	 * Warns when the header and body row selectors are identical, because header rows would then also
	 * be read as body rows.
	 * @param owner - The class name used in the warning.
	 * @param headerRowSelector - The configured header row selector, if any.
	 * @param bodyRowSelector - The configured body row selector, if any.
	 */
	static warnOnIdenticalRowSelectors(
		owner: string,
		headerRowSelector: string | undefined,
		bodyRowSelector: string | undefined
	): void {
		if (headerRowSelector !== undefined && headerRowSelector !== "" && headerRowSelector === bodyRowSelector) {
			console.warn(
				`${owner}: header.rowSelector and row.rowSelector are identical ("${headerRowSelector}"). ` +
					`This can cause header rows to be included in body rows. Consider scoping selectors to separate row groups.`
			);
		}
	}

	/**
	 * Reads the content and span attributes of every cell in `row` in a single round trip.
	 * @param row - The Playwright locator for one row.
	 * @param columnsSelector - Selector for the cells within the row, with the same meaning as in `row.locator()`.
	 * @param cellContentType - The type of content to extract (InnerText or TextContent).
	 * @returns One entry per cell, in DOM order, with the trimmed content.
	 * @throws Error if a span attribute is invalid (non-numeric or less than 1).
	 */
	static async readRowCells(
		row: Locator,
		columnsSelector: string,
		cellContentType: CellContentType
	): Promise<{ content: string; rowspan: number; colspan: number }[]> {
		const cells = await row.locator(columnsSelector).evaluateAll(
			(elements, innerText) =>
				elements.map(el => ({
					text: innerText && "innerText" in el ? el.innerText : el.textContent,
					rowspan: el.getAttribute("rowspan"),
					colspan: el.getAttribute("colspan"),
				})),
			cellContentType === CellContentType.InnerText
		);
		return cells.map(cell => ({
			content: cell.text.trim(),
			...this.parseSpans(cell.rowspan, cell.colspan),
		}));
	}

	/** Parses and validates the `rowspan` and `colspan` attributes of a cell. */
	private static parseSpans(
		rowspanAttr: string | null,
		colspanAttr: string | null
	): { rowspan: number; colspan: number } {
		const rowspan = this.parseSpan(rowspanAttr);
		const colspan = this.parseSpan(colspanAttr);

		if (isNaN(rowspan) || rowspan < 1) {
			throw new Error(`Invalid rowspan attribute: "${rowspanAttr}". Expected positive integer.`);
		}
		if (isNaN(colspan) || colspan < 1) {
			throw new Error(`Invalid colspan attribute: "${colspanAttr}". Expected positive integer.`);
		}

		return { rowspan, colspan };
	}

	/** Parses a `rowspan`/`colspan` attribute value. A missing or empty attribute means 1. */
	private static parseSpan(attr: string | null): number {
		return attr === null || attr === "" ? 1 : parseInt(attr, 10);
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
