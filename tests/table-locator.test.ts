import { Page } from "@playwright/test";
import { CellContentType, defineTable, expect, registerTableSelectors, TableLocator, test } from "src";

import { Route } from "./demo-html/routes";

const usersTable = `
	<table id="users">
		<thead>
			<tr><th>Name</th><th>Status</th><th>Email</th><th>Age</th><th>Remarks</th></tr>
		</thead>
		<tbody>
			<tr><td>John Doe</td><td>Active</td><td>john@example.com</td><td>42</td><td></td></tr>
			<tr><td>Jane Roe</td><td>Inactive</td><td>jane@example.com</td><td>17</td><td>New</td></tr>
			<tr><td>Joe   Bloggs</td><td>Active</td><td>joe@example.com</td><td>65</td><td></td></tr>
		</tbody>
	</table>
`;

async function openUsers(page: Page) {
	await page.setContent(usersTable);
	return defineTable(page.locator("#users"), { headers: ["Name", "Status", "Email", "Age", "Remarks"] });
}

async function errorMessage(action: () => Promise<unknown>): Promise<string> {
	try {
		await action();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("Expected the action to fail");
}

test.describe("TableLocator", () => {
	test("finds a cell by row condition and header", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = defineTable(page.locator("table"), { headers: ["First name", "Last name", "Date of birth"] });

		await expect(table.row({ "First name": "Logan" }).cell("Last name")).toHaveText("Deacon");
	});

	test("matches RegExp conditions", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = defineTable(page.locator("table"), { headers: ["First name", "Last name", "Date of birth"] });

		await expect(table.row({ "First name": /^ron/i }).cell("Date of birth")).toHaveText("22-12-1987");
	});

	test("requires every condition to match", async ({ page }) => {
		const users = await openUsers(page);

		await expect(users.row({ Status: "Active", Age: "65" }).cell("Name")).toHaveText("Joe Bloggs");
		await expect(users.row({ Status: "Inactive", Age: "65" }).locator).toHaveCount(0);
	});

	test("auto-waits for late headers and rows", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = defineTable(page.locator("#DynamicTable"), { headers: ["Header 1", "Header 2", "Header 3"] });

		await expect(table.row({ "Header 1": "Row 2 Col 1" }).cell("Header 3")).toHaveText("Row 2 Col 3");
	});

	test("keeps resolving correctly when columns are reordered at runtime", async ({ page }) => {
		const users = await openUsers(page);
		const email = users.row({ Name: "Jane Roe" }).cell("Email");
		await expect(email).toHaveText("jane@example.com");

		// Move the Email column to the front of every row
		await page.locator("#users").evaluate(table => {
			for (const row of Array.from(table.querySelectorAll("tr"))) {
				const cells = row.children;
				row.insertBefore(cells[2], cells[0]);
			}
		});

		await expect(page.locator("#users tbody tr").nth(1).locator("td").first()).toHaveText("jane@example.com");
		await expect(email).toHaveText("jane@example.com");
		await expect(users.header("Email")).toHaveText("Email");
	});

	test("resolves colspan header continuations", async ({ page }) => {
		await page.goto(Route.ColspanHeaderTable);
		const table = defineTable(page.locator("table"), { headers: ["Number", "Name", "Color Combination"] });

		const row = table.row({ Number: "2" });
		await expect(row.cell("Name")).toHaveText("Logan");
		await expect(row.cell("Name__C1")).toHaveText("Deacon");
		await expect(row.cell("Color Combination__C2")).toHaveText("Blue");
		await expect(table.header("Name__C1")).toHaveText("Name");
	});

	test("a rowspan body cell belongs to every row it covers", async ({ page }) => {
		await page.goto(Route.RowspanRowTable);
		const table = defineTable(page.locator("table"), { headers: ["Month", "Savings", "Savings for holiday!"] });

		await expect(table.row({ "Savings for holiday!": "50" }).locator).toHaveCount(2);
		await expect(table.row({ Month: "February" }).cell("Savings for holiday!")).toHaveText("50");
		await expect(table.column("Savings for holiday!")).toHaveCount(1);
	});

	test("handles cells spanning rows and columns", async ({ page }) => {
		await page.goto(Route.CombinedSpanTable);
		const table = defineTable(page.locator("table"), { headers: ["Region", "Q1", "Q2", "Q3", "Q4"] });

		await expect(table.row({ Region: "South" }).cell("Q2")).toHaveText("Combined N+S Q1-Q2");
		await expect(table.row({ Region: "South" }).cell("Q3")).toHaveText("350");
		await expect(table.row({ Q1: "Combined N+S Q1-Q2" }).locator).toHaveCount(2);
	});

	test("uses duplicate and empty header keys like getJson()", async ({ page }) => {
		await page.goto(Route.DuplicateEmptyHeadersTable);
		const table = defineTable(page.locator("table"));

		await expect(table.row({ "{{Empty}}__D1": "Empty 2_2" }).cell("First Name")).toHaveText("Deacon");
		await expect(table.row({ "First Name": "Logan" }).cell("{{Empty}}")).toHaveText("Empty 1_1");
	});

	test("supports multiple header rows and setMainHeaderRow", async ({ page }) => {
		await page.goto(Route.RowspanHeaderTable);

		const byLastRow = defineTable(page.locator("table"));
		await expect(byLastRow.row({ Age: "33" }).cell("Height__D1")).toHaveText("180");

		const byFirstRow = new TableLocator(page.locator("table"), { header: { setMainHeaderRow: 0 } });
		await expect(byFirstRow.row({ Age: "40" }).cell("Average__D1")).toHaveText("80");
	});

	test("works with div tables and custom selectors", async ({ page }) => {
		await page.goto(Route.DivTable);
		const table = defineTable(page.locator(".divTable"), {
			headers: ["First name", "Last name", "Specialty"],
			header: { rowSelector: ".divTableHeading > .divTableRow", columnSelector: ".divTableHead" },
			row: { rowSelector: ".divTableBody > .divTableRow", columnSelector: ".divTableCell" },
		});

		await expect(table.row({ "First name": "John" }).cell("Specialty")).toHaveText("Anonymity");
		await expect(table.rows.locator).toHaveCount(3);
	});

	test("composes with filter, nth and any row locator", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = defineTable(page.locator("table"), { headers: ["First name", "Last name", "Date of birth"] });

		await expect(table.rows.filter({ hasText: "Logan" }).cell("Last name")).toHaveText("Deacon");
		await expect(table.cell(table.rows.locator.last(), "First name")).toHaveText("Logan");
		await expect(table.rowAt(0).cell("Last name")).toHaveText("Veth");
		await expect(table.rows.cell("First name")).toHaveText(["Ronald", "Logan"]);
		await expect(table.column("Date of birth")).toHaveText(["22-12-1987", "01-10-2002"]);
	});

	test("row() is strict when several rows match", async ({ page }) => {
		const users = await openUsers(page);

		const message = await errorMessage(() => users.row({ Status: "Active" }).cell("Name").textContent());
		expect(message).toContain("strict mode violation");
	});

	test("an unknown header matches nothing and times out mentioning pw-table", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = defineTable(page.locator("table"));

		const message = await errorMessage(() => expect(table.row({ Nope: "x" }).locator).toBeVisible({ timeout: 500 }));
		expect(message).toContain("pw-table");
	});

	test("reads innerText by default and textContent on request", async ({ page }) => {
		await page.setContent(`
			<table>
				<thead><tr><th>Name</th><th>Note</th></tr></thead>
				<tbody><tr><td>Ann<span style="display:none">Hidden</span></td><td>x</td></tr></tbody>
			</table>
		`);

		const byInnerText = defineTable(page.locator("table"));
		await expect(byInnerText.row({ Name: "Ann" }).cell("Note")).toHaveText("x");

		const byTextContent = defineTable(page.locator("table"), { cellContentType: CellContentType.TextContent });
		await expect(byTextContent.row({ Name: "AnnHidden" }).cell("Note")).toHaveText("x");
	});

	test("row() throws when no condition has a value", async ({ page }) => {
		const users = await openUsers(page);
		expect(() => users.row({ Name: undefined })).toThrow("requires at least one condition");
	});

	test("rowAt() rejects invalid indexes", async ({ page }) => {
		const users = await openUsers(page);
		expect(() => users.rowAt(-1)).toThrow("non-negative integer");
		expect(() => users.rowAt(1.5)).toThrow("non-negative integer");
	});

	test("registerTableSelectors() can be called repeatedly", async ({ playwright }) => {
		await registerTableSelectors(playwright.selectors);
		await registerTableSelectors(playwright.selectors);
		await registerTableSelectors();
	});
});

test.describe("TableLocator cell conditions", () => {
	test("compares collapsed and trimmed text", async ({ page }) => {
		const users = await openUsers(page);
		await expect(users.row({ Name: "  Joe   Bloggs " }).cell("Age")).toHaveText("65");
	});

	test("equals, contains, startsWith and endsWith, with ignoreCase", async ({ page }) => {
		const users = await openUsers(page);

		await expect(users.row({ Name: { equals: "JANE ROE", ignoreCase: true } }).cell("Age")).toHaveText("17");
		await expect(users.row({ Name: { equals: "JANE ROE" } }).locator).toHaveCount(0);
		await expect(users.row({ Email: { contains: "JANE", ignoreCase: true } }).cell("Name")).toHaveText("Jane Roe");
		await expect(users.row({ Email: { contains: "JANE" } }).locator).toHaveCount(0);
		await expect(users.row({ Name: { startsWith: "Jo" } }).locator).toHaveCount(2);
		await expect(users.row({ Email: { endsWith: "@example.com" } }).locator).toHaveCount(3);
		await expect(users.row({ Name: { endsWith: "bloggs", ignoreCase: true } }).cell("Age")).toHaveText("65");
	});

	test("oneOf", async ({ page }) => {
		const users = await openUsers(page);
		await expect(users.row({ Name: { oneOf: ["Jane Roe", "Nobody"] } }).cell("Age")).toHaveText("17");
	});

	test("empty", async ({ page }) => {
		const users = await openUsers(page);
		await expect(users.row({ Remarks: { empty: true } }).locator).toHaveCount(2);
	});

	test("predicate runs in the browser", async ({ page }) => {
		const users = await openUsers(page);

		await expect(users.row({ Age: { predicate: text => Number(text) < 18 } }).cell("Name")).toHaveText("Jane Roe");
		await expect(
			users
				.row({
					Age: {
						predicate(text) {
							return text === "42";
						},
					},
				})
				.cell("Name")
		).toHaveText("John Doe");
	});

	test("a throwing predicate matches nothing", async ({ page }) => {
		const users = await openUsers(page);
		const throwing = defineTable(page.locator("#users"));

		await expect(
			throwing.row({
				Age: {
					predicate: () => {
						throw new Error("boom");
					},
				},
			}).locator
		).toHaveCount(0);
		await expect(users.rows.locator).toHaveCount(3);
	});

	test("works on a page whose CSP forbids eval", async ({ page }) => {
		await page.route("**/strict-csp", route =>
			route.fulfill({
				body: usersTable,
				headers: { "content-type": "text/html", "content-security-policy": "script-src 'self'" },
			})
		);
		await page.goto("/strict-csp");
		const users = defineTable(page.locator("#users"), { headers: ["Name", "Age"] });

		await expect(users.row({ Name: "Jane Roe" }).cell("Age")).toHaveText("17");
		await expect(users.row({ Age: { predicate: text => Number(text) > 60 } }).cell("Name")).toHaveText("Joe Bloggs");
		expect(await users.headerKeys()).toEqual(["Name", "Status", "Email", "Age", "Remarks"]);
	});

	test("not, anyOf and allOf combine conditions", async ({ page }) => {
		const users = await openUsers(page);

		await expect(users.row({ Status: { not: "Active" } }).cell("Name")).toHaveText("Jane Roe");
		await expect(users.row({ Remarks: { not: { empty: true } } }).cell("Name")).toHaveText("Jane Roe");
		await expect(users.row({ Age: { anyOf: ["17", /^6\d$/] } }).locator).toHaveCount(2);
		await expect(
			users.row({ Name: { allOf: [{ startsWith: "Jo" }, { not: { contains: "doe", ignoreCase: true } }] } }).cell("Age")
		).toHaveText("65");
		await expect(
			users.row({ Age: { anyOf: [{ predicate: text => Number(text) > 60 }, { oneOf: ["42"] }] } }).locator
		).toHaveCount(2);
	});

	test("anyOf and allOf reject an empty list at runtime", async ({ page }) => {
		const users = defineTable((await openUsers(page)).root);
		const empty: never[] = [];
		// Untyped JS callers can still pass empty lists
		const anyOf = { anyOf: empty } as unknown as { anyOf: [string] };
		const allOf = { allOf: empty } as unknown as { allOf: [string] };
		expect(() => users.row({ Name: anyOf })).toThrow("anyOf needs at least one matcher");
		expect(() => users.row({ Name: allOf })).toThrow("allOf needs at least one matcher");
	});

	test("a RegExp containing >> does not break the selector", async ({ page }) => {
		const users = await openUsers(page);
		await expect(users.row({ Name: /x>>y|^Jane/ }).cell("Age")).toHaveText("17");
	});
});
