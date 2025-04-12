import { expect, test } from "@playwright/test";
import { BodyRow } from "src/row";
import { TableHeader } from "src/table-header";
import { DemoHtml, DemoHtmlProvider } from "./demo-html/demo-html-provider";

test.describe("Header Row Tests", () => {
	const headerIndexerTestCases: {
		demoHtml: DemoHtml;
		expectedHeaders: BodyRow[];
	}[] = [
		{
			demoHtml: DemoHtml.SimpleTable,
			expectedHeaders: [["First name", "Last name", "Date of birth"]],
		},
		{
			demoHtml: DemoHtml.DuplicateEmptyHeadersTable,
			expectedHeaders: [["", "Duplicate", "Duplicate", "Unique", ""]],
		},
		{
			demoHtml: DemoHtml.ColspanHeaderTable,
			expectedHeaders: [["Name", "Color Combination"]],
		},
	];
	for (const testCase of headerIndexerTestCases) {
		test(testCase.demoHtml, async ({ page }) => {
			await page.goto(DemoHtmlProvider.getHtmlFilePath(testCase.demoHtml));

			const headers = await TableHeader.getHeaderRows(page.locator("table>thead>tr"), "th");
			expect(headers).toEqual(testCase.expectedHeaders);
		});
	}

	test("table header with rowspan throws error", async ({ page }) => {
		await page.goto(DemoHtmlProvider.getHtmlFilePath(DemoHtml.RowspanHeaderTable));

		const headers = await TableHeader.getHeaderRows(page.locator("table>thead>tr"), "th");
		console.log(headers);
	});
});
