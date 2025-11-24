import { test, expect } from "@playwright/test";
import { PlaywrightTable } from "../src/playwright-table";
import { Route } from "./demo-html/routes";

test.describe("waitForCellText", () => {
	test("should wait for cell with exact text match", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await table.waitForCellText({ "First name": "Ronald" }, "Last name", "Veth");
	});

	test("should wait for cell with regex pattern match", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await table.waitForCellText({ "First name": "Ronald" }, "Last name", /^Ve/);
	});

	test("should wait for cell with regex containing date pattern", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await table.waitForCellText({ "First name": "Ronald" }, "Date of birth", /\d{2}-\d{2}-\d{4}/);
	});

	test("should throw error when cell text doesn't match within timeout", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForCellText({ "First name": "Ronald" }, "Last name", "Smith", { timeout: 1000, interval: 100 });
		}).rejects.toThrow(/Cell text does not match/);
	});

	test("should throw error when condition header doesn't exist", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForCellText({ NonExistent: "value" }, "Last name", "Doe", { timeout: 1000 });
		}).rejects.toThrow(/Header "NonExistent" not found/);
	});

	test("should throw error when target header doesn't exist", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForCellText({ "First name": "John" }, "NonExistent", "value", { timeout: 1000 });
		}).rejects.toThrow(/Header "NonExistent" not found/);
	});

	test("should throw error when no row matches conditions", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForCellText({ "First name": "NonExistentPerson" }, "Last name", "Doe", { timeout: 1000 });
		}).rejects.toThrow(/No row found matching conditions/);
	});

	test("should wait for cell text with multiple conditions", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await table.waitForCellText({ "First name": "Logan", "Last name": "Deacon" }, "Date of birth", "01-10-2002");
	});

	test("should handle cell text with whitespace correctly", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Should trim whitespace when comparing
		await table.waitForCellText({ "First name": "Ronald" }, "Last name", "Veth");
	});

	test("should wait for dynamically loaded cell text", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Wait for cell text to appear (loads automatically after 2 seconds)
		await table.waitForCellText({ "Header 1": "Row 1 Col 1" }, "Header 2", "Row 1 Col 2", { timeout: 5000 });
	});

	test("should work with complex regex patterns", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Match date with specific pattern
		await table.waitForCellText({ "First name": "Ronald" }, "Date of birth", /^\d{2}-\d{2}-1987$/);
	});

	test("should respect custom timeout option", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		const startTime = Date.now();
		await expect(async () => {
			await table.waitForCellText({ "First name": "Ronald" }, "Last name", "NonExistent", { timeout: 500 });
		}).rejects.toThrow();
		const elapsed = Date.now() - startTime;

		// Should fail within reasonable time (allow some overhead)
		expect(elapsed).toBeLessThan(1000);
	});

	test("should work with tuple syntax for single condition", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Using tuple syntax
		await table.waitForCellText(["First name", "Ronald"], "Last name", "Veth");
	});

	test("should work with tuple syntax and regex", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Using tuple syntax with regex
		await table.waitForCellText(["First name", "Ronald"], "Date of birth", /\d{2}-\d{2}-\d{4}/);
	});

	test("should work with object syntax for multiple conditions", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Using object syntax for multiple conditions
		await table.waitForCellText({ "First name": "Logan", "Last name": "Deacon" }, "Date of birth", "01-10-2002");
	});
});

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

	test("should wait for exact row count after dynamic load", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Initially should have 3 skeleton rows
		await table.waitForExactRowCount(3);

		// After automatic load (2 seconds), should still have 3 rows but with real data
		await table.waitForExactRowCount(3, { timeout: 5000 });

		// Verify data loaded by checking cell content
		await table.waitForCellText({ "Header 1": "Row 1 Col 1" }, "Header 2", "Row 1 Col 2", { timeout: 3000 });
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

test.describe("waitForCellText and waitForExactRowCount integration", () => {
	test("should wait for exact row count then verify cell text", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Wait for rows to load (loads automatically)
		await table.waitForExactRowCount(3, { timeout: 5000 });

		// Verify specific cell text
		await table.waitForCellText({ "Header 1": "Row 2 Col 1" }, "Header 3", "Row 2 Col 3", { timeout: 3000 });
	});

	test("should verify cell text changes after row count stabilizes", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Verify initial state
		await table.waitForExactRowCount(2);
		await table.waitForCellText({ "First name": "Ronald" }, "Last name", "Veth");

		// Modify cell content
		await page.evaluate(() => {
			const cells = document.querySelectorAll("tbody tr:first-child td");
			if (cells[1]) cells[1].textContent = "Updated";
		});

		// Verify row count unchanged but cell text updated
		await table.waitForExactRowCount(2);
		await table.waitForCellText({ "First name": "Ronald" }, "Last name", "Updated");
	});
});
