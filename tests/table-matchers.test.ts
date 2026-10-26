import { expect as baseExpect, mergeExpects, Page } from "@playwright/test";
import { CellContentType, defineTable, expect, TableLocator, tableMatchers, test } from "src";

import { Route } from "./demo-html/routes";

const usersTable = `
	<table id="users">
		<thead><tr><th>Name</th><th>Status</th><th>Email</th></tr></thead>
		<tbody>
			<tr><td>John</td><td>Active</td><td>john@example.com</td></tr>
			<tr><td>Jane</td><td>Inactive</td><td>jane@example.com</td></tr>
			<tr><td>Joe</td><td>Active</td><td>joe@example.com</td></tr>
		</tbody>
	</table>
`;

async function openUsers(page: Page): Promise<TableLocator<"Name" | "Status" | "Email">> {
	await page.setContent(usersTable);
	return defineTable(page.locator("#users"), { headers: ["Name", "Status", "Email"] });
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

test.describe("table matchers", () => {
	test("toHaveRow and not.toHaveRow", async ({ page }) => {
		const users = await openUsers(page);

		await expect(users).toHaveRow({ Name: "Jane", Status: "Inactive" });
		await expect(users).toHaveRow({ Status: /active/i });
		await expect(users).not.toHaveRow({ Name: "Ghost" });
		await expect(users).not.toHaveRow({ Name: "Jane", Status: "Active" });
	});

	test("toHaveRow waits for a late table", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = defineTable(page.locator("#DynamicTable"), { headers: ["Header 1", "Header 2", "Header 3"] });

		await expect(table).toHaveRow({ "Header 2": "Row 3 Col 2" });
	});

	test("toHaveRow failure reports unknown and available headers", async ({ page }) => {
		await page.setContent(usersTable);
		const users = defineTable(page.locator("#users"));

		const message = await errorMessage(() => expect(users).toHaveRow({ Stauts: "Active" }, { timeout: 300 }));
		expect(message).toContain("toHaveRow");
		expect(message).toContain('Header "Stauts" not found.');
		expect(message).toContain("Available headers: [Name, Status, Email]");
	});

	test("toHaveRow failure without unknown headers shows the conditions", async ({ page }) => {
		const users = await openUsers(page);

		const message = await errorMessage(() =>
			expect(users).toHaveRow({ Name: /^Ja/, Status: "Gone" }, { timeout: 300 })
		);
		expect(message).toContain('{ "Name": /^Ja/, "Status": "Gone" }');
		expect(message).not.toContain("Available headers");

		const negated = await errorMessage(() => expect(users).not.toHaveRow({ Name: "John" }, { timeout: 300 }));
		expect(negated).toContain("no row");
	});

	test("negated matchers fail on an unknown header instead of passing", async ({ page }) => {
		await page.setContent(usersTable);
		const users = defineTable(page.locator("#users"));
		// The first read of a fresh Firefox page can take longer than the short timeouts below.
		await expect(users).toHaveHeaders(["Name", "Status", "Email"]);

		const row = await errorMessage(() => expect(users).not.toHaveRow({ Nmae: "John" }, { timeout: 1_000 }));
		expect(row).toContain("Received: a table that cannot be checked");
		expect(row).toContain('Header "Nmae" not found.');
		expect(row).toContain("Available headers: [Name, Status, Email]");

		const cells = await errorMessage(() =>
			expect(users.rowAt(0)).not.toHaveCells({ Stauts: "Gone" }, { timeout: 1_000 })
		);
		expect(cells).toContain("Received: a table that cannot be checked");
		expect(cells).toContain('Header "Stauts" not found.');

		const rows = await errorMessage(() => expect(users).not.toHaveRows([{ Nmae: "John" }, {}, {}], { timeout: 1_000 }));
		expect(rows).toContain('Header "Nmae" not found.');
		expect(rows).toContain("Available headers: [Name, Status, Email]");
	});

	test("negated matchers wait for late headers", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = defineTable(page.locator("#DynamicTable"), { headers: ["Header 1", "Header 2", "Header 3"] });

		await expect(table).not.toHaveRow({ "Header 1": "Nope" });
		await expect(table.rowAt(0)).not.toHaveCells({ "Header 2": "Nope" });
		await expect(table).not.toHaveRows([{ "Header 1": "Nope" }]);
	});

	test("toHaveRowCount", async ({ page }) => {
		const users = await openUsers(page);

		await expect(users).toHaveRowCount(3);
		await expect(users).not.toHaveRowCount(2);

		const message = await errorMessage(() => expect(users).toHaveRowCount(5, { timeout: 300 }));
		expect(message).toContain("Received: 3");
	});

	test("toHaveHeaders", async ({ page }) => {
		const users = await openUsers(page);

		await expect(users).toHaveHeaders(["Email", "Name"]);
		await expect(users).toHaveHeaders(["Name", "Status", "Email"], { exact: true });
		await expect(users).not.toHaveHeaders(["Email", "Name"], { exact: true });
		await expect(users).not.toHaveHeaders(["Age"]);

		const message = await errorMessage(() => expect(users).toHaveHeaders(["Name", "Stauts"], { timeout: 300 }));
		expect(message).toContain("Missing headers: [Stauts]");
	});

	test("toHaveHeaders waits for late headers", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = defineTable(page.locator("#DynamicTable"));

		await expect(table).toHaveHeaders(["Header 1", "Header 2", "Header 3"], { exact: true });
	});

	test("toHaveCells on a row", async ({ page }) => {
		const users = await openUsers(page);

		await expect(users.row({ Name: "Jane" })).toHaveCells({ Status: "Inactive", Email: /^jane@/ });
		await expect(users.rowAt(2)).toHaveCells({ Name: "Joe", Status: { not: "Inactive" } });
		await expect(users.rows.filter({ hasText: "john@" })).toHaveCells({ Name: "John" });
		await expect(users.row({ Name: "Jane" })).not.toHaveCells({ Status: "Active" });
	});

	test("toHaveCells waits for a late row", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = defineTable(page.locator("#DynamicTable"), { headers: ["Header 1", "Header 2", "Header 3"] });

		await expect(table.row({ "Header 1": "Row 1 Col 1" })).toHaveCells({ "Header 3": "Row 1 Col 3" });
	});

	test("toHaveCells failure shows the received cells", async ({ page }) => {
		const users = await openUsers(page);

		const message = await errorMessage(() =>
			expect(users.row({ Name: "Jane" })).toHaveCells({ Status: "Active", Name: "Jane" }, { timeout: 300 })
		);
		expect(message).toContain('Expected: a row matching { "Status": "Active", "Name": "Jane" }');
		expect(message).toContain('Received: { "Status": "Inactive", "Name": "Jane" }');
	});

	test("toHaveCells failure reads the cells like the table does", async ({ page }) => {
		await page.setContent(`
			<table id="t">
				<thead><tr><th>Name</th><th>Status</th></tr></thead>
				<tbody><tr><td>Jane</td><td>Inactive<span hidden> (hidden)</span></td></tr></tbody>
			</table>
		`);
		const table = defineTable(page.locator("#t"), { cellContentType: CellContentType.TextContent });

		const message = await errorMessage(() =>
			expect(table.rowAt(0)).toHaveCells({ Status: "Inactive" }, { timeout: 300 })
		);
		expect(message).toContain('Received: { "Status": "Inactive (hidden)" }');
	});

	test("matchers report why the table cannot be read", async ({ page }) => {
		await page.setContent(usersTable);
		// The first read of a fresh Firefox page can take longer than the short timeouts below.
		await expect(defineTable(page.locator("#users"))).toHaveRowCount(3);
		const broken = defineTable(page.locator("#users"), { row: { rowSelector: "tbody>>>tr" } });

		const rows = await errorMessage(() => expect(broken).toHaveRows([{ Name: "John" }], { timeout: 1_000 }));
		expect(rows).toContain("Last error:");
		expect(rows).toMatch(/not a valid selector|SyntaxError/);

		const count = await errorMessage(() => expect(broken).toHaveRowCount(3, { timeout: 1_000 }));
		expect(count).toContain("Last error:");

		const brokenHeader = defineTable(page.locator("#users"), { header: { rowSelector: "thead>>>tr" } });
		const headers = await errorMessage(() => expect(brokenHeader).toHaveHeaders(["Name"], { timeout: 1_000 }));
		expect(headers).toContain("Last error:");
	});

	test("failures report predicates that throw", async ({ page }) => {
		const users = await openUsers(page);
		const minLength = 3;
		// Uses a variable from the test, which does not exist in the browser.
		const tooClever = { predicate: (text: string) => text.length > minLength };

		const row = await errorMessage(() => expect(users).toHaveRow({ Name: tooClever }, { timeout: 1_000 }));
		expect(row).toContain('Predicate for "Name" threw ReferenceError');
		expect(row).toContain("minLength");

		const cells = await errorMessage(() => expect(users.rowAt(0)).toHaveCells({ Name: tooClever }, { timeout: 1_000 }));
		expect(cells).toContain('Predicate for "Name" threw ReferenceError');

		const rows = await errorMessage(() =>
			expect(users).toHaveRows([{ Name: { not: tooClever } }, {}, {}], { timeout: 1_000 })
		);
		expect(rows).toContain('Predicate for "Name" threw ReferenceError');
	});

	test("toHaveRows fails on a table that is never attached, also with .not", async ({ page }) => {
		await page.setContent(usersTable);
		const missing = defineTable(page.locator("#missing"));

		const message = await errorMessage(() => expect(missing).toHaveRows([], { timeout: 300 }));
		expect(message).toContain("Received: the table could not be read");
		await errorMessage(() => expect(missing).not.toHaveRows([{ Name: "John" }], { timeout: 300 }));
	});

	test("toHaveCells requires exactly one row", async ({ page }) => {
		const users = await openUsers(page);

		const several = await errorMessage(() => expect(users.rows).toHaveCells({ Status: /active/i }, { timeout: 300 }));
		expect(several).toContain("the row locator matched 3 rows, expected exactly 1");

		const none = await errorMessage(() =>
			expect(users.row({ Name: "Ghost" })).not.toHaveCells({ Status: "x" }, { timeout: 300 })
		);
		expect(none).toContain("the row locator matched 0 rows");
	});

	test("toHaveCells failure reports unknown headers", async ({ page }) => {
		await page.setContent(usersTable);
		const users = defineTable(page.locator("#users"));

		const message = await errorMessage(() =>
			expect(users.rowAt(0)).toHaveCells({ Stauts: "Active" }, { timeout: 300 })
		);
		expect(message).toContain('Header "Stauts" not found.');
		expect(message).toContain("Available headers: [Name, Status, Email]");
	});

	test("toHaveRows matches every row in order", async ({ page }) => {
		const users = await openUsers(page);

		await expect(users).toHaveRows([
			{ Name: "John", Status: "Active", Email: "john@example.com" },
			{ Name: "Jane", Status: "Inactive", Email: "jane@example.com" },
			{ Name: "Joe", Status: "Active", Email: "joe@example.com" },
		]);
		await expect(users).toHaveRows([{ Name: /^jo/i }, { Status: { not: "Active" } }, {}]);
		await expect(users).not.toHaveRows([{ Name: "Jane" }, { Name: "John" }, { Name: "Joe" }]);
		await expect(users).not.toHaveRows([{ Name: "John" }, { Name: "Jane" }]);
	});

	test("toHaveRows with an empty list asserts an empty body", async ({ page }) => {
		await page.setContent(`<table id="empty"><thead><tr><th>Name</th></tr></thead><tbody></tbody></table>`);
		const table = defineTable(page.locator("#empty"));

		await expect(table).toHaveRows([]);
	});

	test("toHaveRows waits for a late table", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = defineTable(page.locator("#DynamicTable"), { headers: ["Header 1", "Header 2", "Header 3"] });

		await expect(table).toHaveRows([
			{ "Header 1": "Row 1 Col 1" },
			{ "Header 1": "Row 2 Col 1" },
			{ "Header 1": "Row 3 Col 1", "Header 3": "Row 3 Col 3" },
		]);
	});

	test("toHaveRows waits for rows to change", async ({ page }) => {
		const users = await openUsers(page);
		await page.evaluate(() => {
			setTimeout(() => document.querySelector("#users tbody tr:last-child")?.remove(), 300);
		});

		await expect(users).toHaveRows([{ Name: "John" }, { Name: "Jane" }]);
	});

	test("toHaveRows failure lists the rows that do not match", async ({ page }) => {
		const users = await openUsers(page);

		const message = await errorMessage(() =>
			expect(users).toHaveRows(
				[{ Name: "John", Status: "Active" }, { Name: "Jane", Status: "Active" }, { Name: "Joe" }],
				{ timeout: 300 }
			)
		);
		expect(message).toContain("toHaveRows");
		expect(message).toContain('[1] { "Name": "Jane", "Status": "Active" }');
		expect(message).toContain("Received: 3 body rows");
		expect(message).toContain('Row 1 does not match, received { "Name": "Jane", "Status": "Inactive" }');
		expect(message).not.toContain("Row 0 does not match");
	});

	test("toHaveRows failure reports a different row count", async ({ page }) => {
		const users = await openUsers(page);

		const message = await errorMessage(() => expect(users).toHaveRows([{ Name: "John" }], { timeout: 300 }));
		expect(message).toContain("Expected: 1 body rows matching");
		expect(message).toContain("Received: 3 body rows");
	});

	test("toHaveRows failure reports unknown headers", async ({ page }) => {
		const users = await openUsers(page);

		const message = await errorMessage(() =>
			expect(users).toHaveRows([{ Stauts: "Active" }, {}, {}], { timeout: 300 })
		);
		expect(message).toContain('Header "Stauts" not found.');
		expect(message).toContain("Available headers: [Name, Status, Email]");
	});

	test("toHaveRows runs predicates on a page whose CSP forbids eval", async ({ page }) => {
		await page.route("**/strict-csp", route =>
			route.fulfill({
				body: usersTable,
				headers: { "content-type": "text/html", "content-security-policy": "script-src 'self'" },
			})
		);
		await page.goto("/strict-csp");
		const users = defineTable(page.locator("#users"));

		await expect(users).toHaveRows(
			[
				{ Name: "John" },
				{ Status: { predicate: text => text.startsWith("In") } },
				{ Name: { not: { predicate: text => text === "x" } } },
			],
			{ timeout: 2_000 }
		);
		await expect(users).not.toHaveRows([{}, { Status: { predicate: text => text === "Active" } }, {}], {
			timeout: 2_000,
		});
	});

	test("not.toHaveRows failure", async ({ page }) => {
		const users = await openUsers(page);

		const message = await errorMessage(() =>
			expect(users).not.toHaveRows([{ Name: "John" }, { Name: "Jane" }, { Name: "Joe" }], { timeout: 300 })
		);
		expect(message).toContain("Expected: not 3 body rows matching");
	});

	test("matchers on tables with spans", async ({ page }) => {
		await page.goto(Route.CombinedSpanTable);
		const quarters = defineTable(page.locator("table"));
		await expect(quarters).toHaveRows([
			{ Region: "North", Q1: "Combined N+S Q1-Q2", Q2: "Combined N+S Q1-Q2", Q3: "300" },
			{ Region: "South", Q1: "Combined N+S Q1-Q2", Q4: "450" },
			{ Region: "East", Q1: "500" },
		]);
		await expect(quarters.row({ Region: "South" })).toHaveCells({ Q2: { startsWith: "Combined" }, Q3: "350" });

		await page.goto(Route.RowspanHeaderTable);
		const averages = defineTable(page.locator("table"));
		await expect(averages).toHaveHeaders(["Height", "Weight", "Height__D1", "Weight__D1", "Age"], { exact: true });
		await expect(averages).toHaveRow({ Height__D1: "80", Age: "40" });

		await page.goto(Route.ColspanRowTable);
		const prices = defineTable(page.locator("table"));
		await expect(prices.row({ Item: "Total" })).toHaveCells({ Category: "8000", Price: "8000" });
		await expect(prices).toHaveRowCount(3);
	});

	test("tableMatchers can be spread into your own expect.extend", async ({ page }) => {
		const users = await openUsers(page);
		const myExpect = baseExpect.extend({
			...tableMatchers,
			async toHaveEmailFor(table: TableLocator, name: string) {
				const email = await table.row({ Name: name }).cell("Email").textContent();
				return { pass: email !== null && email.includes("@"), message: () => `no email for ${name}` };
			},
		});

		await myExpect(users).toHaveRow({ Name: "Joe" });
		await myExpect(users).toHaveEmailFor("Joe");
	});

	test("the exported expect works with mergeExpects", async ({ page }) => {
		const users = await openUsers(page);
		const otherExpect = baseExpect.extend({
			async toBeTable(table: TableLocator) {
				const tag = await table.root.evaluate(element => element.tagName);
				return { pass: tag === "TABLE", message: () => `expected a <table>, got <${tag.toLowerCase()}>` };
			},
		});
		const merged = mergeExpects(expect, otherExpect);

		await merged(users).toHaveRowCount(3);
		await merged(users).toBeTable();
		await merged(users.row({ Name: "John" }).cell("Status")).toHaveText("Active");
	});
});

test.describe("toBeSortedBy", () => {
	async function openSortable(page: Page): Promise<TableLocator<"Name" | "Salary" | "Joined">> {
		await page.goto(Route.SortableTable);
		return defineTable(page.locator("#SortableTable"), { headers: ["Name", "Salary", "Joined"] });
	}

	test("waits for a sort, in both directions", async ({ page }) => {
		const table = await openSortable(page);
		await expect(table).not.toBeSortedBy("Name");

		await table.header("Name").click();
		await expect(table).toBeSortedBy("Name", { ariaSort: true });
		await expect(table.column("Name")).toHaveText(["Alice", "Bob", "carol", "dave"]);

		await table.header("Name").click();
		await expect(table).toBeSortedBy("Name", { order: "desc", ariaSort: true });
		await expect(table).not.toBeSortedBy("Name", { order: "asc" });
	});

	test("a column index works without header rows", async ({ page }) => {
		await page.setContent(`
			<table id="plain"><tbody>
				<tr><td>b</td><td>1</td></tr>
				<tr><td>a</td><td>2</td></tr>
				<tr><td>c</td><td>10</td></tr>
			</tbody></table>
		`);
		const table = defineTable(page.locator("#plain"));

		await expect(table).toBeSortedBy(1, { type: "number" });
		await expect(table).not.toBeSortedBy(0);
		const message = await errorMessage(() => expect(table).toBeSortedBy(2, { timeout: 300 }));
		expect(message).toContain("Received: column 2 does not exist");
	});

	test("number and date types", async ({ page }) => {
		const table = await openSortable(page);

		await table.header("Salary").click();
		await expect(table).toBeSortedBy("Salary", { type: "number" });
		// As text, "€ 950" comes after "€ 1,200"
		await expect(table).not.toBeSortedBy("Salary", { type: "text" });

		await table.header("Joined").click();
		await expect(table).toBeSortedBy("Joined", { type: "date", ariaSort: true });
		await expect(table).toBeSortedBy(2, { type: "date" });
	});

	test("compare can use variables from the test", async ({ page }) => {
		const table = await openSortable(page);
		const seniority = ["Bob", "dave", "carol", "Alice"];

		await table.header("Joined").click();
		await expect(table).toBeSortedBy("Name", { compare: (a, b) => seniority.indexOf(a) - seniority.indexOf(b) });
	});

	test("failure shows the first pair out of order", async ({ page }) => {
		const table = await openSortable(page);

		const message = await errorMessage(() => expect(table).toBeSortedBy("Salary", { type: "number", timeout: 1_000 }));
		expect(message).toContain('Expected: column "Salary" sorted ascending as number');
		expect(message).toContain('Received: ["€ 12,000", "€ 950", "€ 1,200", "€ 3,400"]');
		expect(message).toContain('Row 0 ("€ 12,000") comes before row 1 ("€ 950")');
	});

	test("failure reports a wrong aria-sort", async ({ page }) => {
		await page.setContent(`
			<table id="sorted">
				<thead><tr><th aria-sort="descending">Name</th></tr></thead>
				<tbody><tr><td>Ann</td></tr><tr><td>Bob</td></tr></tbody>
			</table>
		`);
		const table = defineTable(page.locator("#sorted"));

		await expect(table).toBeSortedBy("Name");
		const message = await errorMessage(() => expect(table).toBeSortedBy("Name", { ariaSort: true, timeout: 1_000 }));
		expect(message).toContain('with aria-sort="ascending"');
		expect(message).toContain('aria-sort: "descending"');
	});

	test("a table that cannot be checked fails, also with .not", async ({ page }) => {
		const table = await openSortable(page);

		const unknown = await errorMessage(() => expect(table).not.toBeSortedBy("Nmae", { timeout: 1_000 }));
		expect(unknown).toContain('Received: Header "Nmae" not found.');
		expect(unknown).toContain("Available headers: [Name, Salary, Joined]");

		const notANumber = await errorMessage(() => expect(table).toBeSortedBy("Name", { type: "number", timeout: 1_000 }));
		expect(notANumber).toContain('Received: row 0 ("dave") is not a number');

		await page.setContent(`<table id="empty"><thead><tr><th>Name</th></tr></thead><tbody></tbody></table>`);
		const empty = await errorMessage(() =>
			expect(defineTable(page.locator("#empty"))).toBeSortedBy("Name", { timeout: 300 })
		);
		expect(empty).toContain("Received: the table has no body rows");
	});
});

test.describe("header validation", () => {
	test("headerKeys() returns the resolved keys", async ({ page }) => {
		await page.goto(Route.ColspanHeaderTable);
		const table = defineTable(page.locator("table"));

		expect(await table.headerKeys()).toEqual([
			"Number",
			"Name",
			"Name__C1",
			"Color Combination",
			"Color Combination__C1",
			"Color Combination__C2",
		]);
	});

	test("validateHeaders() checks the declared headers", async ({ page }) => {
		const users = await openUsers(page);
		await users.validateHeaders();
		await users.validateHeaders(["Email"]);
	});

	test("validateHeaders() waits for late headers", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = defineTable(page.locator("#DynamicTable"), { headers: ["Header 1", "Header 3"] });

		await table.validateHeaders();
	});

	test("validateHeaders() fails fast with the available headers", async ({ page }) => {
		await page.setContent(usersTable);
		const users = defineTable(page.locator("#users"), { headers: ["Name", "Stauts", "Email"] });

		const message = await errorMessage(() => users.validateHeaders(undefined, { timeout: 300 }));
		expect(message).toContain("Missing headers: [Stauts]");
		expect(message).toContain("Available headers: [Name, Status, Email]");
		expect(message).toContain("#users");
	});

	test("validateHeaders() needs headers to check", async ({ page }) => {
		await page.setContent(usersTable);
		const users = defineTable(page.locator("#users"));

		const message = await errorMessage(() => users.validateHeaders());
		expect(message).toContain("needs headers");
	});
});
