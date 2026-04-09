import { expect, test } from "@playwright/test";
import { CellContentType } from "src/cell-content-type";
import { HeaderRow } from "src/row";
import { TableHeader } from "src/table-header";

import { Route } from "./demo-html/routes";

test.describe("Header Row Tests", () => {
	test.describe("Header text sanitization", () => {
		test("normalizeWhitespace collapses internal line breaks and spaces", async ({ page }) => {
			await page.setContent(`
				<table>
					<thead>
						<tr>
							<th><span>Account name</span>
							<span>Sort</span></th>
							<th>  City   Name  </th>
						</tr>
					</thead>
				</table>
			`);

			const headers = await TableHeader.getRows(page.locator("table>thead>tr"), "th", {
				normalizeWhitespace: true,
			});

			expect(headers).toEqual([["Account name Sort", "City Name"]]);
		});

		test("normalizeWhitespace collapses line-ending and control whitespace variants", async ({ page }) => {
			await page.setContent(`
				<table>
					<thead>
						<tr>
							<th>Account&#10;Name</th>
							<th>Phone&#13;&#10;Number</th>
							<th>User&#13;Type</th>
							<th>Status&#x2028;Label</th>
							<th id="code-header">CodeValue</th>
						</tr>
					</thead>
				</table>
			`);

			await page.evaluate(() => {
				const controlHeader = document.getElementById("code-header");
				if (controlHeader) {
					controlHeader.textContent = "Code\u0085Value";
				}
			});

			const headers = await TableHeader.getRows(page.locator("table>thead>tr"), "th", {
				cellContentType: CellContentType.TextContent,
				normalizeWhitespace: true,
			});

			expect(headers).toEqual([["Account Name", "Phone Number", "User Type", "Status Label", "Code Value"]]);
		});

		test("normalizeWhitespace false preserves explicit line breaks in header text", async ({ page }) => {
			await page.setContent(`
				<table>
					<thead>
						<tr>
							<th>Account&#10;Name</th>
						</tr>
					</thead>
				</table>
			`);

			const headers = await TableHeader.getRows(page.locator("table>thead>tr"), "th", {
				cellContentType: CellContentType.TextContent,
				normalizeWhitespace: false,
			});

			expect(headers).toEqual([["Account\nName"]]);
		});

		test("stripIconGlyphs removes private-use icon font characters", async ({ page }) => {
			await page.setContent(`
				<table>
					<thead>
						<tr>
							<th>Account name<span>&#xE92E;</span><span>&#xEE68;</span></th>
							<th>Phone</th>
						</tr>
					</thead>
				</table>
			`);

			const headers = await TableHeader.getRows(page.locator("table>thead>tr"), "th", {
				stripIconGlyphs: true,
			});

			expect(headers).toEqual([["Account name", "Phone"]]);
		});
	});

	test.describe("Options colspan", async () => {
		const optionsColspanTestCases: {
			options: { colspan?: { enabled?: boolean; suffix?: boolean } };
			expectedHeaders: HeaderRow[];
		}[] = [
			{
				options: { colspan: { enabled: true, suffix: true } },
				expectedHeaders: [
					["Number", "Name", "Name__C1", "Color Combination", "Color Combination__C1", "Color Combination__C2"],
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

				const headers = await TableHeader.getRows(page.locator("table>thead>tr"), "th", testCase.options);
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

				const headers = await TableHeader.getRows(page.locator("table>thead>tr"), "th", testCase.options);
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
					["Average", "Average__D1", "Average__D2", "Average__D3", "Age"],
					["Height", "Weight", "Height__D1", "Weight__D1", "Age"],
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

				const headers = await TableHeader.getRows(page.locator("table>thead>tr"), "th", {
					...testCase.options,
					colspan: { enabled: true },
				});
				expect(headers).toEqual(testCase.expectedHeaders);
			});
		}
	});
});
