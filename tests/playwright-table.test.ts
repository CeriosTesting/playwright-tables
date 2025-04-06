import test, { expect } from "@playwright/test";
import { TestHtmlProvider, TestHtml } from "./demo-html/test-html-provider";
import { PlaywrightTable } from "../src/playwright-table";

test.describe("Table Tests", () => {
	test("getActiveHeaders returns headers used for table", async ({ page }) => {
		await page.goto(TestHtmlProvider.getHtmlFilePath(TestHtml.SimpleTable));

		const table = new PlaywrightTable(page.locator("table"));
		const headers = await table.getMainHeaderRow();
		expect(headers).toEqual(["First name", "Last name", "Date of birth"]);
	});

	test("getHeaderRows with multiple rows returns header rows", async ({ page }) => {
		await page.goto(TestHtmlProvider.getHtmlFilePath(TestHtml.RowspanHeaderTable));

		const table = new PlaywrightTable(page.locator("table"));

		const headers = await table.getHeaderRows();
		expect(headers).toEqual([
			["Average", "Average_1", "Age"],
			["Height", "Weight", "Age"],
		]);
	});

	test("getRows returns rows", async ({ page }) => {
		await page.goto(TestHtmlProvider.getHtmlFilePath(TestHtml.SimpleTable));

		const table = new PlaywrightTable(page.locator("table"));

		const rows = await table.getBodyRows();
		expect(rows).toEqual([
			["Ronald", "Veth", "22-12-1987"],
			["Logan", "Deacon", "01-10-2002"],
		]);
	});

	test("getJson returns json", async ({ page }) => {
		await page.goto(TestHtmlProvider.getHtmlFilePath(TestHtml.SimpleTable));

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
		await page.goto(TestHtmlProvider.getHtmlFilePath(TestHtml.RowspanRowTable));

		const table = new PlaywrightTable(page.locator("table"));
		const json = await table.getJson();

		expect(json).toEqual([
			{
				Month: "January",
				Savings: 100,
				"Savings for holiday!": 50,
			},
			{
				Month: "February",
				Savings: 80,
				"Savings for holiday!": 50,
			},
		]);
	});

	test("getCellLocator returns locator", async ({ page }) => {
		await page.goto(TestHtmlProvider.getHtmlFilePath(TestHtml.ButtonTable));

		const table = new PlaywrightTable(page.locator("table"));
		expect(await table.getBodyRows()).toHaveLength(3);

		const cellLocator = await table.getCellLocator(0, 1);
		await cellLocator.locator("input[type='button']").click();
		expect(await table.getBodyRows()).toHaveLength(2);
	});

	test("getCellLocatorByRowConditions returns locator", async ({ page }) => {
		await page.goto(TestHtmlProvider.getHtmlFilePath(TestHtml.ButtonTable));

		const table = new PlaywrightTable(page.locator("table"));
		expect(await table.getBodyRows()).toHaveLength(3);

		const cellLocator = await table.getCellLocatorByRowConditions({ "Rownumber": "Row 2" }, "Delete?");
		await cellLocator.locator("input[type='button']").click();
		expect(await table.getBodyRows()).toHaveLength(2);
	});
});
