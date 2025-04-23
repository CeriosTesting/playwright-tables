import { Locator } from "@playwright/test";
import { CellContentType } from "./cell-content-type";
import { Cell } from "./row";

export abstract class TableUtils {
	static async getCellContent(cell: Locator, cellContentType: CellContentType): Promise<string> {
		const content = cellContentType === CellContentType.InnerText ? await cell.innerText() : await cell.textContent();
		return content?.trim() || "";
	}

	static async parseSpanAttributes(cell: Locator): Promise<{ rowspan: number; colspan: number }> {
		return {
			rowspan: parseInt((await cell.getAttribute("rowspan")) || "1", 10),
			colspan: parseInt((await cell.getAttribute("colspan")) || "1", 10),
		};
	}

	static castContent(value: string): Cell {
		const trimmedValue = value.trim();

		if (trimmedValue === "") return "";

		const lowerValue = trimmedValue.toLowerCase();

		if (lowerValue === "true") return true;
		if (lowerValue === "false") return false;

		const num = Number(trimmedValue);
		return isNaN(num) ? trimmedValue : num;
	}
}
