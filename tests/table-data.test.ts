import { Page } from "@playwright/test";
import { defineTable, expect, RowWhere, TableLocator, test } from "src";
import { parseNumber } from "src/table-selector-engine";

import { Route } from "./demo-html/routes";

const ordersTable = `
	<table id="orders">
		<thead><tr><th>Customer</th><th>Status</th><th>Total</th><th>Placed</th></tr></thead>
		<tbody>
			<tr><td>John</td><td>Active</td><td>€ 1,200.50</td><td>2026-01-15</td></tr>
			<tr><td>Jane</td><td>Inactive</td><td>€ 80</td><td>2026-02-01</td></tr>
			<tr><td>Joe</td><td>Active</td><td>€ 15.25</td><td></td></tr>
		</tbody>
	</table>
`;

type Orders = TableLocator<"Customer" | "Status" | "Total" | "Placed">;

async function openOrders(page: Page): Promise<Orders> {
	await page.setContent(ordersTable);
	return defineTable(page.locator("#orders"), { headers: ["Customer", "Status", "Total", "Placed"] });
}

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

test.describe("numbers", () => {
	test("parseNumber reads the one number in a text", () => {
		expect(parseNumber("€ 1,200.50", ".")).toBe(1200.5);
		expect(parseNumber("1 234", ".")).toBe(1234);
		expect(parseNumber("1'234.5", ".")).toBe(1234.5);
		expect(parseNumber("1 234,5 kg", ",")).toBe(1234.5);
		expect(parseNumber("1.234,5", ",")).toBe(1234.5);
		expect(parseNumber(".5", ".")).toBe(0.5);
		expect(parseNumber("-3 %", ".")).toBe(-3);
		expect(parseNumber("−€ 5", ".")).toBe(-5);
		expect(parseNumber("€ -5", ".")).toBe(-5);
		expect(parseNumber("Item-5", ".")).toBe(5);
		expect(parseNumber("42", ",")).toBe(42);
	});

	test("parseNumber rejects texts without exactly one number", () => {
		expect(parseNumber("", ".")).toBeNaN();
		expect(parseNumber("n/a", ".")).toBeNaN();
		expect(parseNumber("12:30", ".")).toBeNaN();
		expect(parseNumber("5 of 10", ".")).toBeNaN();
		expect(parseNumber("2026-01-15", ".")).toBeNaN();
		// Ambiguous with the other separator
		expect(parseNumber("1.5", ",")).toBeNaN();
		expect(parseNumber("1234,5", ".")).toBeNaN();
	});

	test("numeric conditions compare the number in a cell", async ({ page }) => {
		const orders = await openOrders(page);

		await expect(orders.row({ Total: { gt: 1000 } }).cell("Customer")).toHaveText("John");
		await expect(orders.row({ Total: { lt: 50 } }).cell("Customer")).toHaveText("Joe");
		await expect(orders.row({ Total: { between: [80, 80] } }).cell("Customer")).toHaveText("Jane");
		await expect(orders.row({ Total: { gte: 15.25 } }).locator).toHaveCount(3);
		await expect(orders.row({ Total: { between: [10, 100] }, Status: "Active" }).cell("Customer")).toHaveText("Joe");
		await expect(orders).toHaveRow({ Total: { lte: 80 }, Customer: "Jane" });
	});

	test("a cell without a number never matches a numeric condition", async ({ page }) => {
		const orders = await openOrders(page);

		// "2026-01-15" has three numbers, and Joe's cell is empty
		await expect(orders.row({ Placed: { gt: 0 } }).locator).toHaveCount(0);
		await expect(orders.row({ Placed: { not: { gt: 0 } } }).locator).toHaveCount(3);
		await expect(orders.row({ Customer: { lt: 100 } }).locator).toHaveCount(0);
	});

	test("numeric conditions with a decimal comma", async ({ page }) => {
		await page.goto(Route.RefreshingTable);
		const orders = defineTable(page.locator("#Orders"));

		await expect(orders.row({ Total: { gt: 1000, decimal: "," } }).locator).toHaveCount(2);
		await expect(orders.row({ Total: { between: [15, 16], decimal: "," } }).cell("Customer")).toHaveText("Joe");
		// With a decimal point, "€ 1.200,50" is not a number
		await expect(orders.row({ Total: { gt: 0 } }).locator).toHaveCount(0);
	});

	test("invalid numeric conditions throw", async ({ page }) => {
		const orders = await openOrders(page);

		expect(() => orders.row({ Total: { gt: NaN } })).toThrow('Condition for header "Total": gt needs finite numbers.');
		expect(() => orders.row({ Total: { lt: Infinity } })).toThrow("lt needs finite numbers");
		// @ts-expect-error between needs a pair
		expect(() => orders.row({ Total: { between: [1] } })).toThrow("between must be a [min, max] pair");
		// @ts-expect-error not a decimal separator
		expect(() => orders.row({ Total: { gt: 1, decimal: ";" } })).toThrow('decimal must be "." or ","');
	});

	test("toBeSortedBy with a decimal comma", async ({ page }) => {
		await page.setContent(`
			<table id="prices">
				<thead><tr><th>Price</th></tr></thead>
				<tbody><tr><td>9,99</td></tr><tr><td>1.000,00</td></tr><tr><td>12.000,5</td></tr></tbody>
			</table>
		`);
		const prices = defineTable(page.locator("#prices"));

		await expect(prices).toBeSortedBy("Price", { type: "number", decimal: "," });
		const message = await errorMessage(() => expect(prices).toBeSortedBy("Price", { type: "number", timeout: 1_000 }));
		expect(message).toContain('Received: row 0 ("9,99") is not a number');
	});
});

test.describe("toJson columns and parse", () => {
	test("columns picks columns in the given order", async ({ page }) => {
		const orders = await openOrders(page);

		expect(await orders.toJson({ columns: ["Total", "Customer"] })).toEqual([
			{ Total: "€ 1,200.50", Customer: "John" },
			{ Total: "€ 80", Customer: "Jane" },
			{ Total: "€ 15.25", Customer: "Joe" },
		]);
	});

	test("parse converts columns to numbers, dates and custom values", async ({ page }) => {
		const orders = await openOrders(page);

		const rows = await orders.toJson({
			columns: ["Customer", "Total", "Placed", "Status"],
			parse: { Total: "number", Placed: "date", Status: text => text === "Active" },
		});
		expect(rows).toEqual([
			{ Customer: "John", Total: 1200.5, Placed: new Date("2026-01-15"), Status: true },
			{ Customer: "Jane", Total: 80, Placed: new Date("2026-02-01"), Status: false },
			{ Customer: "Joe", Total: 15.25, Placed: null, Status: true },
		]);
	});

	test("parse works without columns", async ({ page }) => {
		const orders = await openOrders(page);

		const rows = await orders.toJson({ parse: { Total: "number" } });
		expect(rows.map(row => row.Total)).toEqual([1200.5, 80, 15.25]);
		expect(rows[0]?.Customer).toBe("John");
	});

	test("parse with a decimal comma", async ({ page }) => {
		await page.goto(Route.RefreshingTable);
		const orders = defineTable(page.locator("#Orders"), { headers: ["Customer", "Status", "Total"] });

		const totals = await orders.toJson({ columns: ["Total"], parse: { Total: "number" }, decimal: "," });
		expect(totals).toEqual([{ Total: 1200.5 }, { Total: 80 }, { Total: 15.25 }, { Total: 3000 }]);
	});

	test("a cell that cannot be parsed fails with the row, column and text", async ({ page }) => {
		const orders = await openOrders(page);

		const number = await errorMessage(() => orders.toJson({ parse: { Customer: "number" } }));
		expect(number).toContain('row 0 "Customer" ("John") is not a number (decimal separator ".")');

		const date = await errorMessage(() => orders.toJson({ parse: { Status: "date" } }));
		expect(date).toContain('row 0 "Status" ("Active") is not a date');

		const custom = await errorMessage(() =>
			orders.toJson({
				parse: {
					Total: text => {
						throw new Error(`no ${text}`);
					},
				},
			})
		);
		expect(custom).toContain('row 0 "Total" ("€ 1,200.50") could not be parsed: no € 1,200.50');
	});

	test("unknown columns fail with the available headers", async ({ page }) => {
		await page.setContent(ordersTable);
		const orders = defineTable(page.locator("#orders"));

		const columns = await errorMessage(() => orders.toJson({ columns: ["Customer", "Totl"] }));
		expect(columns).toContain('Header "Totl" not found.');
		expect(columns).toContain("Available headers: [Customer, Status, Total, Placed]");

		const parse = await errorMessage(() => orders.toJson({ parse: { Totl: "number" } }));
		expect(parse).toContain('Header "Totl" not found.');

		// Also a compile-time error; the check is for JavaScript callers.
		// @ts-expect-error parse only takes the selected columns
		const notSelected = await errorMessage(() => orders.toJson({ columns: ["Customer"], parse: { Total: "number" } }));
		expect(notSelected).toContain("parse has headers that are not in columns: [Total]");
	});

	test("columns with minRows waits for content in those columns", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = defineTable(page.locator("#DynamicTable"), { headers: ["Header 1", "Header 2", "Header 3"] });

		const rows = await table.toJson({ columns: ["Header 3"], minRows: 3 });
		expect(rows).toEqual([{ "Header 3": "Row 1 Col 3" }, { "Header 3": "Row 2 Col 3" }, { "Header 3": "Row 3 Col 3" }]);
	});
});

test.describe("columnValues", () => {
	test("reads a column by header or index", async ({ page }) => {
		const orders = await openOrders(page);

		expect(await orders.columnValues("Status")).toEqual(["Active", "Inactive", "Active"]);
		expect(await orders.columnValues(0)).toEqual(["John", "Jane", "Joe"]);
		expect(await orders.columnValues("Placed")).toEqual(["2026-01-15", "2026-02-01", ""]);
	});

	test("an unknown column fails with the available headers", async ({ page }) => {
		const orders = await openOrders(page);

		const header = await errorMessage(() => orders.columnValues("Nope" as "Status"));
		expect(header).toContain('Header "Nope" not found.');
		expect(header).toContain("Available headers: [Customer, Status, Total, Placed]");
		const index = await errorMessage(() => orders.columnValues(9));
		expect(index).toContain("column 9 does not exist.");
	});
});

test.describe("waitForStable", () => {
	test("waits for the loading indicator and the last rows", async ({ page }) => {
		await page.goto(Route.RefreshingTable);
		const orders = defineTable(page.locator("#Orders"), { headers: ["Customer", "Status", "Total"] });
		await page.locator("#search").fill("J");
		await page.locator("#apply").click();

		await orders.waitForStable({ loading: page.getByRole("progressbar"), quiet: 300 });
		expect(await orders.columnValues("Customer")).toEqual(["John", "Jane", "Joe", "Jack"]);
	});

	test("toJson with stable reads the refreshed table", async ({ page }) => {
		await page.goto(Route.RefreshingTable);
		const orders = defineTable(page.locator("#Orders"), { headers: ["Customer", "Status", "Total"] });
		await page.locator("#search").fill("Ja");
		await page.locator("#apply").click();

		const rows = await orders.toJson({
			columns: ["Customer"],
			stable: { loading: page.getByRole("progressbar"), quiet: 300 },
		});
		expect(rows).toEqual([{ Customer: "Jane" }, { Customer: "Jack" }]);
	});

	test("toJson with stable and minRows waits for rows first", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = defineTable(page.locator("#DynamicTable"), { headers: ["Header 1", "Header 2", "Header 3"] });

		// One timeout for both waits: the rows load after 2 seconds, then the table must stay the same
		const rows = await table.toJson({ minRows: 3, stable: true, timeout: 10_000 });
		expect(rows).toHaveLength(3);
	});

	test("times out on a table that keeps changing", async ({ page }) => {
		await page.goto(Route.RefreshingTable);
		const orders = defineTable(page.locator("#Orders"));
		await page.locator("#tick").click();

		const message = await errorMessage(() => orders.waitForStable({ quiet: 300, timeout: 2_000 }));
		expect(message).toContain("TableLocator.waitForStable() timed out after 2000ms: the table kept changing");
		expect(message).toContain("Body rows: 4");
		expect(message).toContain("Table locator: locator('#Orders')");
	});

	test("times out while the loading indicator is visible", async ({ page }) => {
		await page.setContent(`${ordersTable}<div class="spinner">Loading</div>`);
		const orders = defineTable(page.locator("#orders"));

		const message = await errorMessage(() =>
			orders.waitForStable({ loading: page.locator(".spinner"), quiet: 100, timeout: 500 })
		);
		expect(message).toContain("the loading indicator is still visible");
		expect(message).toContain("Loading locator: locator('.spinner')");
	});

	test("reports a table that cannot be read", async ({ page }) => {
		await page.setContent(ordersTable);
		const missing = defineTable(page.locator("#missing"));

		const message = await errorMessage(() => missing.waitForStable({ timeout: 1_000 }));
		expect(message).toContain("the table could not be read");
	});

	test("rejects a negative quiet period", async ({ page }) => {
		const orders = await openOrders(page);

		await expect(orders.waitForStable({ quiet: -1 })).rejects.toThrow("quiet must be a non-negative number, got: -1");
	});
});

test.describe("dataset matchers", () => {
	test("toContainRows matches rows in any order", async ({ page }) => {
		const orders = await openOrders(page);

		await expect(orders).toContainRows([{ Customer: "Joe" }, { Customer: "John", Status: "Active" }]);
		await expect(orders).toContainRows([]);
		await expect(orders).not.toContainRows([{ Customer: "Ghost" }]);
	});

	test("toContainRows gives each entry a different row", async ({ page }) => {
		const orders = await openOrders(page);

		// A greedy match would give John to the first entry and leave nothing for the second.
		await expect(orders).toContainRows([{ Status: "Active" }, { Customer: "John" }]);
		await expect(orders).not.toContainRows([{ Status: "Active" }, { Status: "Active" }, { Status: "Active" }]);
	});

	test("toContainRows failure shows the entries left over and the body rows", async ({ page }) => {
		const orders = await openOrders(page);

		const message = await errorMessage(() =>
			expect(orders).toContainRows([{ Customer: "Joe" }, { Customer: "Ghost", Status: "Active" }], { timeout: 1_000 })
		);
		expect(message).toContain("Expected: body rows matching, in any order (other rows allowed)");
		expect(message).toContain('No body row left for [1] { "Customer": "Ghost", "Status": "Active" }');
		expect(message).toContain(
			[
				"  # | Customer | Status",
				"  0 | John     | Active",
				"  1 | Jane     | Inactive",
				"  2 | Joe      | Active",
			].join("\n")
		);
	});

	test("toContainRows fails on an unknown header, also with .not", async ({ page }) => {
		const orders = await openOrders(page);

		// Untyped, like JavaScript callers: a typo is also checked at runtime
		const typo: RowWhere<string>[] = [{ Custmer: "Joe" }];
		const message = await errorMessage(() => expect(orders).toContainRows(typo, { timeout: 1_000 }));
		expect(message).toContain('Header "Custmer" not found.');
		const negated = await errorMessage(() => expect(orders).not.toContainRows(typo, { timeout: 1_000 }));
		expect(negated).toContain('Header "Custmer" not found.');
	});

	test("toHaveRows with anyOrder", async ({ page }) => {
		const orders = await openOrders(page);

		await expect(orders).toHaveRows([{ Customer: "Joe" }, { Customer: "John" }, { Customer: "Jane" }], {
			anyOrder: true,
		});
		await expect(orders).not.toHaveRows([{ Customer: "Joe" }, { Customer: "John" }], { anyOrder: true });

		const message = await errorMessage(() =>
			expect(orders).toHaveRows([{ Customer: "Joe" }, { Customer: "John" }], { anyOrder: true, timeout: 1_000 })
		);
		expect(message).toContain("Expected: 2 body rows matching, in any order");
		expect(message).toContain("Received: 3 body rows");
	});

	test("toHaveEveryRow checks every body row", async ({ page }) => {
		const orders = await openOrders(page);

		await expect(orders).toHaveEveryRow({ Total: { gt: 0 } });
		await expect(orders).not.toHaveEveryRow({ Status: "Active" });

		const message = await errorMessage(() => expect(orders).toHaveEveryRow({ Status: "Active" }, { timeout: 1_000 }));
		expect(message).toContain('Expected: every body row matching { "Status": "Active" }');
		expect(message).toContain("Received: 2 of 3 body rows match");
		expect(message).toContain(["Body rows that do not match:", "  # | Status", "  1 | Inactive"].join("\n"));
	});

	test("toHaveEveryRow waits for a filter", async ({ page }) => {
		await page.goto(Route.RefreshingTable);
		const orders = defineTable(page.locator("#Orders"));
		await page.locator("#search").fill("Ja");
		await page.locator("#apply").click();

		await expect(orders).toHaveEveryRow({ Customer: { startsWith: "Ja" } });
	});

	test("toHaveEveryRow fails on a table without body rows, also with .not", async ({ page }) => {
		await page.setContent(`<table id="t"><thead><tr><th>Name</th></tr></thead><tbody></tbody></table>`);
		const table = defineTable(page.locator("#t"));

		const message = await errorMessage(() => expect(table).toHaveEveryRow({ Name: "x" }, { timeout: 1_000 }));
		expect(message).toContain("Received: the table has no body rows");
		const negated = await errorMessage(() => expect(table).not.toHaveEveryRow({ Name: "x" }, { timeout: 1_000 }));
		expect(negated).toContain("Received: the table has no body rows");
		// @ts-expect-error empty conditions, checked at runtime too
		await expect(expect(table).toHaveEveryRow({})).rejects.toThrow("requires at least one condition");
	});

	test("toHaveColumnValues in order", async ({ page }) => {
		const orders = await openOrders(page);

		await expect(orders).toHaveColumnValues("Status", ["Active", "Inactive", "Active"]);
		await expect(orders).toHaveColumnValues(0, [/^Jo/, { startsWith: "Ja" }, "Joe"]);
		await expect(orders).toHaveColumnValues("Total", [{ gt: 1000 }, { between: [50, 100] }, { lt: 20 }]);
		await expect(orders).not.toHaveColumnValues("Status", ["Active", "Active", "Inactive"]);
	});

	test("toHaveColumnValues in any order", async ({ page }) => {
		const orders = await openOrders(page);

		await expect(orders).toHaveColumnValues("Customer", ["Joe", "John", "Jane"], { anyOrder: true });
		await expect(orders).toHaveColumnValues("Status", ["Active", "Active", "Inactive"], { anyOrder: true });
		await expect(orders).not.toHaveColumnValues("Status", ["Active", "Inactive", "Inactive"], { anyOrder: true });

		const message = await errorMessage(() =>
			expect(orders).toHaveColumnValues("Status", ["Inactive", "Inactive", "Active"], {
				anyOrder: true,
				timeout: 1_000,
			})
		);
		expect(message).toContain(
			'Expected: column "Status" with 3 values in any order: ["Inactive", "Inactive", "Active"]'
		);
		expect(message).toContain('Received: ["Active", "Inactive", "Active"]');
		expect(message).toContain('No body row left for value [1] "Inactive"');
	});

	test("toHaveColumnValues failure shows the rows that do not match", async ({ page }) => {
		const orders = await openOrders(page);

		const message = await errorMessage(() =>
			expect(orders).toHaveColumnValues("Status", ["Active", "Active"], { timeout: 1_000 })
		);
		expect(message).toContain('Expected: column "Status" with 2 values: ["Active", "Active"]');
		expect(message).toContain('Received: ["Active", "Inactive", "Active"]');
		expect(message).toContain("Expected 2 values, received 3");
		expect(message).toContain('Row 1 does not match "Active", received "Inactive"');
	});

	test("toHaveColumnValues fails on an unknown column, also with .not", async ({ page }) => {
		const orders = await openOrders(page);

		// @ts-expect-error unknown header, checked at runtime too
		const header = await errorMessage(() => expect(orders).toHaveColumnValues("Stat", ["Active"], { timeout: 1_000 }));
		expect(header).toContain('Header "Stat" not found.');
		const index = await errorMessage(() => expect(orders).not.toHaveColumnValues(7, ["Active"], { timeout: 1_000 }));
		expect(index).toContain("Column 7 does not exist.");
		await expect(expect(orders).toHaveColumnValues(-1, [])).rejects.toThrow(
			"Column index must be a non-negative integer"
		);
	});
});
