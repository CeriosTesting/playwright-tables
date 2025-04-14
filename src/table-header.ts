import { Locator } from "@playwright/test";
import { HeaderRow } from "./row";

export type HeaderRowsOptions = {
	emptyCellReplacement?: boolean;
	duplicateSuffix?: boolean;
	colspan?: { enabled?: boolean; suffix?: boolean };
};

export abstract class TableHeader {
	static async getHeaderRows(
		headerRowLocator: Locator,
		columnsSelector: string,
		headerRowsOptions?: HeaderRowsOptions
	): Promise<HeaderRow[]> {
		const headerRows: HeaderRow[] = [];
		const rowSpans: Map<number, string> = new Map();
		const colspanEnabled = headerRowsOptions?.colspan?.enabled ?? true;
		const colspanSuffix = headerRowsOptions?.colspan?.suffix ?? false;
		const duplicateSuffix = headerRowsOptions?.duplicateSuffix ?? false;
		const emptyCellReplacement = headerRowsOptions?.emptyCellReplacement ?? true;

		// Locate all header rows
		const rows = await headerRowLocator.elementHandles();

		for (const row of rows) {
			const headerRow: HeaderRow = [];
			const cells = await row.$$(columnsSelector);
			let columnIndex = 0;

			// Process each cell in the row
			for (const cell of cells) {
				// Skip columns occupied by rowSpans
				while (rowSpans.has(columnIndex)) {
					headerRow.push(rowSpans.get(columnIndex)!);
					rowSpans.delete(columnIndex);
					columnIndex++;
				}

				// Get cell text and attributes
				let text = (await cell.textContent())?.trim() || "";
				if (!text && emptyCellReplacement) {
					text = "{{Empty}}"; // Replace empty cell value with {{Empty}}
				}
				const colspan = parseInt((await cell.getAttribute("colspan")) || "1", 10);
				const rowspan = parseInt((await cell.getAttribute("rowspan")) || "1", 10);

				// Add the cell text to the current row
				headerRow.push(text);

				// Handle colspan: add suffixes for extra cells
				if (colspan > 1) {
					for (let i = 1; i < colspan; i++) {
						headerRow.push(`${text}__Colspan__${i}`);
					}
				}

				// Handle rowspan: store the text for subsequent rows
				if (rowspan > 1) {
					for (let i = 0; i < colspan; i++) {
						rowSpans.set(columnIndex + i, text);
					}
				}

				// Increment column index by colspan
				columnIndex += colspan;
			}

			// Add any remaining rowSpans to the current row
			while (rowSpans.has(columnIndex)) {
				headerRow.push(rowSpans.get(columnIndex)!);
				rowSpans.delete(columnIndex);
				columnIndex++;
			}

			headerRows.push(headerRow);
		}

		if (!colspanEnabled) {
			for (const headerRow of headerRows) {
				for (let i = 0; i < headerRow.length; i++) {
					if (headerRow[i].includes("__Colspan__")) {
						headerRow.splice(i, 1);
						i--;
					}
				}
			}
		}

		if (!colspanSuffix) {
			for (const headerRow of headerRows) {
				for (let i = 0; i < headerRow.length; i++) {
					if (headerRow[i].includes("__Colspan__")) {
						headerRow[i] = headerRow[i].split("__Colspan__")[0];
					}
				}
			}
		}

		if (duplicateSuffix) {
			for (const headerRow of headerRows) {
				const headerCountMap: Map<string, number> = new Map(); // Tracks counts for each header
				for (let i = 0; i < headerRow.length; i++) {
					const header = headerRow[i];
					if (headerCountMap.has(header)) {
						const count = headerCountMap.get(header)!; // Get the current count
						headerRow[i] = `${header}__Duplicate__${count}`; // Add the suffix starting at 1
						headerCountMap.set(header, count + 1); // Increment the count for the next duplicate
					} else {
						headerCountMap.set(header, 1); // Initialize count for this header
					}
				}
			}
		}

		return headerRows;
	}
}
