import test, { expect } from "@playwright/test";
import { CellContentType } from "src";
import { PlaywrightTable } from "src/playwright-table";
import { TableBody } from "src/table-body";

import { Route } from "./demo-html/routes";

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

	test("getMainHeaderRow supports header sanitization options", async ({ page }) => {
		await page.setContent(`
			<div role="treegrid">
				<div data-kind="header-group">
					<div role="row">
						<div role="columnheader">Account name<span>&#xEE68;</span></div>
						<div role="columnheader">Phone
						<span>number</span></div>
					</div>
				</div>
				<div data-kind="body-group">
					<div role="row">
						<div role="gridcell">Mr Test</div>
						<div role="gridcell">+31612345678</div>
					</div>
				</div>
			</div>
		`);

		const table = new PlaywrightTable(page.locator("[role='treegrid']"), {
			header: {
				setMainHeaderRow: 0,
				rowSelector: "[data-kind='header-group'] > div[role='row']",
				columnSelector: "div[role='columnheader']",
			},
			row: {
				rowSelector: "[data-kind='body-group'] > div[role='row']",
				columnSelector: "div[role='gridcell']",
			},
		});

		const mainHeader = await table.getMainHeaderRow({
			normalizeWhitespace: true,
			stripIconGlyphs: true,
		});

		expect(mainHeader).toEqual(["Account name", "Phone number"]);
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

		test("accepts full TableOptions in getBodyRows", async ({ page }) => {
			await page.setContent(`
				<div role="treegrid">
					<div data-kind="header-group">
						<div role="row">
							<div role="columnheader">Account name<span>&#xEE68;</span></div>
							<div role="columnheader">Phone
							<span>number</span></div>
						</div>
					</div>
					<div data-kind="body-group">
						<div role="row">
							<div role="gridcell">Mr Test</div>
							<div role="gridcell">+31612345678</div>
						</div>
					</div>
				</div>
			`);

			const table = new PlaywrightTable(page.locator("[role='treegrid']"), {
				header: {
					setMainHeaderRow: 0,
					rowSelector: "[data-kind='header-group'] > div[role='row']",
					columnSelector: "div[role='columnheader']",
				},
				row: {
					rowSelector: "[data-kind='body-group'] > div[role='row']",
					columnSelector: "div[role='gridcell']",
				},
			});

			const rows = await table.getBodyRows({
				bodyRowOptions: {
					cellContentType: CellContentType.InnerText,
				},
				headerRowOptions: {
					normalizeWhitespace: true,
					stripIconGlyphs: true,
				},
			});

			expect(rows).toEqual([["Mr Test", "+31612345678"]]);
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

		test("getJson with combined rowspan and colspan handles correctly", async ({ page }) => {
			await page.goto(Route.CombinedSpanTable);

			const table = new PlaywrightTable(page.locator("table"));
			const json = await table.getJson();

			expect(json).toEqual([
				{
					Region: "North",
					Q1: "Combined N+S Q1-Q2",
					Q2: "Combined N+S Q1-Q2",
					Q3: "300",
					Q4: "400",
				},
				{
					Region: "South",
					Q1: "Combined N+S Q1-Q2",
					Q2: "Combined N+S Q1-Q2",
					Q3: "350",
					Q4: "450",
				},
				{
					Region: "East",
					Q1: "500",
					Q2: "600",
					Q3: "700",
					Q4: "800",
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

		test("getJson sanitizes header keys when requested", async ({ page }) => {
			await page.setContent(`
				<div role="treegrid">
					<div data-kind="header-group">
						<div role="row">
							<div role="columnheader">Account name<span>&#xEE68;</span></div>
							<div role="columnheader">Phone
							<span>number</span></div>
						</div>
					</div>
					<div data-kind="body-group">
						<div role="row">
							<div role="gridcell">Mr Test</div>
							<div role="gridcell">+31612345678</div>
						</div>
					</div>
				</div>
			`);

			const table = new PlaywrightTable(page.locator("[role='treegrid']"), {
				header: {
					setMainHeaderRow: 0,
					rowSelector: "[data-kind='header-group'] > div[role='row']",
					columnSelector: "div[role='columnheader']",
				},
				row: {
					rowSelector: "[data-kind='body-group'] > div[role='row']",
					columnSelector: "div[role='gridcell']",
				},
			});

			const json = await table.getJson({
				headerRowOptions: {
					normalizeWhitespace: true,
					stripIconGlyphs: true,
				},
			});

			expect(json).toEqual([
				{
					"Account name": "Mr Test",
					"Phone number": "+31612345678",
				},
			]);
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

	test("getBodyCellLocatorByRowConditions supports sanitized header names via TableOptions", async ({ page }) => {
		await page.setContent(`
			<div role="treegrid">
				<div data-kind="header-group">
					<div role="row">
						<div role="columnheader">Account name<span>&#xEE68;</span></div>
						<div role="columnheader">Phone
						<span>number</span></div>
					</div>
				</div>
				<div data-kind="body-group">
					<div role="row">
						<div role="gridcell">Mr Test</div>
						<div role="gridcell">+31612345678</div>
					</div>
				</div>
			</div>
		`);

		const table = new PlaywrightTable(page.locator("[role='treegrid']"), {
			header: {
				setMainHeaderRow: 0,
				rowSelector: "[data-kind='header-group'] > div[role='row']",
				columnSelector: "div[role='columnheader']",
			},
			row: {
				rowSelector: "[data-kind='body-group'] > div[role='row']",
				columnSelector: "div[role='gridcell']",
			},
		});

		const locator = await table.getBodyCellLocatorByRowConditions({ "Account name": "Mr Test" }, "Phone number", {
			headerRowOptions: {
				normalizeWhitespace: true,
				stripIconGlyphs: true,
			},
		});

		await expect(locator).toHaveText("+31612345678");
	});

	test("getBodyCellLocatorByRowConditions should work with tuple syntax", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Using tuple syntax for single condition
		const cellLocator = await table.getBodyCellLocatorByRowConditions(["First name", "Ronald"], "Last name");

		await expect(cellLocator).toHaveText("Veth");
	});

	test("getBodyCellLocatorByRowConditions should work with object syntax for single condition", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Using object syntax for single condition
		const cellLocator = await table.getBodyCellLocatorByRowConditions({ "First name": "Ronald" }, "Last name");

		await expect(cellLocator).toHaveText("Veth");
	});

	test("getBodyCellLocatorByRowConditions should work with multiple conditions", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Using object syntax for multiple conditions
		const cellLocator = await table.getBodyCellLocatorByRowConditions(
			{ "First name": "Logan", "Last name": "Deacon" },
			"Date of birth"
		);

		await expect(cellLocator).toHaveText("01-10-2002");
	});

	test("getBodyCellLocatorByRowConditions tuple syntax should throw error for non-existent header", async ({
		page,
	}) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.getBodyCellLocatorByRowConditions(["NonExistent", "value"], "Last name");
		}).rejects.toThrow(/Header "NonExistent" not found/);
	});

	test("getBodyCellLocatorByRowConditions tuple syntax should throw error for non-matching value", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.getBodyCellLocatorByRowConditions(["First name", "NonExistent"], "Last name");
		}).rejects.toThrow(/No row found matching conditions/);
	});

	test("getBodyCellLocatorByRowConditions tuple and object syntax should return same cell", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Tuple syntax
		const cell1 = await table.getBodyCellLocatorByRowConditions(["First name", "Ronald"], "Date of birth");

		// Object syntax
		const cell2 = await table.getBodyCellLocatorByRowConditions({ "First name": "Ronald" }, "Date of birth");

		// Both should return the same cell
		await expect(cell1).toHaveText("22-12-1987");
		await expect(cell2).toHaveText("22-12-1987");
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

	test("warns when header and body selectors are identical", async ({ page }) => {
		await page.goto(Route.DivTable);

		const warnings: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warnings.push(args.map(value => String(value)).join(" "));
		};

		try {
			new PlaywrightTable(page.locator(".divTable"), {
				header: { rowSelector: ".divTableRow", columnSelector: ".divTableHead" },
				row: { rowSelector: ".divTableRow", columnSelector: ".divTableCell" },
			});
		} finally {
			console.warn = originalWarn;
		}

		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("header.rowSelector and row.rowSelector are identical");
	});
});

test.describe("getDistinctColumnValues", () => {
	test("should return sorted distinct values from a column", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		const firstNames = await table.getDistinctColumnValues("First name");

		expect(firstNames).toEqual(["Logan", "Ronald"]);
	});

	test("should exclude empty values", async ({ page }) => {
		await page.goto(Route.EmptyBodyRowsTable);
		const table = new PlaywrightTable(page.locator("table"));

		const values = await table.getDistinctColumnValues("Rows");

		// Should return empty array since all values are empty or whitespace
		expect(values).toEqual([]);
	});

	test("should return unique values only", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Add duplicate rows
		await page.evaluate(() => {
			const tbody = document.querySelector("tbody");
			if (tbody) {
				const newRow = tbody.insertRow();
				newRow.insertCell(0).textContent = "Ronald";
				newRow.insertCell(1).textContent = "Smith";
				newRow.insertCell(2).textContent = "01-01-1990";
			}
		});

		const firstNames = await table.getDistinctColumnValues("First name");

		// Should have only 2 unique first names: Logan and Ronald
		expect(firstNames).toEqual(["Logan", "Ronald"]);
	});

	test("should throw error when header not found", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.getDistinctColumnValues("NonExistentHeader");
		}).rejects.toThrow(/Header "NonExistentHeader" not found/);
	});

	test("should include available headers in error message", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		await expect(async () => {
			await table.getDistinctColumnValues("NonExistent");
		}).rejects.toThrow(/Available headers/);
	});

	test("should work with different column types", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		const lastNames = await table.getDistinctColumnValues("Last name");
		const dates = await table.getDistinctColumnValues("Date of birth");

		expect(lastNames).toEqual(["Deacon", "Veth"]);
		expect(dates).toHaveLength(2);
	});

	test("should trim whitespace from values", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Add row with whitespace
		await page.evaluate(() => {
			const tbody = document.querySelector("tbody");
			if (tbody) {
				const newRow = tbody.insertRow();
				newRow.insertCell(0).textContent = "  Ronald  ";
				newRow.insertCell(1).textContent = "Test";
				newRow.insertCell(2).textContent = "01-01-2000";
			}
		});

		const firstNames = await table.getDistinctColumnValues("First name");

		// Should have only 2 values, with whitespace trimmed
		expect(firstNames).toEqual(["Logan", "Ronald"]);
	});

	test("should return empty array when all values are empty", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Clear all first names
		await page.evaluate(() => {
			const cells = document.querySelectorAll("tbody tr td:first-child");
			cells.forEach(cell => (cell.textContent = ""));
		});

		const firstNames = await table.getDistinctColumnValues("First name");

		expect(firstNames).toEqual([]);
	});

	test("should work with single value in column", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = new PlaywrightTable(page.locator("table"));

		// Set all first names to same value
		await page.evaluate(() => {
			const cells = document.querySelectorAll("tbody tr td:first-child");
			cells.forEach(cell => (cell.textContent = "John"));
		});

		const firstNames = await table.getDistinctColumnValues("First name");

		expect(firstNames).toEqual(["John"]);
	});
});
