import { test, expect } from "@playwright/test";
import { TableHeaderIndexer } from "../src/table-header-indexer";
import { TestHtml, TestHtmlProvider } from "./demo-html/test-html-provider";

test.describe("Header Indexer Tests", () => {
	const headerIndexerTestCases: {
		testHtml: TestHtml;
		expectedHeaders: string[];
	}[] = [
		{
			testHtml: TestHtml.SimpleTable,
			expectedHeaders: ["First name", "Last name", "Date of birth"],
		},
		{
			testHtml: TestHtml.DuplicateEmptyHeadersTable,
			expectedHeaders: ["", "Duplicate", "Duplicate_1", "Unique", "_1"],
		},
		{
			testHtml: TestHtml.ColspanHeaderTable,
			expectedHeaders: ["Name", "Color Combination", "Color Combination_1"],
		},
	];
	for (const testCase of headerIndexerTestCases) {
		test(testCase.testHtml, async ({ page }) => {
			await page.goto(TestHtmlProvider.getHtmlFilePath(testCase.testHtml));

			const headers = await TableHeaderIndexer.HeadersIncludingColspanAndDuplicateAsync(page.locator("table>thead>tr>th"));
			expect(headers).toEqual(testCase.expectedHeaders);
		});
	}

	test("Table header with rowspan throws error", async ({ page }) => {
		await page.goto(TestHtmlProvider.getHtmlFilePath(TestHtml.RowspanHeaderTable));

		const headers = TableHeaderIndexer.HeadersIncludingColspanAndDuplicateAsync(page.locator("table>thead>tr>th"));
		await expect(headers).rejects.toThrowError("Header with rowspan is not supported.");
	});
});
