/**
 * Enum representing the possible types of content that can be extracted from a table cell.
 *
 * - `TextContent`: all text in the DOM of the cell, also the text of hidden elements.
 * - `InnerText`: the text as it is shown, without hidden text and with CSS `text-transform`.
 *
 * `TableLocator` normalizes the text either way (whitespace collapsed, icon glyphs and `ignore`d elements
 * left out), unless you ask for raw text. `PlaywrightTable` trims it.
 */
export enum CellContentType {
	TextContent = "textContent",
	InnerText = "innerText",
}
