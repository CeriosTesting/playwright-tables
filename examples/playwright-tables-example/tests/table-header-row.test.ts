import { expect, test } from "@playwright/test";
import { Routes } from "../src/routes";
import { TableHeaderRow, BodyRow } from "playwright-tables";

test.describe("Header Row Tests", () => {
	const headerIndexerTestCases: {
		testHtml: Routes;
		expectedHeaders: BodyRow[];
	}[] = [
		{
			testHtml: Routes.SimpleTable,
			expectedHeaders: [["First name", "Last name", "Date of birth"]],
		},
		{
			testHtml: Routes.DuplicateEmptyHeadersTable,
			expectedHeaders: [["", "Duplicate", "Duplicate_1", "Unique", "_1"]],
		},
		{
			testHtml: Routes.ColspanHeaderTable,
			expectedHeaders: [["Name", "Color Combination", "Color Combination_1"]],
		},
	];
	for (const testCase of headerIndexerTestCases) {
		test(testCase.testHtml, async ({ page }) => {
			await page.goto(testCase.testHtml);

			const headers = await TableHeaderRow.getHeaderRows(page.locator("table>thead>tr"), "th");
			expect(headers).toEqual(testCase.expectedHeaders);
		});
	}

	test("table header with rowspan throws error", async ({ page }) => {
		await page.goto(Routes.RowspanHeaderTable);

		const headers = await TableHeaderRow.getHeaderRows(page.locator("table>thead>tr"), "th");
		console.log(headers);
	});
});
