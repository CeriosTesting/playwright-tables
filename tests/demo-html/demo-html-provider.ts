export enum DemoHtml {
	ButtonTable = "button-table.html",
	ColspanHeaderTable = "colspan-header-table.html",
	ColspanRowTable = "colspan-row-table.html",
	DivTable = "div-table.html",
	DuplicateEmptyHeadersTable = "duplicate-empty-headers-table.html",
	DynamicLoadTable = "dynamic-load-table.html",
	RowspanHeaderTable = "rowspan-header-table.html",
	RowspanRowTable = "rowspan-row-table.html",
	SimpleTable = "simple-table.html",
}

export abstract class DemoHtmlProvider {
	static getHtmlFilePath(testHtml: DemoHtml): string {
		const path = `${__dirname}/${testHtml}`;
		return path;
	}
}
