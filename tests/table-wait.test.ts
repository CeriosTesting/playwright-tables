import test, { expect } from "@playwright/test";
import { Route } from "./demo-html/routes";
import { RowKind, TableWait } from "src/table-wait";

const rowTestRuns = [
	{
		rowKind: RowKind.Header,
		rowSelector: "thead > tr",
		cellSelector: "th",
		amoundOfRows: 1,
	},
	{
		rowKind: RowKind.Body,
		rowSelector: "tbody > tr",
		cellSelector: "td",
		amoundOfRows: 3,
	},
];
for (const rowTestRun of rowTestRuns) {
	test.describe(`waitForRows ${rowTestRun.rowKind}`, async () => {
		test("default options should not throw error with timeout", async ({ page }) => {
			await page.goto(Route.DynamicLoadTable);

			await expect(async () =>
				TableWait.waitForRows(page.locator(rowTestRun.rowSelector), rowTestRun.cellSelector, rowTestRun.rowKind)
			).toPass();
		});

		test("default options should throw error without timeout", async ({ page }) => {
			await page.goto(Route.DynamicLoadTable);

			await expect(
				TableWait.waitForRows(page.locator(rowTestRun.rowSelector), rowTestRun.cellSelector, rowTestRun.rowKind)
			).rejects.toThrowError(`No ${rowTestRun.rowKind} cells with content found`);
		});

		test("should throw error when amount of rows is not met", async ({ page }) => {
			await page.goto(Route.DynamicLoadTable);

			await expect(
				TableWait.waitForRows(page.locator(rowTestRun.rowSelector), rowTestRun.cellSelector, rowTestRun.rowKind, {
					row: { amount: 5 },
				})
			).rejects.toThrowError(`Expected 5 ${rowTestRun.rowKind} rows, but found ${rowTestRun.amoundOfRows}`);
		});

		test("should NOT throw error when amount of rows is met", async ({ page }) => {
			await page.goto(Route.DynamicLoadTable);

			await expect(async () =>
				TableWait.waitForRows(page.locator(rowTestRun.rowSelector), rowTestRun.cellSelector, rowTestRun.rowKind, {
					row: { amount: rowTestRun.amoundOfRows },
				})
			).toPass();
		});

		test("should throw error when amount of cells is not met", async ({ page }) => {
			await page.goto(Route.DynamicLoadTable);

			await expect(
				TableWait.waitForRows(page.locator(rowTestRun.rowSelector), rowTestRun.cellSelector, rowTestRun.rowKind, {
					row: { cell: { totalCount: 10 } },
				})
			).rejects.toThrowError(`No ${rowTestRun.rowKind} rows found with exactly 10 cells`);
		});
		test("should NOT throw error when amount of cells is met", async ({ page }) => {
			await page.goto(Route.DynamicLoadTable);

			await expect(async () =>
				TableWait.waitForRows(page.locator(rowTestRun.rowSelector), rowTestRun.cellSelector, rowTestRun.rowKind, {
					row: { cell: { totalCount: 3 } },
				})
			).toPass();
		});

		test("should throw error when amount of cells with content is not met", async ({ page }) => {
			await page.goto(Route.DynamicLoadTable);

			await expect(
				TableWait.waitForRows(page.locator(rowTestRun.rowSelector), rowTestRun.cellSelector, rowTestRun.rowKind, {
					row: { cell: { contentCount: 10 } },
				})
			).rejects.toThrowError(`No ${rowTestRun.rowKind} rows found with exactly 10 cells containing content`);
		});
		test("should NOT throw error when amount of cells with content is met", async ({ page }) => {
			await page.goto(Route.DynamicLoadTable);

			await expect(async () =>
				TableWait.waitForRows(page.locator(rowTestRun.rowSelector), rowTestRun.cellSelector, rowTestRun.rowKind, {
					row: { cell: { contentCount: 3 } },
				})
			).toPass();
		});
	});
}
