import test, { expect } from "@playwright/test";
import { Table } from "src/table";
import { Route } from "./demo-html/routes";
import { TableBody } from "src/table-body";

test.describe("Table Tests", () => {
	test("getActiveHeaders returns headers used for table", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const table = new Table(page.locator("table"));
		const headers = await table.getMainHeaderRow();
		expect(headers).toEqual(["First name", "Last name", "Date of birth"]);
	});

	test("getHeaderRows returns header rows", async ({ page }) => {
		await page.goto(Route.RowspanHeaderTable);

		const table = new Table(page.locator("table"));

		const headers = await table.getHeaderRows({ headerRowOptions: { colspan: { enabled: false } } });
		expect(headers).toEqual([
			["Average", "Average", "Age"],
			["Height", "Weight", "Height", "Weight", "Age"],
		]);
	});

	test("getBodyRows returns body rows", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const table = new Table(page.locator("table"));

		const rows = await table.getBodyRows();
		expect(rows).toEqual([
			["Ronald", "Veth", "22-12-1987"],
			["Logan", "Deacon", "01-10-2002"],
		]);
	});

	test.describe("getJson", async () => {
		test("getJson returns json", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			const table = new Table(page.locator("table"));

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

			const table = new Table(page.locator("table"));
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
	});

	test("getBodyCellLocator returns locator", async ({ page }) => {
		await page.goto(Route.ButtonTable);

		const table = new Table(page.locator("table"));
		expect(await table.getBodyRows()).toHaveLength(3);

		const cellLocator = table.getBodyCellLocator(0, 1);
		await cellLocator.locator("input[type='button']").click();
		expect(await table.getBodyRows()).toHaveLength(2);
	});

	test("getBodyCellLocatorByRowConditions returns locator", async ({ page }) => {
		await page.goto(Route.ButtonTable);

		const table = new Table(page.locator("table"));
		expect(await table.getBodyRows()).toHaveLength(3);

		const cellLocator = await table.getBodyCellLocatorByRowConditions({ Rownumber: "Row 2" }, "Delete?");
		await cellLocator.locator("input[type='button']").click();
		expect(await table.getBodyRows()).toHaveLength(2);
	});

	test("getAllBodyCellLocatorsByHeaderName returns locators", async ({ page }) => {
		await page.goto(Route.ButtonTable);

		const table = new Table(page.locator("table"));
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

		const table = new Table(page.locator("table"));
		expect(await TableBody.getRows(page.locator("table>tbody>tr"), "td")).toHaveLength(3);

		const locators = await table.getAllBodyCellLocatorsByHeaderIndex(1);
		expect(locators).toHaveLength(3);

		for (const locator of locators.reverse()) {
			await locator.locator("input[type='button']").click();
		}
		expect(await TableBody.getRows(page.locator("table>tbody>tr"), "td")).toHaveLength(0);
	});

	test.describe("dynamic table loading", async () => {
		test("should wait for table to contain text", async ({ page }) => {
			await page.goto(Route.DynamicLoadTable);

			const table = new Table(page.locator("table"));
			const json = await table.getJson();
			expect(json).toEqual([
				{
					"Header 1": "Row 1 Col 1",
					"Header 2": "Row 1 Col 2",
					"Header 3": "Row 1 Col 3",
				},
				{
					"Header 1": "Row 2 Col 1",
					"Header 2": "Row 2 Col 2",
					"Header 3": "Row 2 Col 3",
				},
				{
					"Header 1": "Row 3 Col 1",
					"Header 2": "Row 3 Col 2",
					"Header 3": "Row 3 Col 3",
				},
			]);
		});

		test("empty header rows should throw exception", async ({ page }) => {
			await page.goto(Route.EmptyHeaderRowsTable);

			const table = new Table(page.locator("table"));
			await expect(table.getJson({ timeout: 1_000 })).rejects.toThrowError("No header cells with content found");
		});

		test("empty body rows should throw exception", async ({ page }) => {
			await page.goto(Route.EmptyBodyRowsTable);

			const table = new Table(page.locator("table"));
			await expect(table.getJson({ timeout: 1_000 })).rejects.toThrowError("No body cells with content found");
		});

		test("No header rows should throw exception", async ({ page }) => {
			await page.goto(Route.EmptyHeaderRowsTable);

			const table = new Table(page.locator("table"), { header: { rowSelector: "invalid" } });
			await expect(table.getJson({ timeout: 1_000 })).rejects.toThrowError("No header cells with content found");
		});

		test("No header row cells should throw exception", async ({ page }) => {
			await page.goto(Route.EmptyHeaderRowsTable);

			const table = new Table(page.locator("table"), { header: { columnSelector: "invalid" } });
			await expect(table.getJson({ timeout: 1_000 })).rejects.toThrowError("No header cells with content found");
		});

		test("No body rows should throw exception", async ({ page }) => {
			await page.goto(Route.EmptyBodyRowsTable);

			const table = new Table(page.locator("table"), { row: { rowSelector: "invalid" } });
			await expect(table.getJson({ timeout: 1_000 })).rejects.toThrowError("No body cells with content found");
		});

		test("No body row cells should throw exception", async ({ page }) => {
			await page.goto(Route.EmptyBodyRowsTable);

			const table = new Table(page.locator("table"), { row: { columnSelector: "invalid" } });
			await expect(table.getJson({ timeout: 1_000 })).rejects.toThrowError("No body cells with content found");
		});
	});

	test("div table", async ({ page }) => {
		await page.goto(Route.DivTable);

		const table = new Table(page.locator(".divTable"), {
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
