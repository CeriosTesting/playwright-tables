import { test, expect } from "@playwright/test";
import { PlaywrightTable } from "../src/playwright-table";
import { TableHeader } from "../src/table-header";
import { TableBody } from "../src/table-body";
import { TableUtils } from "../src/table-utils";
import { CellContentType } from "../src/cell-content-type";
import { Route } from "./demo-html/routes";

test.describe("PlaywrightTable - Error Handling", () => {
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
		test("should throw error when no header rows found", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"), {
				header: { rowSelector: "thead>tr.nonexistent" },
			});

			await expect(table.getHeaderRows()).rejects.toThrowError("No header rows found");
		});

		test("should throw error when no body rows found", async ({ page }) => {
			await page.goto(Route.SimpleTable);
			const table = new PlaywrightTable(page.locator("table"), {
				row: { rowSelector: "tbody>tr.nonexistent" },
			});

			await expect(table.getBodyRows()).rejects.toThrowError("No body rows found");
		});
	});
});

test.describe("TableUtils - Error Messages", () => {
	test("getCellContent should include locator chain when cell doesn't exist", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const nonExistentCell = page.locator("table tbody tr td.non-existent-class");

		await expect(async () => {
			await TableUtils.getCellContent(nonExistentCell, CellContentType.InnerText);
		}).rejects.toThrow(/Failed to get cell content/);

		await expect(async () => {
			await TableUtils.getCellContent(nonExistentCell, CellContentType.InnerText);
		}).rejects.toThrow(/Locator:.*table.*tbody.*tr.*td\.non-existent-class/);
	});

	test("getCellContent should include content type in error message", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const nonExistentCell = page.locator("table tbody tr.invalid td");

		await expect(async () => {
			await TableUtils.getCellContent(nonExistentCell, CellContentType.TextContent);
		}).rejects.toThrow(/Content type: textContent/);
	});

	test("parseSpanAttributes should include locator chain for invalid attributes", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		// Create a cell with invalid rowspan
		await page.evaluate(() => {
			const cell = document.querySelector("table tbody tr td");
			if (cell) {
				cell.setAttribute("rowspan", "invalid");
			}
		});

		const cellWithInvalidRowspan = page.locator("table tbody tr td").first();

		await expect(async () => {
			await TableUtils.parseSpanAttributes(cellWithInvalidRowspan);
		}).rejects.toThrow(/Failed to parse span attributes/);

		await expect(async () => {
			await TableUtils.parseSpanAttributes(cellWithInvalidRowspan);
		}).rejects.toThrow(/Locator:.*table.*tbody.*tr.*td/);
	});

	test("parseSpanAttributes should report invalid rowspan value", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		await page.evaluate(() => {
			const cell = document.querySelector("table tbody tr td");
			if (cell) {
				cell.setAttribute("rowspan", "-5");
			}
		});

		const cellWithInvalidRowspan = page.locator("table tbody tr td").first();

		await expect(async () => {
			await TableUtils.parseSpanAttributes(cellWithInvalidRowspan);
		}).rejects.toThrow(/Invalid rowspan attribute: "-5"/);
	});

	test("parseSpanAttributes should report invalid colspan value", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		await page.evaluate(() => {
			const cell = document.querySelector("table tbody tr td");
			if (cell) {
				cell.setAttribute("colspan", "0");
			}
		});

		const cellWithInvalidColspan = page.locator("table tbody tr td").first();

		await expect(async () => {
			await TableUtils.parseSpanAttributes(cellWithInvalidColspan);
		}).rejects.toThrow(/Invalid colspan attribute: "0"/);
	});

	test("should extract full selector chain from nested locators", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const complexLocator = page
			.locator("#content")
			.locator("table.my-table")
			.locator("tbody")
			.locator("tr.data-row")
			.locator("td.non-existent");

		await expect(async () => {
			await TableUtils.getCellContent(complexLocator, CellContentType.InnerText);
		}).rejects.toThrow(/Locator:.*#content.*table\.my-table.*tbody.*tr\.data-row.*td\.non-existent/);
	});

	test("should include nth selectors in error messages", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const nthLocator = page.locator("table tbody tr").nth(999).locator("td").nth(999);

		await expect(async () => {
			await TableUtils.getCellContent(nthLocator, CellContentType.InnerText);
		}).rejects.toThrow(/Locator:.*table.*tbody.*tr.*nth\(999\).*td.*nth\(999\)/);
	});
});

test.describe("TableHeader - Error Messages", () => {
	test("getRows should include row index and locator when cell processing fails", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		// Modify DOM to create invalid colspan that will cause an error
		await page.evaluate(() => {
			const header = document.querySelector("table thead tr th");
			if (header) {
				header.setAttribute("colspan", "invalid-value");
			}
		});

		const headerRowLocator = page.locator("table thead tr");

		await expect(async () => {
			await TableHeader.getRows(headerRowLocator, "th");
		}).rejects.toThrow(/Failed to process header row at index/);

		await expect(async () => {
			await TableHeader.getRows(headerRowLocator, "th");
		}).rejects.toThrow(/Header row locator:.*table.*thead.*tr/);

		await expect(async () => {
			await TableHeader.getRows(headerRowLocator, "th");
		}).rejects.toThrow(/Columns selector: "th"/);
	});

	test("getRows should throw error for empty columnsSelector", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const headerRowLocator = page.locator("table thead tr");

		await expect(async () => {
			await TableHeader.getRows(headerRowLocator, "");
		}).rejects.toThrow(/columnsSelector cannot be empty/);

		await expect(async () => {
			await TableHeader.getRows(headerRowLocator, "   ");
		}).rejects.toThrow(/columnsSelector cannot be empty/);
	});

	test("should provide detailed error when processing complex table with colspan issues", async ({ page }) => {
		await page.goto(Route.ColspanHeaderTable);

		// Modify the DOM to create an invalid colspan
		await page.evaluate(() => {
			const header = document.querySelector("table thead tr th");
			if (header) {
				header.setAttribute("colspan", "abc");
			}
		});

		const headerRowLocator = page.locator("table thead tr");

		await expect(async () => {
			await TableHeader.getRows(headerRowLocator, "th");
		}).rejects.toThrow(/Failed to process header row/);

		await expect(async () => {
			await TableHeader.getRows(headerRowLocator, "th");
		}).rejects.toThrow(/Invalid colspan attribute/);
	});
});

test.describe("TableBody - Error Messages", () => {
	test("getRows should include row index and locator when cell processing fails", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		// Modify DOM to create invalid rowspan that will cause an error
		await page.evaluate(() => {
			const cell = document.querySelector("table tbody tr td");
			if (cell) {
				cell.setAttribute("rowspan", "not-a-number");
			}
		});

		const bodyRowLocator = page.locator("table tbody tr");

		await expect(async () => {
			await TableBody.getRows(bodyRowLocator, "td");
		}).rejects.toThrow(/Failed to process body row at index/);

		await expect(async () => {
			await TableBody.getRows(bodyRowLocator, "td");
		}).rejects.toThrow(/Body row locator:.*table.*tbody.*tr/);

		await expect(async () => {
			await TableBody.getRows(bodyRowLocator, "td");
		}).rejects.toThrow(/Columns selector: "td"/);
	});

	test("getRows should throw error for empty columnsSelector", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const bodyRowLocator = page.locator("table tbody tr");

		await expect(async () => {
			await TableBody.getRows(bodyRowLocator, "");
		}).rejects.toThrow(/columnsSelector cannot be empty/);
	});

	test("should provide detailed error when processing table with rowspan issues", async ({ page }) => {
		await page.goto(Route.RowspanRowTable);

		// Modify the DOM to create an invalid rowspan
		await page.evaluate(() => {
			const cell = document.querySelector("table tbody tr td[rowspan]");
			if (cell) {
				cell.setAttribute("rowspan", "-10");
			}
		});

		const bodyRowLocator = page.locator("table tbody tr");

		await expect(async () => {
			await TableBody.getRows(bodyRowLocator, "td");
		}).rejects.toThrow(/Failed to process body row/);

		await expect(async () => {
			await TableBody.getRows(bodyRowLocator, "td");
		}).rejects.toThrow(/Invalid rowspan attribute/);
	});
});

test.describe("PlaywrightTable - Detailed Error Messages", () => {
	test("mainHeaderRow should throw error when setMainHeaderRow is out of bounds with details", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const table = new PlaywrightTable(page.locator("table"), {
			header: { setMainHeaderRow: 999 },
		});

		await expect(async () => {
			await table.getMainHeaderRow();
		}).rejects.toThrow(/Header row index 999 out of bounds/);

		await expect(async () => {
			await table.getMainHeaderRow();
		}).rejects.toThrow(/Table has 1 header rows/);
	});

	test("mainHeaderRow should throw error when setMainHeaderRow is negative with details", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const table = new PlaywrightTable(page.locator("table"), {
			header: { setMainHeaderRow: -1 },
		});

		await expect(async () => {
			await table.getMainHeaderRow();
		}).rejects.toThrow(/Header row index -1 out of bounds/);
	});

	test("getBodyCellLocatorByRowConditions should include available headers when not found", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.getBodyCellLocatorByRowConditions({ "Non Existent Header": "value" }, "First name");
		}).rejects.toThrow(/Header "Non Existent Header" not found/);

		await expect(async () => {
			await table.getBodyCellLocatorByRowConditions({ "Non Existent Header": "value" }, "First name");
		}).rejects.toThrow(/Available headers: \[First name, Last name, Date of birth\]/);

		await expect(async () => {
			await table.getBodyCellLocatorByRowConditions({ "Non Existent Header": "value" }, "First name");
		}).rejects.toThrow(/Header row locator:.*table.*thead.*tr/);
	});

	test("getBodyCellLocatorByRowConditions should include target header in error when not found", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.getBodyCellLocatorByRowConditions({ "First name": "Ronald" }, "Invalid Target");
		}).rejects.toThrow(/Header "Invalid Target" not found/);

		await expect(async () => {
			await table.getBodyCellLocatorByRowConditions({ "First name": "Ronald" }, "Invalid Target");
		}).rejects.toThrow(/Available headers: \[First name, Last name, Date of birth\]/);
	});

	test("getBodyCellLocatorByRowConditions should include conditions when no matching row found", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.getBodyCellLocatorByRowConditions({ "First name": "NonExistent" }, "Last name");
		}).rejects.toThrow(/No row found matching conditions: {"First name":"NonExistent"}/);

		await expect(async () => {
			await table.getBodyCellLocatorByRowConditions({ "First name": "NonExistent" }, "Last name");
		}).rejects.toThrow(/Target header: "Last name"/);

		await expect(async () => {
			await table.getBodyCellLocatorByRowConditions({ "First name": "NonExistent" }, "Last name");
		}).rejects.toThrow(/Searched 2 rows/);

		await expect(async () => {
			await table.getBodyCellLocatorByRowConditions({ "First name": "NonExistent" }, "Last name");
		}).rejects.toThrow(/Body row locator:.*table.*tbody.*tr/);
	});

	test("getAllBodyCellLocatorsByHeaderName should include available headers when not found", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.getAllBodyCellLocatorsByHeaderName("Invalid Header");
		}).rejects.toThrow(/Header "Invalid Header" not found/);

		await expect(async () => {
			await table.getAllBodyCellLocatorsByHeaderName("Invalid Header");
		}).rejects.toThrow(/Available headers: \[First name, Last name, Date of birth\]/);

		await expect(async () => {
			await table.getAllBodyCellLocatorsByHeaderName("Invalid Header");
		}).rejects.toThrow(/Header row locator:.*table.*thead.*tr/);
	});

	test("getAllBodyCellLocatorsByHeaderIndex should include column count when index out of bounds", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.getAllBodyCellLocatorsByHeaderIndex(999);
		}).rejects.toThrow(/Header index 999 out of bounds/);

		await expect(async () => {
			await table.getAllBodyCellLocatorsByHeaderIndex(999);
		}).rejects.toThrow(/Table has 3 columns/);

		await expect(async () => {
			await table.getAllBodyCellLocatorsByHeaderIndex(999);
		}).rejects.toThrow(/Header row locator:.*table.*thead.*tr/);
	});

	test("getAllBodyCellLocatorsByHeaderIndex should throw error for negative index", async ({ page }) => {
		await page.goto(Route.SimpleTable);

		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.getAllBodyCellLocatorsByHeaderIndex(-1);
		}).rejects.toThrow(/Header index -1 out of bounds/);
	});
});

test.describe("PlaywrightTable - waitForStable validation", () => {
	test("should throw error when checkInterval is zero", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForStable({ checkInterval: 0 });
		}).rejects.toThrowError("checkInterval must be positive, got: 0ms");
	});

	test("should throw error when checkInterval is negative", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForStable({ checkInterval: -100 });
		}).rejects.toThrowError("checkInterval must be positive, got: -100ms");
	});

	test("should throw error when stabilityDuration is zero", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForStable({ stabilityDuration: 0 });
		}).rejects.toThrowError("stabilityDuration must be positive, got: 0ms");
	});

	test("should throw error when stabilityDuration is negative", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForStable({ stabilityDuration: -500 });
		}).rejects.toThrowError("stabilityDuration must be positive, got: -500ms");
	});

	test("should throw error when timeout is zero", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForStable({ timeout: 0 });
		}).rejects.toThrowError("timeout must be positive, got: 0ms");
	});

	test("should throw error when timeout is negative", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForStable({ timeout: -5000 });
		}).rejects.toThrowError("timeout must be positive, got: -5000ms");
	});

	test("should throw error when checkInterval is greater than half of stabilityDuration", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForStable({ checkInterval: 1000, stabilityDuration: 1000 });
		}).rejects.toThrowError(
			"checkInterval (1000ms) cannot be greater than half of stabilityDuration (500ms). " +
				"At least 2 checks are required during the stability period to ensure reliable detection."
		);
	});

	test("should throw error when stabilityDuration is greater than timeout", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForStable({ stabilityDuration: 10000, timeout: 5000 });
		}).rejects.toThrowError(
			"stabilityDuration (10000ms) must be less than timeout (5000ms). " +
				"The timeout must allow time for both table changes and stabilization."
		);
	});

	test("should throw error when stabilityDuration equals timeout", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.waitForStable({ stabilityDuration: 5000, timeout: 5000 });
		}).rejects.toThrowError(
			"stabilityDuration (5000ms) must be less than timeout (5000ms). " +
				"The timeout must allow time for both table changes and stabilization."
		);
	});

	test("should throw error when timeout is too short for one stability cycle", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// checkInterval (100) + stabilityDuration (500) = 600ms minimum, but timeout is only 550ms
		// checkInterval (100) is valid as it's ≤ stabilityDuration/2 (250)
		// stabilityDuration (500) < timeout (550), so that check passes too
		await expect(async () => {
			await table.waitForStable({ checkInterval: 100, stabilityDuration: 500, timeout: 550 });
		}).rejects.toThrowError(
			"timeout (550ms) is too short. Minimum required: 600ms " +
				"(checkInterval 100ms + stabilityDuration 500ms). " +
				"The timeout must allow at least one check plus full stabilization period."
		);
	});

	test("should accept valid configuration with checkInterval at half of stabilityDuration", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Should not throw - checkInterval can be exactly half of stabilityDuration
		await table.waitForStable({ checkInterval: 100, stabilityDuration: 200, timeout: 5000 });
	});

	test("should accept valid configuration when timeout is greater than stabilityDuration", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Should not throw validation error - timeout > stabilityDuration is valid
		await table.waitForStable({ checkInterval: 50, stabilityDuration: 200, timeout: 5000 });
	});
});
