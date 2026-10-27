import { Page } from "@playwright/test";
import { defineTable, expect, presets, TableLocator, test } from "src";

import { GridRoute, Route } from "./demo-html/routes";

async function errorMessage(action: () => Promise<unknown>): Promise<string> {
	try {
		await action();
	} catch (error) {
		// Strip ANSI colors from matcher messages
		const ansiColor = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
		return (error instanceof Error ? error.message : String(error)).replace(ansiColor, "");
	}
	throw new Error("Expected the action to fail");
}

/** The numbers from 1 to `count`, as strings. */
function ids(count: number): string[] {
	return Array.from({ length: count }, (_value, index) => String(index + 1));
}

test.describe("AG Grid", () => {
	async function openCars(page: Page): Promise<TableLocator<"Id" | "Make" | "Model" | "Price">> {
		await page.goto(GridRoute.AgGrid);
		const cars = defineTable(page.locator("#cars"), { ...presets.agGrid(), headers: ["Id", "Make", "Model", "Price"] });
		await expect(cars).toHaveRow({ Id: "1" });
		return cars;
	}

	async function openPaged(page: Page): Promise<TableLocator<"Id" | "Make" | "Model">> {
		await page.goto(GridRoute.AgGrid);
		const paged = defineTable(page.locator("#paged"), { ...presets.agGrid(), headers: ["Id", "Make", "Model"] });
		await expect(paged).toHaveRow({ Id: "1" });
		return paged;
	}

	test("reads the headers and the rows in view", async ({ page }) => {
		const cars = await openCars(page);

		// The selection column has no header text
		expect(await cars.headerKeys()).toEqual(["Id", "{{Empty}}", "Make", "Model", "Price"]);
		await expect(cars.row({ Id: "2" }).cell("Make")).toHaveText("Ford");
		await expect(
			cars
				.row({ Price: { gt: 10_400 }, Make: "Porsche" })
				.first()
				.cell("Id")
		).toHaveText("3");
	});

	test("findRow scrolls to a row that is not rendered", async ({ page }) => {
		// Scrolls a grid of 200 rows
		test.slow();
		const cars = await openCars(page);
		await expect(cars.row({ Model: "Model 150" }).locator).toHaveCount(0);

		const row = await cars.findRow({ Model: "Model 150" });
		await expect(row.cell("Price")).toHaveText("€ 47,250");
		await expect(row.locator).toBeVisible();
	});

	test("toJson with allRows reads every row, in order", async ({ page }) => {
		// Reads every row by scrolling, step by step
		test.slow();
		const cars = await openCars(page);

		const rows = await cars.toJson({ allRows: true, columns: ["Id", "Model", "Price"], parse: { Price: "number" } });
		expect(rows).toHaveLength(200);
		expect(rows.map(row => row.Id)).toEqual(ids(200));
		expect(rows[199]).toEqual({ Id: "200", Model: "Model 200", Price: 59_750 });
	});

	test("the total row count comes from aria-rowcount", async ({ page }) => {
		const cars = await openCars(page);

		expect(await cars.totalRowCount()).toBe(200);
		await expect(cars).toHaveTotalRowCount(200);
		await expect(cars).not.toHaveTotalRowCount(17);

		const message = await errorMessage(() => expect(cars).toHaveTotalRowCount(100, { timeout: 1_000 }));
		expect(message).toContain("Expected: 100 body rows in total");
		expect(message).toContain("Received: 200 (aria-rowcount 201, minus 1 other row)");
	});

	test("select and deselect a row with its checkbox", async ({ page }) => {
		const cars = await openCars(page);
		const row = cars.row({ Id: "3" });

		await row.select();
		await expect(row).toBeSelected();
		expect(await row.isSelected()).toBe(true);
		await expect(cars.row({ Id: "2" })).not.toBeSelected();
		await row.deselect();
		await expect(row).not.toBeSelected();
	});

	test("fill edits a cell in place", async ({ page }) => {
		const cars = await openCars(page);

		await cars.row({ Id: "2" }).fill({ Model: "Edited" });
		await expect(cars.row({ Id: "2" }).cell("Model")).toHaveText("Edited");
	});

	test("paginated grid: findRow, allRows and the total go over every page", async ({ page }) => {
		// Reads every row by scrolling, step by step
		test.slow();
		const paged = await openPaged(page);

		const row = await paged.findRow({ Id: "42" });
		await expect(row.cell("Model")).toHaveText("Model 42");

		// Starts again from the first page
		const rows = await paged.toJson({ allRows: true, columns: ["Id"] });
		expect(rows.map(read => read.Id)).toEqual(ids(45));
		await expect(paged).toHaveTotalRowCount(45);
	});

	test("findRow fails with the pages it searched", async ({ page }) => {
		const paged = await openPaged(page);

		const message = await errorMessage(() => paged.findRow({ Id: "999" }));
		expect(message).toContain('TableLocator.findRow() found no row matching { "Id": "999" } on 3 pages');
	});

	test("waitForStable waits for the loading overlay of the preset", async ({ page }) => {
		const paged = await openPaged(page);
		await page.evaluate(() => {
			(
				window as unknown as { pagedGrid: { setGridOption(name: string, value: unknown): void } }
			).pagedGrid.setGridOption("loading", true);
		});

		const message = await errorMessage(() => paged.waitForStable({ quiet: 100, timeout: 500 }));
		expect(message).toContain("the loading indicator is still visible");

		await page.evaluate(() => {
			setTimeout(() => {
				(
					window as unknown as { pagedGrid: { setGridOption(name: string, value: unknown): void } }
				).pagedGrid.setGridOption("loading", false);
			}, 300);
		});
		await paged.waitForStable({ quiet: 100 });
		await expect(page.locator("#paged .ag-overlay-loading-wrapper")).toBeHidden();
	});
});

test.describe("MUI X Data Grid", () => {
	async function openUsers(page: Page): Promise<TableLocator<"ID" | "Name" | "Age">> {
		await page.goto(GridRoute.MuiDataGrid);
		return defineTable(page.getByRole("grid"), { ...presets.muiDataGrid(), headers: ["ID", "Name", "Age"] });
	}

	test("reads headers without fillers and cells without empty cells", async ({ page }) => {
		const users = await openUsers(page);

		expect(await users.headerKeys()).toEqual(["{{Empty}}", "ID", "Name", "Age"]);
		await expect(users.row({ ID: "2" })).toHaveCells({ Name: "User 2", Age: "21" });
	});

	test("findRow goes through pages and scrolls each page", async ({ page }) => {
		const users = await openUsers(page);

		const row = await users.findRow({ Name: "User 58" });
		await expect(row.cell("Age")).toHaveText("37");
	});

	test("toJson with allRows and the total row count", async ({ page }) => {
		// Reads every row by scrolling, step by step
		test.slow();
		const users = await openUsers(page);

		const rows = await users.toJson({ allRows: true, columns: ["ID", "Age"], parse: { Age: "number" } });
		expect(rows.map(row => row.ID)).toEqual(ids(60));
		expect(rows[59]).toEqual({ ID: "60", Age: 39 });
		await expect(users).toHaveTotalRowCount(60);
	});

	test("selects a row with its checkbox", async ({ page }) => {
		const users = await openUsers(page);

		await users.row({ ID: "2" }).select();
		await expect(users.row({ ID: "2" })).toBeSelected();
	});

	test("waitForStable waits for the loading overlay", async ({ page }) => {
		const users = await openUsers(page);
		await page.locator("#load").click();

		await users.waitForStable({ quiet: 100 });
		await expect(page.getByRole("progressbar")).toBeHidden();
	});
});

test.describe("TanStack Virtual", () => {
	async function openPeople(page: Page): Promise<TableLocator<"Id" | "First name" | "Visits">> {
		await page.goto(GridRoute.TanstackVirtual);
		return defineTable(page.locator("table"), {
			...presets.tanstackVirtual({ container: page.locator(".scroll-container") }),
			headers: ["Id", "First name", "Visits"],
		});
	}

	test("allRows orders rows by data-index, not by DOM order", async ({ page }) => {
		// Reads every row by scrolling, step by step
		test.slow();
		const people = await openPeople(page);

		const rows = await people.toJson({ allRows: true, columns: ["Id"] });
		expect(rows.map(row => row.Id)).toEqual(ids(150));
	});

	test("findRow scrolls to a row", async ({ page }) => {
		const people = await openPeople(page);

		const row = await people.findRow({ "First name": "Person 120" });
		await expect(row.cell("Visits")).toHaveText("357");
	});

	test("without aria-rowcount, the total is counted by scrolling", async ({ page }) => {
		// Reads every row by scrolling, step by step
		test.slow();
		const people = await openPeople(page);

		await expect(people).toHaveTotalRowCount(150, { timeout: 20_000 });
	});
});

test.describe("Angular Material", () => {
	async function openOrders(page: Page): Promise<TableLocator<"Id" | "Product" | "Amount">> {
		await page.goto(GridRoute.AngularMaterial);
		return defineTable(page.locator("#orders"), {
			...presets.angularMaterial({ paginator: page.locator("mat-paginator") }),
			headers: ["Id", "Product", "Amount"],
		});
	}

	test("findRow, allRows and the total go over every page", async ({ page }) => {
		// Reads every row by scrolling, step by step
		test.slow();
		const orders = await openOrders(page);

		const row = await orders.findRow({ Id: "12" });
		await expect(row.cell("Amount")).toHaveText("$120");
		const rows = await orders.toJson({ allRows: true, columns: ["Id"] });
		expect(rows.map(read => read.Id)).toEqual(ids(12));
		expect(await orders.totalRowCount()).toBe(12);
	});

	test("footer rows have typed cells and are not body rows", async ({ page }) => {
		const orders = await openOrders(page);

		await expect(orders.footer.cell("Amount")).toHaveText("$780");
		await expect(orders.footer.cell(0)).toHaveText("Total");
		await expect(orders).toHaveRowCount(5);
		await expect(orders).not.toHaveRow({ Id: "Total" });
	});

	test("the no data row is not a body row", async ({ page }) => {
		const orders = await openOrders(page);
		await page.getByLabel("Filter").fill("xyz");

		await expect(orders).toHaveRows([]);
		await expect(orders.footer.cell("Amount")).toHaveText("$0");

		// As in the Angular Material docs: <tr class="mat-row" *matNoDataRow>
		await page.locator(".mat-mdc-no-data-row").evaluate(row => row.classList.add("mat-row", "mat-mdc-row"));
		await expect(orders).toHaveRows([]);
	});
});

test.describe("row interactions", () => {
	async function openFiles(page: Page): Promise<TableLocator<"Name" | "Size">> {
		await page.goto(GridRoute.Interactive);
		return defineTable(page.locator("#files"), { aria: true, headers: ["Name", "Size"] });
	}

	async function openPeople(page: Page): Promise<TableLocator<"Name" | "Email" | "Role" | "Active" | "Notes">> {
		await page.goto(GridRoute.Interactive);
		return defineTable(page.locator("#people"), { headers: ["Name", "Email", "Role", "Active", "Notes"] });
	}

	test("expand and collapse with the toggle button", async ({ page }) => {
		const files = await openFiles(page);
		const src = files.row({ Name: "src" });

		expect(await src.isExpanded()).toBe(false);
		await expect(src).not.toBeExpanded();
		await src.expand();
		await expect(src).toBeExpanded();
		await expect(files.row({ Name: "index.ts" }).locator).toBeVisible();
		expect(await files.row({ Name: "index.ts" }).level()).toBe(2);
		expect(await src.level()).toBe(1);
		await src.expand(); // already expanded
		await src.collapse();
		await expect(files.row({ Name: "index.ts" }).locator).toBeHidden();
	});

	test("expand and collapse with the keyboard when there is no toggle", async ({ page }) => {
		const files = await openFiles(page);
		const docs = files.row({ Name: "docs" });

		await docs.expand();
		await expect(files.row({ Name: "README.md" }).locator).toBeVisible();
		await docs.collapse();
		await expect(docs).not.toBeExpanded();
	});

	test("a row that cannot expand", async ({ page }) => {
		const files = await openFiles(page);
		const leaf = files.row({ Name: "package.json" });

		expect(await leaf.isExpanded()).toBeNull();
		await expect(leaf.expand()).rejects.toThrow("TableRow.expand(): the row has no aria-expanded");
		const message = await errorMessage(() => expect(leaf).toBeExpanded({ timeout: 1_000 }));
		expect(message).toContain("Received: a row that cannot be expanded");
		const negated = await errorMessage(() => expect(leaf).not.toBeExpanded({ timeout: 1_000 }));
		expect(negated).toContain("Received: a row that cannot be expanded");
	});

	test("select and deselect a row without a checkbox by clicking it", async ({ page }) => {
		const files = await openFiles(page);
		const row = files.row({ Name: "package.json" });

		await row.select();
		await expect(row).toBeSelected();
		await row.deselect();
		await expect(row).not.toBeSelected();
		const message = await errorMessage(() => expect(row).toBeSelected({ timeout: 1_000 }));
		expect(message).toContain("Expected: selected");
		expect(message).toContain("Received: not selected");
	});

	test("fill sets inputs, selects, checkboxes and cells edited in place", async ({ page }) => {
		const people = await openPeople(page);
		const jane = people.row({ Name: "Jane" });

		await jane.fill({ Email: "jane@test.org", Role: "Admin", Active: true, Notes: "Updated" });
		await expect(jane.cell("Email").locator("input")).toHaveValue("jane@test.org");
		await expect(jane.cell("Role").locator("select")).toHaveValue("Admin");
		await expect(jane.cell("Active").locator("input")).toBeChecked();
		await expect(jane).toHaveCells({ Notes: "Updated", Role: "Admin" });
		await expect(people.footer.cell("Active")).toHaveText("2 active");
	});

	test("fill fails on a cell without an input", async ({ page }) => {
		const people = await openPeople(page);

		const message = await errorMessage(() => people.row({ Name: "John" }).fill({ Name: "Joe" }, { timeout: 1_000 }));
		expect(message).toContain('TableRow.fill(): the cell under "Name" has no input, also not after a double-click.');
	});

	test("footer of an HTML table", async ({ page }) => {
		const people = await openPeople(page);

		await expect(people.footer.cell("Name")).toHaveText("Count");
		await expect(people.footer.locator).toHaveCount(1);
		await expect(people).toHaveRowCount(2);
	});
});

test.describe("navigation limits", () => {
	/** The Angular Material orders: 12 rows, 5 per page, so 3 pages. */
	async function openOrders(page: Page, maxPages: number): Promise<TableLocator<"Id" | "Product" | "Amount">> {
		await page.goto(GridRoute.AngularMaterial);
		const paginator = page.locator("mat-paginator");
		return defineTable(page.locator("#orders"), {
			...presets.angularMaterial(),
			paginate: {
				next: paginator.getByRole("button", { name: "Next page", exact: true }),
				first: paginator.getByRole("button", { name: "First page", exact: true }),
				maxPages,
			},
			headers: ["Id", "Product", "Amount"],
		});
	}

	/** The TanStack Virtual people: 150 rows in a container that shows a few at a time. */
	async function openPeople(
		page: Page,
		scroll: { maxSteps?: number; settle?: number }
	): Promise<TableLocator<"Id" | "First name" | "Visits">> {
		await page.goto(GridRoute.TanstackVirtual);
		return defineTable(page.locator("table"), {
			scroll: { container: page.locator(".scroll-container"), rowKey: "data-index", ...scroll },
			headers: ["Id", "First name", "Visits"],
		});
	}

	test("maxPages reads only the first pages", async ({ page }) => {
		// Goes through the pages five times
		test.slow();
		const orders = await openOrders(page, 2);

		const rows = await orders.toJson({ allRows: true, columns: ["Id"] });
		expect(rows.map(row => row.Id)).toEqual(ids(10));
		expect(await orders.totalRowCount()).toBe(10);
		await expect(orders).toHaveTotalRowCount(10);

		const row = await orders.findRow({ Id: "7" });
		await expect(row.cell("Amount")).toHaveText("$70");
		expect(await errorMessage(() => orders.findRow({ Id: "12" }))).toContain(
			'TableLocator.findRow() found no row matching { "Id": "12" } on 2 pages (paginate.maxPages is 2).'
		);
	});

	test("a maxPages of the number of pages or more reads every row", async ({ page }) => {
		for (const maxPages of [3, 10]) {
			const orders = await openOrders(page, maxPages);

			const rows = await orders.toJson({ allRows: true, columns: ["Id"] });
			expect(rows.map(row => row.Id)).toEqual(ids(12));
		}
	});

	test("maxSteps reads only the first scroll steps", async ({ page }) => {
		const people = await openPeople(page, { maxSteps: 2 });

		const rows = await people.toJson({ allRows: true, columns: ["Id"] });
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.length).toBeLessThan(150);
		expect(rows.map(row => row.Id)).toEqual(ids(rows.length));
		expect(await errorMessage(() => people.findRow({ "First name": "Person 150" }))).toContain(
			'found no row matching { "First name": "Person 150" } (2 scroll steps; scroll.maxSteps is 2).'
		);
	});

	test("limits must be positive integers", ({ page }) => {
		const next = page.getByRole("button", { name: "Next" });

		expect(() => defineTable(page.locator("table"), { paginate: { next, maxPages: 0 } })).toThrow(
			"paginate.maxPages must be a positive integer, got: 0"
		);
		expect(() => defineTable(page.locator("table"), { scroll: { maxSteps: 1.5 } })).toThrow(
			"scroll.maxSteps must be a positive integer, got: 1.5"
		);
	});

	test("running out of time is an error that says how far it got", async ({ page }) => {
		// Each scroll waits a second for the table to settle, far longer than the timeout
		const people = await openPeople(page, { settle: 1_000 });

		const message = await errorMessage(() => people.toJson({ allRows: true, timeout: 500 }));
		expect(message).toMatch(
			/TableLocator\.toJson\(\{ allRows: true \}\) timed out after 500ms before reading every row; \d+ rows were read, on 1 page\. Pass a larger timeout\./
		);
		expect(await errorMessage(() => people.findRow({ "First name": "Person 150" }, { timeout: 500 }))).toContain(
			"and timed out before the end of the table. Pass a larger timeout to search further."
		);
	});
});

test.describe("navigation without a grid", () => {
	test("findRow without paginate or scroll waits like a locator", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = defineTable(page.locator("#DynamicTable"), { headers: ["Header 1", "Header 2", "Header 3"] });

		const row = await table.findRow({ "Header 1": "Row 3 Col 1" });
		await expect(row.cell("Header 3")).toHaveText("Row 3 Col 3");
		const message = await errorMessage(() => table.findRow({ "Header 1": "Nope" }, { timeout: 1_000 }));
		expect(message).toContain('TableLocator.findRow() found no row matching { "Header 1": "Nope" }.');
	});

	test("totalRowCount of a plain table is its body rows", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = defineTable(page.locator("table"));

		expect(await table.totalRowCount()).toBe(await table.rows.locator.count());
	});
});

test.describe("debugging", () => {
	test("format prints the rows as a text table", async ({ page }) => {
		await page.goto(GridRoute.Interactive);
		const people = defineTable(page.locator("#people"), { headers: ["Name", "Email", "Role", "Active", "Notes"] });

		expect(await people.format({ columns: ["Name", "Role", "Notes"] })).toBe(
			["  # | Name | Role   | Notes", "  0 | John | Viewer | First", "  1 | Jane | Editor | Second", ""].join("\n")
		);
	});

	test("a failing table matcher attaches the table to the report", async ({ page }) => {
		await page.goto(GridRoute.Interactive);
		const people = defineTable(page.locator("#people"), { headers: ["Name", "Email", "Role", "Active", "Notes"] });

		await errorMessage(() => expect(people).toHaveRow({ Name: "Ghost" }, { timeout: 1_000 }));
		await errorMessage(() => expect(people).toHaveRowCount(5, { timeout: 1_000 }));
		const attachments = test.info().attachments.filter(attachment => attachment.name === "table locator('#people')");
		// Once per test and table
		expect(attachments).toHaveLength(1);
		expect(attachments[0]?.contentType).toBe("text/markdown");
		const body = attachments[0]?.body?.toString() ?? "";
		expect(body).toContain("| # | Name | Email | Role | Active | Notes |");
		expect(body).toContain("| 1 | Jane |  | Editor |  | Second |");
	});
});
