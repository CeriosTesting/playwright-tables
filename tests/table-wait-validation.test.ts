import { test, expect } from "@playwright/test";
import { TableWait, RowKind } from "../src/table-wait";
import { Route } from "./demo-html/routes";

test.describe("TableWait Validation Tests", () => {
	test.describe("Input validation", () => {
		test("should throw error when cellSelector is empty", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(TableWait.waitForRows(page.locator("tbody>tr"), "", RowKind.Body)).rejects.toThrowError(
				"cellSelector cannot be empty"
			);
		});

		test("should throw error when cellSelector is whitespace", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(TableWait.waitForRows(page.locator("tbody>tr"), "   ", RowKind.Body)).rejects.toThrowError(
				"cellSelector cannot be empty"
			);
		});
	});

	test.describe("Options validation", () => {
		test("should throw error when row.amount is negative", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(
				TableWait.waitForRows(page.locator("tbody>tr"), "td", RowKind.Body, {
					row: { amount: -1 },
				})
			).rejects.toThrowError("row.amount must be a positive integer, got: -1");
		});

		test("should throw error when row.amount is zero", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(
				TableWait.waitForRows(page.locator("tbody>tr"), "td", RowKind.Body, {
					row: { amount: 0 },
				})
			).rejects.toThrowError("row.amount must be a positive integer, got: 0");
		});

		test("should throw error when row.amount is not an integer", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(
				TableWait.waitForRows(page.locator("tbody>tr"), "td", RowKind.Body, {
					row: { amount: 2.5 },
				})
			).rejects.toThrowError("row.amount must be a positive integer, got: 2.5");
		});

		test("should throw error when row.cell.totalCount is negative", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(
				TableWait.waitForRows(page.locator("tbody>tr"), "td", RowKind.Body, {
					row: { cell: { totalCount: -1 } },
				})
			).rejects.toThrowError("row.cell.totalCount must be a positive integer, got: -1");
		});

		test("should throw error when row.cell.totalCount is zero", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(
				TableWait.waitForRows(page.locator("tbody>tr"), "td", RowKind.Body, {
					row: { cell: { totalCount: 0 } },
				})
			).rejects.toThrowError("row.cell.totalCount must be a positive integer, got: 0");
		});

		test("should throw error when row.cell.totalCount is not an integer", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(
				TableWait.waitForRows(page.locator("tbody>tr"), "td", RowKind.Body, {
					row: { cell: { totalCount: 3.7 } },
				})
			).rejects.toThrowError("row.cell.totalCount must be a positive integer, got: 3.7");
		});

		test("should throw error when row.cell.contentCount is negative", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(
				TableWait.waitForRows(page.locator("tbody>tr"), "td", RowKind.Body, {
					row: { cell: { contentCount: -1 } },
				})
			).rejects.toThrowError("row.cell.contentCount must be a positive integer, got: -1");
		});

		test("should throw error when row.cell.contentCount is zero", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(
				TableWait.waitForRows(page.locator("tbody>tr"), "td", RowKind.Body, {
					row: { cell: { contentCount: 0 } },
				})
			).rejects.toThrowError("row.cell.contentCount must be a positive integer, got: 0");
		});

		test("should throw error when row.cell.contentCount is not an integer", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(
				TableWait.waitForRows(page.locator("tbody>tr"), "td", RowKind.Body, {
					row: { cell: { contentCount: 1.5 } },
				})
			).rejects.toThrowError("row.cell.contentCount must be a positive integer, got: 1.5");
		});
	});

	test.describe("Valid options should work", () => {
		test("should NOT throw error with valid row.amount", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(async () =>
				TableWait.waitForRows(page.locator("tbody>tr"), "td", RowKind.Body, {
					row: { amount: 2 },
				})
			).toPass();
		});

		test("should NOT throw error with valid row.cell.totalCount", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(async () =>
				TableWait.waitForRows(page.locator("tbody>tr"), "td", RowKind.Body, {
					row: { cell: { totalCount: 3 } },
				})
			).toPass();
		});

		test("should NOT throw error with valid row.cell.contentCount", async ({ page }) => {
			await page.goto(Route.SimpleTable);

			await expect(async () =>
				TableWait.waitForRows(page.locator("tbody>tr"), "td", RowKind.Body, {
					row: { cell: { contentCount: 3 } },
				})
			).toPass();
		});
	});
});
