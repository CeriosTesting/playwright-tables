import { test, expect } from "@playwright/test";

import { PlaywrightTable } from "../src/playwright-table";

import { Route } from "./demo-html/routes";

test.describe("waitForExactRowCount", () => {
	test("should wait for exact number of rows", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await table.waitForExactRowCount(2);
	});

	test("should throw error when row count doesn't match", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForExactRowCount(5, { timeout: 1000, interval: 100 });
		}).rejects.toThrow(/Expected exactly 5 rows, but found 2/);
	});

	test("should wait for exactly 0 rows (empty table)", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Delete all rows
		await page.evaluate(() => {
			const tbody = document.querySelector("tbody");
			if (tbody) tbody.innerHTML = "";
		});

		await table.waitForExactRowCount(0);
	});

	test("should throw error for negative row count", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForExactRowCount(-1);
		}).rejects.toThrow(/Row count must be a non-negative integer/);
	});

	test("should throw error for non-integer row count", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForExactRowCount(3.5);
		}).rejects.toThrow(/Row count must be a non-negative integer/);
	});

	test("should wait for exact row count after rows are added progressively", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Add a new row
		await page.evaluate(() => {
			const tbody = document.querySelector("tbody");
			if (tbody) {
				const newRow = tbody.insertRow();
				newRow.insertCell(0).textContent = "Bob";
				newRow.insertCell(1).textContent = "Johnson";
				newRow.insertCell(2).textContent = "05-05-1995";
			}
		});

		await table.waitForExactRowCount(3);
	});

	test("should wait for exact row count after rows are removed", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Remove last row
		await page.evaluate(() => {
			const tbody = document.querySelector("tbody");
			if (tbody && tbody.rows.length > 0) {
				tbody.deleteRow(tbody.rows.length - 1);
			}
		});

		await table.waitForExactRowCount(1);
	});

	test("should respect custom timeout option", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		const startTime = Date.now();
		await expect(async () => {
			await table.waitForExactRowCount(10, { timeout: 500 });
		}).rejects.toThrow();
		const elapsed = Date.now() - startTime;

		// Should fail within reasonable time (allow some overhead)
		expect(elapsed).toBeLessThan(1000);
	});

	test("should respect custom interval option", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Just verify it completes successfully with custom interval
		await table.waitForExactRowCount(2, { timeout: 1000, interval: 200 });
	});

	test("should work with large row counts", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Add many rows
		await page.evaluate(() => {
			const tbody = document.querySelector("tbody");
			if (tbody) {
				for (let i = 0; i < 98; i++) {
					const newRow = tbody.insertRow();
					newRow.insertCell(0).textContent = `User${i}`;
					newRow.insertCell(1).textContent = `Last${i}`;
					newRow.insertCell(2).textContent = `0${i % 30}-0${(i % 12) + 1}-19${80 + (i % 20)}`;
				}
			}
		});

		await table.waitForExactRowCount(100, { timeout: 5000 });
	});

	test("should handle race condition when rows change rapidly", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Simulate rapid changes
		page.evaluate(() => {
			const tbody = document.querySelector("tbody");
			if (tbody) {
				let count = 2;
				const interval = setInterval(() => {
					if (count < 10) {
						const newRow = tbody.insertRow();
						newRow.insertCell(0).textContent = `User${count}`;
						newRow.insertCell(1).textContent = `Last${count}`;
						newRow.insertCell(2).textContent = `0${count}-01-2000`;
						count++;
					} else {
						clearInterval(interval);
					}
				}, 100);
			}
		});

		// Should eventually reach 10 rows
		await table.waitForExactRowCount(10, { timeout: 5000 });
	});
});
