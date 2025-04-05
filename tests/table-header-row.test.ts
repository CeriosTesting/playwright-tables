import { expect, test } from "@playwright/test";
import { TestHtml, TestHtmlProvider } from "./demo-html/test-html-provider";
import { TableHeaderRow } from "src/table-header-row";
import { BodyRow } from "src/row";

test.describe("Header Row Tests", () => {
	const headerIndexerTestCases: {
		testHtml: TestHtml;
		expectedHeaders: BodyRow[];
	}[] = [
		{
			testHtml: TestHtml.SimpleTable,
			expectedHeaders: [["First name", "Last name", "Date of birth"]],
		},
		{
			testHtml: TestHtml.DuplicateEmptyHeadersTable,
			expectedHeaders: [["", "Duplicate", "Duplicate_1", "Unique", "_1"]],
		},
		{
			testHtml: TestHtml.ColspanHeaderTable,
			expectedHeaders: [["Name", "Color Combination", "Color Combination_1"]],
		},
	];
	for (const testCase of headerIndexerTestCases) {
		test(testCase.testHtml, async ({ page }) => {
			await page.goto(TestHtmlProvider.getHtmlFilePath(testCase.testHtml));

			const headers = await TableHeaderRow.getHeaderRows(page.locator("table>thead>tr"), "th");
			expect(headers).toEqual(testCase.expectedHeaders);
		});
	}

	test("table header with rowspan throws error", async ({ page }) => {
		await page.goto(TestHtmlProvider.getHtmlFilePath(TestHtml.RowspanHeaderTable));

		const headers = await TableHeaderRow.getHeaderRows(page.locator("table>thead>tr"), "th");
		console.log(headers);
	});
});
