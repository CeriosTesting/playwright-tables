import { test, expect } from "@playwright/test";
import { PlaywrightTable } from "../src/playwright-table";
import { Route } from "./demo-html/routes";

test.describe("Error Handling Tests", () => {
	test.describe("getBodyCellLocator validation", () => {
		test("should throw error when accessing cell before loading data", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"));

			expect(() => table.getBodyCellLocator(0, 0)).toThrowError(
				"Table has no body rows loaded. Call load() or getBodyRows() first."
			);
		});

		test("should throw error when row index is negative", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"));
			await table.getBodyRows();

			expect(() => table.getBodyCellLocator(-1, 0)).toThrowError("Row index -1 out of bounds. Table has 2 rows.");
		});

		test("should throw error when row index exceeds table rows", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"));
			await table.getBodyRows();

			expect(() => table.getBodyCellLocator(10, 0)).toThrowError("Row index 10 out of bounds. Table has 2 rows.");
		});

		test("should throw error when column index is negative", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"));
			await table.getBodyRows();

			expect(() => table.getBodyCellLocator(0, -1)).toThrowError("Column index -1 out of bounds. Table has 3 columns.");
		});

		test("should throw error when column index exceeds table columns", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"));
			await table.getBodyRows();

			expect(() => table.getBodyCellLocator(0, 10)).toThrowError("Column index 10 out of bounds. Table has 3 columns.");
		});
	});

	test.describe("mainHeaderRow validation", () => {
		test("should throw error when setMainHeaderRow is out of bounds", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"), {
				header: { setMainHeaderRow: 5 },
			});

			await expect(table.getMainHeaderRow()).rejects.toThrowError(
				"Header row index 5 out of bounds. Table has 1 header rows."
			);
		});

		test("should throw error when setMainHeaderRow is negative", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"), {
				header: { setMainHeaderRow: -1 },
			});

			await expect(table.getMainHeaderRow()).rejects.toThrowError(
				"Header row index -1 out of bounds. Table has 1 header rows."
			);
		});
	});

	test.describe("getAllBodyCellLocatorsByHeaderIndex validation", () => {
		test("should throw error when header index is out of bounds", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"));

			await expect(table.getAllBodyCellLocatorsByHeaderIndex(10)).rejects.toThrowError(
				"Header index 10 out of bounds. Table has 3 columns."
			);
		});

		test("should throw error when header index is negative", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"));

			await expect(table.getAllBodyCellLocatorsByHeaderIndex(-1)).rejects.toThrowError(
				"Header index -1 out of bounds. Table has 3 columns."
			);
		});
	});

	test.describe("Header and body not found after load", () => {
		test("should throw error when no header rows found after loading", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"), {
				header: { rowSelector: "thead>tr.nonexistent" },
			});

			await expect(table.getHeaderRows({ timeout: 1_000 })).rejects.toThrowError("No header rows found");
		});

		test("should throw error when no body rows found after loading", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"), {
				row: { rowSelector: "tbody>tr.nonexistent" },
			});

			await expect(table.getBodyRows({ timeout: 1_000 })).rejects.toThrowError("No body rows found");
		});
	});

	test.describe("Existing error handling still works", () => {
		test("should throw error when header not found in getBodyCellLocatorByRowConditions", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"));

			await expect(
				table.getBodyCellLocatorByRowConditions({ "First name": "Ronald" }, "Nonexistent Header")
			).rejects.toThrowError('Header "Nonexistent Header" not found.');
		});

		test("should throw error when condition header not found", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"));

			await expect(
				table.getBodyCellLocatorByRowConditions({ "Nonexistent Header": "value" }, "First name")
			).rejects.toThrowError('Header "Nonexistent Header" not found.');
		});

		test("should throw error when no row matches conditions", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"));

			await expect(
				table.getBodyCellLocatorByRowConditions({ "First name": "Nonexistent Value" }, "Last name")
			).rejects.toThrowError('No row found matching conditions: {"First name":"Nonexistent Value"}');
		});

		test("should throw error when header not found in getAllBodyCellLocatorsByHeaderName", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"));

			await expect(table.getAllBodyCellLocatorsByHeaderName("Nonexistent Header")).rejects.toThrowError(
				'Header "Nonexistent Header" not found.'
			);
		});
	});
});
