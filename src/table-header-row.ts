import { Locator } from "@playwright/test";
import { HeaderRow } from "./row";

export abstract class TableHeaderRow {
	static async getHeaderRows(headerRowLocator: Locator, columnsSelector: string): Promise<HeaderRow[]> {
		const headerRows: HeaderRow[] = [];
		const rowSpans: (string | null)[] = []; // Tracks cells with rowspan across rows

		// Iterate through each row
		for (let i = 0; i < (await headerRowLocator.count()); i++) {
			const row = headerRowLocator.nth(i);
			const columns = row.locator(columnsSelector);
			const columnTexts: string[] = [];
			const nameCount: Record<string, number> = {};
			let colIndex = 0;

			// Iterate through each column in the row
			for (let j = 0; j < (await columns.count()); j++) {
				const column = columns.nth(j);
				let text = await column.innerText();
				text = text.trim();

				// Handle colspan and rowspan
				const colspan = parseInt((await column.getAttribute("colspan")) || "1", 10);
				const rowspan = parseInt((await column.getAttribute("rowspan")) || "1", 10);

				// Handle duplicate header names
				if (nameCount[text] !== undefined) {
					nameCount[text]++;
					text = `${text}_${nameCount[text]}`;
				} else {
					nameCount[text] = 0;
				}

				// Insert the text into the correct position, accounting for rowSpans
				while (rowSpans[colIndex]) {
					columnTexts.push(rowSpans[colIndex]!);
					rowSpans[colIndex] = null;
					colIndex++;
				}

				columnTexts.push(text);

				// Fill in rowSpans for future rows if rowspan > 1
				for (let r = 1; r < rowspan; r++) {
					if (i + r >= rowSpans.length) {
						rowSpans.push(null);
					}
					rowSpans[colIndex] = text;
				}

				colIndex++;

				// Handle colspan by adding placeholders
				for (let c = 1; c < colspan; c++) {
					columnTexts.push(`${text}_${c}`);
					colIndex++;
				}
			}

			// Add any remaining rowSpans to the current row
			while (rowSpans[colIndex]) {
				columnTexts.push(rowSpans[colIndex]!);
				rowSpans[colIndex] = null;
				colIndex++;
			}

			headerRows.push(columnTexts);
		}

		return headerRows;
	}
}
