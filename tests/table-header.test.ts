import { expect, test } from "@playwright/test";
import { HeaderRow } from "src/row";
import { TableHeader } from "src/table-header";
import { Route, DemoHtmlPathProvider } from "./demo-html/routes";

test.describe("Header Row Tests", () => {
	test.describe("Options colspan", async () => {
		const optionsColspanTestCases: {
			options: { colspan?: { enabled?: boolean; suffix?: boolean } };
			expectedHeaders: HeaderRow[];
		}[] = [
			{
				options: { colspan: { enabled: true, suffix: true } },
				expectedHeaders: [
					[
						"Number",
						"Name",
						"Name__Colspan__1",
						"Color Combination",
						"Color Combination__Colspan__1",
						"Color Combination__Colspan__2",
					],
				],
			},
			{
				options: { colspan: { enabled: true, suffix: false } },
				expectedHeaders: [["Number", "Name", "Name", "Color Combination", "Color Combination", "Color Combination"]],
			},
			{
				options: { colspan: { enabled: false, suffix: true } },
				expectedHeaders: [["Number", "Name", "Color Combination"]],
			},
			{
				options: { colspan: { enabled: false, suffix: false } },
				expectedHeaders: [["Number", "Name", "Color Combination"]],
			},
		];
		for (const testCase of optionsColspanTestCases) {
			test(`Colspan enabled = ${testCase.options.colspan!.enabled} suffix = ${testCase.options.colspan!.suffix}`, async ({
				page,
			}) => {
				await page.goto(Route.ColspanHeaderTable);

				const headers = await TableHeader.getHeaderRows(page.locator("table>thead>tr"), "th", testCase.options);
				expect(headers).toEqual(testCase.expectedHeaders);
			});
		}
	});

	test.describe("Options empty cell replacement", async () => {
		const optionsEmptyCellReplacementTestCases: {
			options: { emptyCellReplacement: boolean };
			expectedHeaders: HeaderRow[];
		}[] = [
			{
				options: { emptyCellReplacement: true },
				expectedHeaders: [["{{Empty}}", "First Name", "Last Name", "{{Empty}}"]],
			},
			{
				options: { emptyCellReplacement: false },
				expectedHeaders: [["", "First Name", "Last Name", ""]],
			},
		];
		for (const testCase of optionsEmptyCellReplacementTestCases) {
			test(`Empty cell replacement = ${testCase.options.emptyCellReplacement}`, async ({ page }) => {
				await page.goto(Route.DuplicateEmptyHeadersTable);

				const headers = await TableHeader.getHeaderRows(page.locator("table>thead>tr"), "th", testCase.options);
				expect(headers).toEqual(testCase.expectedHeaders);
			});
		}
	});

	test.describe("Options duplicate suffix", async () => {
		const optionsDuplicateSuffixTestCases: {
			options: { duplicateSuffix: boolean };
			expectedHeaders: HeaderRow[];
		}[] = [
			{
				options: { duplicateSuffix: true },
				expectedHeaders: [
					["Average", "Average__Duplicate__1", "Average__Duplicate__2", "Average__Duplicate__3", "Age"],
					["Height", "Weight", "Height__Duplicate__1", "Weight__Duplicate__1", "Age"],
				],
			},
			{
				options: { duplicateSuffix: false },
				expectedHeaders: [
					["Average", "Average", "Average", "Average", "Age"],
					["Height", "Weight", "Height", "Weight", "Age"],
				],
			},
		];
		for (const testCase of optionsDuplicateSuffixTestCases) {
			test(`Duplicate suffix = ${testCase.options.duplicateSuffix}`, async ({ page }) => {
				await page.goto(Route.RowspanHeaderTable);

				const headers = await TableHeader.getHeaderRows(page.locator("table>thead>tr"), "th", testCase.options);
				expect(headers).toEqual(testCase.expectedHeaders);
			});
		}
	});
});
