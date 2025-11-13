import test, { expect } from "@playwright/test";
import { PlaywrightTable } from "src/playwright-table";
import { Route } from "./demo-html/routes";
import { TableBody } from "src/table-body";
import { CellContentType } from "src";

test.describe("Table Tests", () => {
	test("getMainHeaderRow returns headers used for table", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const table = new PlaywrightTable(page.locator("table"));
		const headers = await table.getMainHeaderRow();
		expect(headers).toEqual(["First name", "Last name", "Date of birth"]);
	});

	test("getHeaderRows returns header rows", async ({ page }) => {
		await page.goto(Route.RowspanHeaderTable);

		const table = new PlaywrightTable(page.locator("table"));

		const headers = await table.getHeaderRows({ colspan: { enabled: false } });
		expect(headers).toEqual([
			["Average", "Average", "Age"],
			["Height", "Weight", "Height", "Weight", "Age"],
		]);
	});

	test.describe("getBodyRows", async () => {
		test("getBodyRows returns body rows", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			const table = new PlaywrightTable(page.locator("table"));

			const rows = await table.getBodyRows();
			expect(rows).toEqual([
				["Ronald", "Veth", "22-12-1987"],
				["Logan", "Deacon", "01-10-2002"],
			]);
		});

		test("should only return strings", async ({ page }) => {
			await page.goto(Route.PrimitivesTable);

			const table = new PlaywrightTable(page.locator("table"));

			const rows = await table.getBodyRows();
			for (const row of rows) {
				for (const cell of row) {
					expect(typeof cell).toBe("string");
				}
			}
		});
	});

	test.describe("getJson", async () => {
		test("getJson returns json", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			const table = new PlaywrightTable(page.locator("table"));

			const json = await table.getJson();
			expect(json).toEqual([
				{
					"First name": "Ronald",
					"Last name": "Veth",
					"Date of birth": "22-12-1987",
				},
				{
					"First name": "Logan",
					"Last name": "Deacon",
					"Date of birth": "01-10-2002",
				},
			]);
		});

		test("getJson with rowspan handles correctly and returns json with row per rowspan", async ({ page }) => {
			await page.goto(Route.RowspanRowTable);

			const table = new PlaywrightTable(page.locator("table"));
			const json = await table.getJson();

			expect(json).toEqual([
				{
					Month: "January",
					Savings: "100",
					"Savings for holiday!": "50",
				},
				{
					Month: "February",
					Savings: "80",
					"Savings for holiday!": "50",
				},
			]);
		});

		test("No header rows should throw exception", async ({ page }) => {
			await page.goto(Route.EmptyHeaderRowsTable);

			const table = new PlaywrightTable(page.locator("table"), { header: { rowSelector: "invalid" } });
			await expect(table.getJson()).rejects.toThrowError("No header rows found");
		});

		test("No body rows should throw exception", async ({ page }) => {
			await page.goto(Route.EmptyBodyRowsTable);

			const table = new PlaywrightTable(page.locator("table"), { row: { rowSelector: "invalid" } });
			await expect(table.getJson()).rejects.toThrowError("No body rows found");
		});

		test.describe("options.bodyRowOptions.cellContentType", async () => {
			for (const testCase of [
				{
					description: "CellContentType.TextContent return the raw text content of the cell",
					cellContentType: CellContentType.TextContent,
					expected: [
						{
							id: "1",
							withoutStyling: "transform uppercase",
							withStyling: "transform uppercase",
						},
						{
							id: "2",
							withoutStyling: "TRANSFORM LOWERCASE",
							withStyling: "TRANSFORM LOWERCASE",
						},
					],
				},
				{
					description: "CellContentType.InnerText return the rendered text content of the cell",
					cellContentType: CellContentType.InnerText,
					expected: [
						{
							id: "1",
							withoutStyling: "transform uppercase",
							withStyling: "TRANSFORM UPPERCASE",
						},
						{
							id: "2",
							withoutStyling: "TRANSFORM LOWERCASE",
							withStyling: "transform lowercase",
						},
					],
				},
			]) {
				test(testCase.description, async ({ page }) => {
					await page.goto(Route.InnerTextTable);

					const table = new PlaywrightTable(page.locator("table"));
					const json = await table.getJson({
						bodyRowOptions: {
							cellContentType: testCase.cellContentType,
						},
					});

					expect(json).toEqual(testCase.expected);
				});
			}
		});
	});

	test("getBodyCellLocator returns locator", async ({ page }) => {
		await page.goto(Route.ButtonTable);

		const table = new PlaywrightTable(page.locator("table"));
		expect(await table.getBodyRows()).toHaveLength(3);

		const cellLocator = table.getBodyCellLocator(0, 1);
		await cellLocator.locator("input[type='button']").click();
		expect(await table.getBodyRows()).toHaveLength(2);
	});

	test("getBodyCellLocatorByRowConditions returns locator", async ({ page }) => {
		await page.goto(Route.ButtonTable);

		const table = new PlaywrightTable(page.locator("table"));
		expect(await table.getBodyRows()).toHaveLength(3);

		const cellLocator = await table.getBodyCellLocatorByRowConditions({ Rownumber: "Row 2" }, "Delete?");
		await cellLocator.locator("input[type='button']").click();
		expect(await table.getBodyRows()).toHaveLength(2);
	});

	test("getAllBodyCellLocatorsByHeaderName returns locators", async ({ page }) => {
		await page.goto(Route.ButtonTable);

		const table = new PlaywrightTable(page.locator("table"));
		expect(await TableBody.getRows(page.locator("table>tbody>tr"), "td")).toHaveLength(3);

		const locators = await table.getAllBodyCellLocatorsByHeaderName("Delete?");
		expect(locators).toHaveLength(3);

		for (const locator of locators.reverse()) {
			await locator.locator("input[type='button']").click();
		}

		expect(await TableBody.getRows(page.locator("table>tbody>tr"), "td")).toHaveLength(0);
	});

	test("getAllBodyCellLocatorsByHeaderIndex returns locators", async ({ page }) => {
		await page.goto(Route.ButtonTable);

		const table = new PlaywrightTable(page.locator("table"));
		expect(await TableBody.getRows(page.locator("table>tbody>tr"), "td")).toHaveLength(3);

		const locators = await table.getAllBodyCellLocatorsByHeaderIndex(1);
		expect(locators).toHaveLength(3);

		for (const locator of locators.reverse()) {
			await locator.locator("input[type='button']").click();
		}
		expect(await TableBody.getRows(page.locator("table>tbody>tr"), "td")).toHaveLength(0);
	});

	test("div table", async ({ page }) => {
		await page.goto(Route.DivTable);

		const table = new PlaywrightTable(page.locator(".divTable"), {
			header: {
				rowSelector: ".divTableHeading > .divTableRow",
				columnSelector: ".divTableHead",
			},
			row: {
				rowSelector: ".divTableBody > .divTableRow",
				columnSelector: ".divTableCell",
			},
		});
		const json = await table.getJson();

		expect(json).toEqual([
			{
				"First name": "Ronald",
				"Last name": "Veth",
				Specialty: "Test Automation",
			},
			{
				"First name": "Logan",
				"Last name": "Deacon",
				Specialty: "Make special together",
			},
			{
				"First name": "John",
				"Last name": "Doe",
				Specialty: "Anonymity",
			},
		]);
	});
});
