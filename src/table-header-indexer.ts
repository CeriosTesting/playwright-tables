import { Locator } from "@playwright/test";

export abstract class TableHeaderIndexer {
	static async HeadersIncludingColspanAndDuplicateAsync(locatorHeaders: Locator): Promise<string[]> {
		const headerNames: string[] = [];
		const count = await locatorHeaders.count();

		for (let i = 0; i < count; i++) {
			const header = locatorHeaders.nth(i);
			const rowspan = await header.getAttribute("rowspan");
			if (rowspan) {
				throw new Error("Header with rowspan is not supported.");
			}

			const colspan = await header.getAttribute("colspan");
			const headerName = (await header.textContent())?.trim() || "";

			const colspanCount = parseInt(colspan || "1", 10);
			for (let j = 0; j < colspanCount; j++) {
				headerNames.push(headerName);
			}
		}

		const headers = this.addIndicesToHeaderNames(headerNames);
		return headers;
	}

	private static addIndicesToHeaderNames(headerNames: string[]) {
		const headerIndices: Record<string, number> = {};

		function headerNameWithIndex(headerName: string) {
			if (Object.hasOwnProperty.call(headerIndices, headerName)) {
				headerIndices[headerName]++;
				return `${headerName}_${headerIndices[headerName]}`;
			} else {
				headerIndices[headerName] = 0;
				return headerName.trim();
			}
		}

		return headerNames.map(headerNameWithIndex);
	}
}
