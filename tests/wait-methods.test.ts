import test, { expect } from "@playwright/test";
import { PlaywrightTable } from "../src/playwright-table";
import { TableWait, RowKind } from "../src/table-wait";
import { Route } from "./demo-html/routes";

test.describe("TableWait - Input Validation", () => {
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

test.describe("TableWait - Options Validation", () => {
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
	test.describe(`TableWait.waitForRows - ${rowTestRun.rowKind}`, () => {
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

test.describe("PlaywrightTable.waitForStable", () => {
	test("should wait for table to stabilize with actual content", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Add a delayed update to simulate dynamic content that happens quickly
		const updatePromise = page.evaluate(() => {
			return new Promise<void>(resolve => {
				setTimeout(() => {
					const tbody = document.querySelector("tbody");
					if (tbody && tbody.rows.length > 0) {
						const cell = tbody.rows[0].cells[0];
						if (cell) {
							cell.textContent = "Updated Content";
						}
					}
					resolve();
				}, 100);
			});
		});

		// Wait for the update to happen first
		await updatePromise;

		// Should detect stability after the content change
		await table.waitForStable({ stabilityDuration: 200, checkInterval: 50, timeout: 3000 });

		// Verify table has the updated content
		const rows = await table.getBodyRows();
		expect(rows[0][0]).toBe("Updated Content");
	});

	test("should detect when table keeps changing", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Add script to continuously modify table
		await page.evaluate(() => {
			const interval = setInterval(() => {
				const tbody = document.querySelector("tbody");
				if (tbody && tbody.rows.length > 0) {
					const cell = tbody.rows[0].cells[0];
					if (cell) {
						cell.textContent = `Modified-${Date.now()}`;
					}
				}
			}, 50);
			(window as any).__testInterval = interval;
		});

		await expect(
			table.waitForStable({ stabilityDuration: 500, checkInterval: 100, timeout: 2000 })
		).rejects.toThrowError(/Table did not stabilize within 2000ms/);

		// Cleanup
		await page.evaluate(() => {
			clearInterval((window as any).__testInterval);
		});
	});

	test("should work with custom stability duration", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForStable({ stabilityDuration: 200, checkInterval: 50, timeout: 5000 });
		}).toPass();
	});
});

test.describe("PlaywrightTable.waitForEmpty", () => {
	test("should wait for table to be empty", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Remove all body rows
		await page.evaluate(() => {
			const tbody = document.querySelector("tbody");
			if (tbody) {
				tbody.innerHTML = "";
			}
		});

		await expect(async () => {
			await table.waitForEmpty({ timeout: 5000 });
		}).toPass();
	});

	test("should throw error when table is not empty", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(table.waitForEmpty({ timeout: 2000 })).rejects.toThrowError(
			/Expected table to be empty, but found \d+ body rows/
		);
	});
});

test.describe("PlaywrightTable.waitForNonEmpty", () => {
	test("should wait for table to be non-empty with content", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForNonEmpty({ timeout: 5000 });
		}).toPass();
	});

	test("should throw error when table has no rows", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Remove all body rows
		await page.evaluate(() => {
			const tbody = document.querySelector("tbody");
			if (tbody) {
				tbody.innerHTML = "";
			}
		});

		await expect(table.waitForNonEmpty({ timeout: 2000 })).rejects.toThrowError(
			/Expected table to be non-empty, but found 0 body rows/
		);
	});

	test("should throw error when table has rows but all cells are empty", async ({ page }) => {
		await page.goto(Route.EmptyBodyRowsTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(table.waitForNonEmpty({ timeout: 2000 })).rejects.toThrowError(
			/Expected table to have at least one row with content, but all 2 rows are empty/
		);
	});

	test("should succeed when at least one cell has content", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Clear all cells except one
		await page.evaluate(() => {
			const cells = document.querySelectorAll("tbody td");
			cells.forEach((cell, index) => {
				if (index !== 0) {
					cell.textContent = "";
				}
			});
		});

		await expect(async () => {
			await table.waitForNonEmpty({ timeout: 2000 });
		}).toPass();
	});
});

test.describe("PlaywrightTable.waitForRowByConditions", () => {
	test("waits for row matching single condition", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));
		await table.waitForRowByConditions({ "First name": "Ronald" });
		// If we get here, the row was found
		expect(true).toBe(true);
	});

	test("waits for row matching multiple conditions", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));
		await table.waitForRowByConditions({ "First name": "Logan", "Last name": "Deacon", "Date of birth": "01-10-2002" });
		expect(true).toBe(true);
	});

	test("waits for minimum number of matching rows with single condition matching multiple rows", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));
		// Add third row that matches
		await page.evaluate(() => {
			const tbody = document.querySelector("tbody");
			if (tbody) {
				const newRow = tbody.insertRow();
				newRow.insertCell().textContent = "Ronald";
				newRow.insertCell().textContent = "Smith";
				newRow.insertCell().textContent = "15-03-1990";
			}
		});
		// Now we have 2 rows with First name="Ronald"
		await table.waitForRowByConditions({ "First name": "Ronald" }, { minRows: 2 });
		expect(true).toBe(true);
	});

	test("succeeds immediately if conditions already met", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));
		const startTime = Date.now();
		await table.waitForRowByConditions({ "First name": "Ronald" }, { timeout: 5000 });
		const elapsed = Date.now() - startTime;
		// Should complete in well under 1 second
		expect(elapsed).toBeLessThan(1000);
	});

	test("throws error when no rows match conditions", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));
		let error: Error | undefined;
		try {
			await table.waitForRowByConditions({ "First name": "NonExistent" }, { timeout: 1000, interval: 100 });
		} catch (e) {
			error = e as Error;
		}
		expect(error).toBeDefined();
		expect(error?.message).toContain("Expected at least 1 rows matching conditions, but found 0");
		expect(error?.message).toContain('"First name":"NonExistent"');
		expect(error?.message).toContain("Total rows searched:");
		expect(error?.message).toContain("Body row locator:");
	});

	test("throws error when not enough rows match conditions", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));
		let error: Error | undefined;
		try {
			// Only 1 row with First name="Ronald", but require 2
			await table.waitForRowByConditions({ "First name": "Ronald" }, { minRows: 2, timeout: 1000, interval: 100 });
		} catch (e) {
			error = e as Error;
		}
		expect(error).toBeDefined();
		expect(error?.message).toContain("Expected at least 2 rows matching conditions, but found 1");
	});

	test("throws error when header not found", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));
		let error: Error | undefined;
		try {
			await table.waitForRowByConditions({ NonExistentHeader: "value" }, { timeout: 1000 });
		} catch (e) {
			error = e as Error;
		}
		expect(error).toBeDefined();
		expect(error?.message).toContain('Header "NonExistentHeader" not found');
		expect(error?.message).toContain("Available headers: [First name, Last name, Date of birth]");
		expect(error?.message).toContain("Header row locator:");
	});

	test("respects custom timeout option", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));
		const startTime = Date.now();
		let error: Error | undefined;
		try {
			await table.waitForRowByConditions({ "First name": "NonExistent" }, { timeout: 2000, interval: 100 });
		} catch (e) {
			error = e as Error;
		}
		const elapsed = Date.now() - startTime;
		expect(error).toBeDefined();
		expect(elapsed).toBeGreaterThanOrEqual(1900); // Allow some margin
		expect(elapsed).toBeLessThan(2500);
	});

	test("works with exact string values", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));
		await table.waitForRowByConditions({ "First name": "Ronald", "Last name": "Veth" });
		expect(true).toBe(true);
	});

	test("matches exact values only (no partial matches)", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));
		let error: Error | undefined;
		try {
			// "Ron" is partial match of "Ronald", should not match
			await table.waitForRowByConditions({ "First name": "Ron" }, { timeout: 1000, interval: 100 });
		} catch (e) {
			error = e as Error;
		}
		expect(error).toBeDefined();
		expect(error?.message).toContain("Expected at least 1 rows matching conditions, but found 0");
	});

	test("uses minRows default of 1 when not specified", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));
		// Should succeed with 1 matching row
		await table.waitForRowByConditions({ "First name": "Ronald" });
		expect(true).toBe(true);
	});
});
