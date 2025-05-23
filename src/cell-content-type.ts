/**
 * Enum representing the possible types of content that can be extracted from a table cell.
 *
 * - `TextContent`: The raw text content of the cell, including hidden elements and extra whitespace.
 * - `InnerText`: The rendered text content of the cell, as seen by the user, with whitespace collapsed and hidden elements excluded.
 */
export enum CellContentType {
	TextContent = "textContent",
	InnerText = "innerText",
}
