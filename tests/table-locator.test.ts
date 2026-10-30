import { Page } from "@playwright/test";
import {
	CellContentType,
	defineTable,
	expect,
	PlaywrightTable,
	registerTableSelectors,
	RowWhere,
	TableLocator,
	TableLocatorOptions,
	test,
} from "src";
import { normalizeCell } from "src/table-selector-engine";

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

async function openUsers(page: Page): Promise<TableLocator<"Name" | "Status" | "Email" | "Age" | "Remarks">> {
	await page.setContent(usersTable);
	return defineTable(page.locator("#users"), { headers: ["Name", "Status", "Email", "Age", "Remarks"] });
}

type DemoCase = {
	/** Selector of the table root. Defaults to `"table"`. */
	root?: string;
	// CSS selectors only, so PlaywrightTable can read the same table
	options?: TableLocatorOptions<string> & {
		header?: { rowSelector?: string; columnSelector?: string };
		row?: { rowSelector?: string; columnSelector?: string };
	};
	/** A row to wait for before reading, for tables that load late. */
	wait?: RowWhere<string>;
	/** The expected `toJson()`. Defaults to `PlaywrightTable.getJson()` with the same selectors. */
	expected?: Record<string, string>[];
};

/** One case per demo page, so every page is read by `TableLocator`. */
const demoCases: Record<Route, DemoCase> = {
	[Route.ButtonTable]: {},
	[Route.ColspanHeaderTable]: {},
	[Route.ColspanRowTable]: {},
	[Route.CombinedSpanTable]: {},
	[Route.DivTable]: {
		root: ".divTable",
		options: {
			header: { rowSelector: ".divTableHeading > .divTableRow", columnSelector: ".divTableHead" },
			row: { rowSelector: ".divTableBody > .divTableRow", columnSelector: ".divTableCell" },
		},
	},
	[Route.DuplicateEmptyHeadersTable]: {},
	[Route.DynamicLoadTable]: { root: "#DynamicTable", wait: { "Header 1": "Row 3 Col 1" } },
	[Route.EmptyHeaderRowsTable]: {},
	[Route.EmptyBodyRowsTable]: {},
	[Route.RowspanHeaderTable]: {},
	[Route.RowspanRowTable]: {},
	[Route.SimpleTable]: {},
	[Route.PrimitivesTable]: {},
	[Route.InnerTextTable]: {},
	// getJson() reads <td> cells only, so these pages have their own expectations
	[Route.RowHeaderTable]: {
		root: "#RowHeaderTable",
		expected: [
			{ "{{Empty}}": "North", Q1: "100", Q2: "200", Details: "Item Count\nBikes 3\nCars 4" },
			{ "{{Empty}}": "South", Q1: "300", Q2: "400", Details: "None" },
		],
	},
	[Route.AriaGridTable]: {
		root: "#Grid",
		options: { aria: true },
		expected: [
			{ Id: "1", Name: "John", Status: "Active" },
			{ Id: "2", Name: "Jane", Status: "Inactive" },
			{ Id: "3", Name: "Joe", Status: "Active" },
		],
	},
	[Route.SortableTable]: { root: "#SortableTable" },
	// The table is inside the shadow root of #Host; getJson() reaches it through Playwright CSS
	[Route.ShadowDomTable]: { root: "#Host" },
	[Route.RefreshingTable]: { root: "#Orders" },
};

async function errorMessage(action: () => Promise<unknown>): Promise<string> {
	try {
		await action();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("Expected the action to fail");
}

/** Locators read like the code that built them from Playwright 1.53, which added `locator.describe()`. */
function hasLocatorDescriptions(page: Page): boolean {
	return typeof (page.locator("body") as { describe?: unknown }).describe === "function";
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
				const email = row.children.item(2);
				if (email !== null) row.insertBefore(email, row.children.item(0));
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

	test("empty headers get {{Empty}} keys and still resolve by key or index", async ({ page }) => {
		await page.goto(Route.EmptyHeaderRowsTable);
		const table = defineTable(page.locator("table"));

		expect(await table.headerKeys()).toEqual(["{{Empty}}", "{{Empty}}__D1", "{{Empty}}__D2"]);
		await expect(table.row({ "{{Empty}}": "Headers" }).cell("{{Empty}}__D2")).toHaveText("Empty");
		await expect(table.rowAt(0).cell(1)).toHaveText("Are");
		await expect(table.header("{{Empty}}__D1")).toHaveText("");
	});

	test("rows without content are still rows", async ({ page }) => {
		await page.goto(Route.EmptyBodyRowsTable);
		const table = defineTable(page.locator("table"), { headers: ["Rows", "Are", "Empty"] });

		await expect(table).toHaveRowCount(2);
		await expect(table.row({ Rows: { empty: true }, Empty: { empty: true } }).locator).toHaveCount(2);
		await expect(table).toHaveRows([{ Are: { empty: true } }, {}]);
		await expect(table).not.toHaveRow({ Rows: { not: { empty: true } } });
		const message = await errorMessage(() => table.toJson({ minRows: 1, timeout: 300 }));
		expect(message).toContain("found 0 (2 body rows in total)");
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

	test("an unknown header matches nothing and times out with a readable locator", async ({ page }) => {
		await page.goto(Route.SimpleTable);
		const table = defineTable(page.locator("table"));

		const message = await errorMessage(() => expect(table.row({ Nope: "x" }).locator).toBeVisible({ timeout: 500 }));
		if (hasLocatorDescriptions(page)) {
			expect(message).toContain(`Locator: locator('table').row({ "Nope": "x" })`);
		}
		// The call log shows the selector itself; default options are left out of it
		expect(message).toContain(`"cfg":{}`);
		expect(message).not.toContain("tbody:first-of-type");
	});

	test("locators read like the code that built them", async ({ page }) => {
		test.skip(!hasLocatorDescriptions(page), "Locator descriptions need Playwright 1.53");
		const users = await openUsers(page);
		const root = "locator('#users')";

		expect(users.rows.locator.toString()).toBe(`${root}.rows`);
		expect(users.rowAt(1).cell("Email").toString()).toBe(`${root}.rowAt(1).cell("Email")`);
		expect(users.row({ Name: /^jo/i, Age: { oneOf: ["42"] } }).locator.toString()).toBe(
			`${root}.row({ "Name": /^jo/i, "Age": {"oneOf":["42"]} })`
		);
		expect(users.row({ Status: "Active" }).nth(1).cell(0).toString()).toBe(
			`${root}.row({ "Status": "Active" }).nth(1).cell(0)`
		);
		expect(users.rows.filter({ hasText: "Jane" }).first().cell("Age").toString()).toBe(
			`${root}.rows.filter({ hasText: "Jane" }).first().cell("Age")`
		);
		expect(users.rows.last().locator.toString()).toBe(`${root}.rows.last()`);
		expect(users.column("Status").toString()).toBe(`${root}.column("Status")`);
		expect(users.header("Name").toString()).toBe(`${root}.header("Name")`);
		expect(users.cell(page.locator("#users tbody tr").first(), "Email").toString()).toBe(
			`locator('#users tbody tr').first().cell("Email")`
		);

		// The descriptions don't change what the locators resolve to
		await expect(users.rows.filter({ hasText: "Jane" }).first().cell("Age")).toHaveText("17");
		await expect(users.row({ Status: "Active" }).nth(1).cell(0)).toHaveText("Joe Bloggs");
		await expect(users.rows.last().locator.filter({ hasText: "Joe" })).toHaveCount(1);

		const message = await errorMessage(() =>
			expect(users.row({ Name: "Ghost" }).cell("Status")).toHaveText("x", { timeout: 500 })
		);
		expect(message).toContain(`Locator: ${root}.row({ "Name": "Ghost" }).cell("Status")`);
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

	test("a throwing predicate also fails the row inside not and anyOf", async ({ page }) => {
		const users = await openUsers(page);
		const broken = {
			predicate: (): boolean => {
				throw new Error("boom");
			},
		};

		await expect(users.row({ Age: { not: broken } }).locator).toHaveCount(0);
		await expect(users.row({ Age: { anyOf: [broken, "42"] } }).locator).toHaveCount(0);
	});

	test("a bound or built-in predicate is rejected up front", async ({ page }) => {
		const users = await openUsers(page);
		const isAdult = function (text: string): boolean {
			return Number(text) >= 18;
		}.bind(null);

		expect(() => users.row({ Age: { predicate: isAdult } })).toThrow("not a bound or built-in one");
		expect(() => users.row({ Age: { predicate: Boolean } })).toThrow("not a bound or built-in one");
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

test.describe("TableLocator column indexes", () => {
	const headerlessTable = `
		<table id="plain">
			<tbody>
				<tr><td>John</td><td>Active</td><td>john@example.com</td></tr>
				<tr><td>Jane</td><td>Inactive</td><td>jane@example.com</td></tr>
			</tbody>
		</table>
	`;

	test("resolves cells and columns by index", async ({ page }) => {
		const users = await openUsers(page);

		await expect(users.row({ Name: "Jane Roe" }).cell(2)).toHaveText("jane@example.com");
		await expect(users.cell(users.rows.locator.last(), 3)).toHaveText("65");
		await expect(users.column(1)).toHaveText(["Active", "Inactive", "Active"]);
		await expect(users.header(4)).toHaveText("Remarks");
	});

	test("column indexes follow the visual grid with spans", async ({ page }) => {
		await page.goto(Route.CombinedSpanTable);
		const table = defineTable(page.locator("table"), { headers: ["Region", "Q1", "Q2", "Q3", "Q4"] });

		const south = table.row({ Region: "South" });
		await expect(south.cell(2)).toHaveText("Combined N+S Q1-Q2");
		await expect(south.cell(3)).toHaveText("350");
		await expect(table.column(2)).toHaveCount(await table.column("Q2").count());
	});

	test("works on a table without header rows", async ({ page }) => {
		await page.setContent(headerlessTable);
		const table = defineTable(page.locator("#plain"));

		await expect(table.rowAt(1).cell(0)).toHaveText("Jane");
		await expect(table.rows.cell(1)).toHaveText(["Active", "Inactive"]);
		await expect(table.column(2)).toHaveText(["john@example.com", "jane@example.com"]);
		await expect(table.rows.filter({ hasText: "Jane" }).cell(2)).toHaveText("jane@example.com");
		await expect(table).toHaveRowCount(2);
		expect(await table.headerKeys()).toEqual([]);
		await expect(table.header(0)).toHaveCount(0);
		await expect(table.rowAt(0).cell("Name")).toHaveCount(0);
	});

	test("leading rows of th cells in a table without thead are header rows", async ({ page }) => {
		await page.setContent(`
			<table id="no-thead"><tbody>
				<tr><th colspan="2">Person</th><th>Contact</th></tr>
				<tr><th>Name</th><th>Status</th><th>Email</th></tr>
				<tr><td>John</td><td>Active</td><td>john@example.com</td></tr>
				<tr><th>Jane</th><td>Inactive</td><td>jane@example.com</td></tr>
			</tbody></table>
		`);
		const table = defineTable(page.locator("#no-thead"));

		expect(await table.headerKeys()).toEqual(["Name", "Status", "Email"]);
		await expect(table).toHaveRowCount(2);
		await expect(table.row({ Name: "Jane" }).cell("Email")).toHaveText("jane@example.com");
		expect(await table.toJson()).toEqual([
			{ Name: "John", Status: "Active", Email: "john@example.com" },
			{ Name: "Jane", Status: "Inactive", Email: "jane@example.com" },
		]);
	});

	test("a th row after a data row stays a body row", async ({ page }) => {
		await page.setContent(`
			<table id="t"><tbody>
				<tr><td>John</td><td>Active</td></tr>
				<tr><th>Subtotal</th><th>1</th></tr>
			</tbody></table>
		`);
		const table = defineTable(page.locator("#t"));

		expect(await table.headerKeys()).toEqual([]);
		await expect(table).toHaveRowCount(2);
	});

	test("an index past the last column matches nothing", async ({ page }) => {
		const users = await openUsers(page);

		await expect(users.rowAt(0).cell(5)).toHaveCount(0);
		await expect(users.column(99)).toHaveCount(0);
	});

	test("rejects invalid column indexes", async ({ page }) => {
		const users = await openUsers(page);

		expect(() => users.rowAt(0).cell(-1)).toThrow("non-negative integer");
		expect(() => users.column(1.5)).toThrow("non-negative integer");
		expect(() => users.header(-2)).toThrow("non-negative integer");
	});
});

test.describe("TableLocator row headers and nested tables", () => {
	test("row header cells and a td corner cell are columns", async ({ page }) => {
		await page.goto(Route.RowHeaderTable);
		const table = defineTable(page.locator("#RowHeaderTable"), { headers: ["{{Empty}}", "Q1", "Q2", "Details"] });

		expect(await table.headerKeys()).toEqual(["{{Empty}}", "Q1", "Q2", "Details"]);
		await expect(table.row({ "{{Empty}}": "South" }).cell("Q2")).toHaveText("400");
		await expect(table.row({ Q1: "100" }).cell(0)).toHaveText("North");
		await expect(table.column("{{Empty}}")).toHaveText(["North", "South"]);
		await expect(table.header("Q1")).toHaveText("Q1");
	});

	test("rows and cells of a nested table don't belong to the outer table", async ({ page }) => {
		await page.goto(Route.RowHeaderTable);
		const outer = defineTable(page.locator("#RowHeaderTable"));

		await expect(outer).toHaveRowCount(2);
		await expect(outer.rows.locator).toHaveCount(2);
		await expect(outer.rowAt(1).cell("Q1")).toHaveText("300");
		await expect(outer.column(1)).toHaveText(["100", "300"]);
		await expect(outer).not.toHaveRow({ Q1: "Bikes" });
		await expect(outer.row({ "{{Empty}}": "North" }).cell("Details")).toContainText("Bikes");
	});

	test("a nested table is a table of its own", async ({ page }) => {
		await page.goto(Route.RowHeaderTable);
		const nested = defineTable(page.locator("table.nested"), { headers: ["Item", "Count"] });

		await expect(nested.row({ Item: "Cars" }).cell("Count")).toHaveText("4");
		await expect(nested.rowAt(0).cell(1)).toHaveText("3");
		await expect(nested).toHaveRows([{ Item: "Bikes" }, { Item: "Cars" }]);
		expect(await nested.toJson()).toEqual([
			{ Item: "Bikes", Count: "3" },
			{ Item: "Cars", Count: "4" },
		]);
	});
});

test.describe("TableLocator selector descriptors", () => {
	test("finds rows and cells by the role of HTML table elements", async ({ page }) => {
		await page.goto(Route.RowHeaderTable);
		const table = defineTable(page.locator("#RowHeaderTable"), {
			header: { rowSelector: { css: "thead>tr", role: "row" }, columnSelector: { role: ["columnheader", "cell"] } },
			row: { rowSelector: { css: "tbody>tr" }, columnSelector: { role: ["cell", "rowheader"] } },
		});

		expect(await table.headerKeys()).toEqual(["{{Empty}}", "Q1", "Q2", "Details"]);
		await expect(table.row({ "{{Empty}}": "South" }).cell("Q2")).toHaveText("400");
		// The rows of the nested table are inside a cell, so they are not rows of this table
		await expect(table).toHaveRowCount(2);
		await expect(table.column("Q1")).toHaveText(["100", "300"]);
		// <th scope="row"> is a row header, not a column header
		const columnHeaders = defineTable(page.locator("#RowHeaderTable"), {
			row: { rowSelector: { css: "tbody>tr" }, columnSelector: { role: "columnheader" } },
		});
		await expect(columnHeaders.rowAt(0).cell(0)).toHaveCount(0);
	});

	test("an explicit role wins, and rows can be told apart by their text", async ({ page }) => {
		await page.setContent(`
			<table id="t">
				<thead><tr><th>Name</th><th>Status</th></tr></thead>
				<tbody>
					<tr><td>John</td><td>Active</td></tr>
					<tr role="presentation"><td>spacer</td><td></td></tr>
					<tr id="pending"><td>Loading...</td><td></td></tr>
					<tr><td>Jane</td><td>Inactive</td></tr>
				</tbody>
			</table>
		`);
		const table = defineTable(page.locator("#t"), {
			headers: ["Name", "Status"],
			row: { rowSelector: { css: "tbody>tr", role: "row", hasNotText: /^loading/i } },
		});

		expect(await table.toJson()).toEqual([
			{ Name: "John", Status: "Active" },
			{ Name: "Jane", Status: "Inactive" },
		]);
		await expect(table.row({ Name: "Jane" }).cell("Status")).toHaveText("Inactive");
		// The locators resolve again on every retry, so the row counts once it has loaded
		await page.locator("#pending").evaluate(row => (row.innerHTML = "<td>Joe</td><td>Active</td>"));
		await expect(table).toHaveRowCount(3);
		await expect(table.row({ Name: "Joe" }).cell("Status")).toHaveText("Active");
	});

	test("a cell of a grid table is a gridcell", async ({ page }) => {
		await page.setContent(`
			<table id="t" role="grid">
				<thead><tr><th>Name</th></tr></thead>
				<tbody><tr><td>John</td></tr></tbody>
			</table>
		`);
		const grid = defineTable(page.locator("#t"), { row: { columnSelector: { role: "gridcell" } } });
		const notCells = defineTable(page.locator("#t"), { row: { columnSelector: { role: "cell" } } });

		await expect(grid.column("Name")).toHaveText(["John"]);
		await expect(notCells.column("Name")).toHaveCount(0);
	});

	test("emptyRow and ignore take descriptors", async ({ page }) => {
		await page.setContent(`
			<table id="t">
				<thead><tr><th>Name <span>sort ascending</span></th><th>Status <span>(filtered)</span></th></tr></thead>
				<tbody><tr><td colspan="2">No data</td></tr></tbody>
			</table>
		`);
		const options: TableLocatorOptions<string> = {
			emptyRow: { hasText: "no DATA" },
			ignore: [{ css: "span", hasText: /^sort/ }],
		};
		const table = defineTable(page.locator("#t"), options);
		const textContent = defineTable(page.locator("#t"), { ...options, cellContentType: CellContentType.TextContent });

		expect(await table.headerKeys()).toEqual(["Name", "Status (filtered)"]);
		expect(await textContent.headerKeys()).toEqual(["Name", "Status (filtered)"]);
		await expect(table).toHaveRowCount(0, { timeout: 200 });
		await page.locator("tbody").evaluate(body => (body.innerHTML = "<tr><td>John</td><td>Active</td></tr>"));
		expect(await table.toJson()).toEqual([{ Name: "John", "Status (filtered)": "Active" }]);
	});

	test("invalid descriptors fail when the table is defined", ({ page }) => {
		const root = page.locator("table");

		expect(() => defineTable(root, { emptyRow: {} })).toThrow("emptyRow is an empty descriptor");
		expect(() => defineTable(root, { row: { rowSelector: root.locator("tr") as never } })).toThrow(
			"A Playwright Locator can't be used here"
		);
		expect(() => defineTable(root, { header: { columnSelector: { role: [] as never } } })).toThrow(
			"header.columnSelector: role must be a role"
		);
		expect(() => defineTable(root, { ignore: [".x", { css: " " }] })).toThrow(
			"ignore[1]: css must be a non-empty CSS selector"
		);
		expect(() => defineTable(root, { footer: { rowSelector: { hasText: 5 as never } } })).toThrow(
			"footer.rowSelector: hasText must be a string or a RegExp"
		);
	});
});

test.describe("TableLocator with several tables on a page", () => {
	const twoTables = `
		<table id="a">
			<thead><tr><th>Name</th><th>Status</th></tr></thead>
			<tbody><tr><td>John</td><td>Active</td></tr></tbody>
		</table>
		<table id="b">
			<tbody><tr><td>x</td><td>y</td></tr></tbody>
		</table>
	`;

	test("a cell of a headerless table never resolves through another table's header", async ({ page }) => {
		await page.setContent(twoTables);
		const b = defineTable(page.locator("#b"));

		await expect(b.rowAt(0).cell("Name")).toHaveCount(0);
		await expect(b.rowAt(0).cell(1)).toHaveText("y");
	});

	test("a cell waits for the header of its own table, not another one", async ({ page }) => {
		await page.setContent(`
			${twoTables}
			<table id="late">
				<thead></thead>
				<tbody><tr><td>Late</td><td>Pending</td></tr></tbody>
			</table>
		`);
		const late = defineTable(page.locator("#late"), { headers: ["Name", "Status"] });

		await expect(late.rowAt(0).cell("Status")).toHaveCount(0);
		await page.evaluate(() => {
			document.querySelector("#late thead")!.innerHTML = "<tr><th>Status</th><th>Name</th></tr>";
		});
		await expect(late.rowAt(0).cell("Status")).toHaveText("Late");
	});
});

test.describe("TableLocator ARIA grids", () => {
	async function openGrid(page: Page): Promise<TableLocator<"Id" | "Name" | "Status" | "Email">> {
		await page.goto(Route.AriaGridTable);
		return defineTable(page.locator("#Grid"), { aria: true, headers: ["Id", "Name", "Status", "Email"] });
	}

	test("merges rows split over pinned containers by aria-rowindex", async ({ page }) => {
		const grid = await openGrid(page);

		await expect(grid).toHaveHeaders(["Id", "Name", "Status"], { exact: true });
		await expect(grid).toHaveRowCount(3);
		await expect(grid.row({ Id: "2" }).cell("Name")).toHaveText("Jane");
		await expect(grid.row({ Name: "Jane" }).cell("Id")).toHaveText("2");
		await expect(grid.row({ Id: "2", Status: "Inactive" })).toHaveCells({ Name: "Jane" });
	});

	test("orders rows by aria-rowindex, not by DOM order", async ({ page }) => {
		const grid = await openGrid(page);

		await expect(grid.column("Name")).toHaveText(["John", "Jane", "Joe"]);
		await expect(grid.column("Id")).toHaveText(["1", "2", "3"]);
		await expect(grid.rowAt(0).cell("Name")).toHaveText("John");
		await expect(grid.rows.last().cell("Id")).toHaveText("3");
		await expect(grid).toHaveRows([{ Id: "1" }, { Id: "2" }, { Id: "3" }]);
	});

	test("places cells by aria-colindex when columns are virtualized", async ({ page }) => {
		const grid = await openGrid(page);
		await expect(grid.row({ Id: "2" }).cell("Email")).toHaveCount(0);

		await page.locator("#ScrollRight").click();

		// Name is now scrolled out, so its column is empty, but Status and Email keep their columns
		await expect(grid.row({ Id: "2" }).cell("Email")).toHaveText("jane@example.com");
		await expect(grid.row({ Id: "2" }).cell(2)).toHaveText("Inactive");
		await expect(grid.row({ Id: "2" }).cell(1)).toHaveCount(0);
		expect(await grid.headerKeys()).toEqual(["Id", "{{Empty}}", "Status", "Email"]);
	});

	test("rows of an empty pinned container that share a header aria-rowindex are not body rows", async ({ page }) => {
		const grid = await openGrid(page);

		await expect(grid.rows.locator).toHaveCount(3);
		await expect(grid.rowAt(0).cell("Id")).toHaveText("1");
		expect((await grid.toJson()).map(row => row.Id)).toEqual(["1", "2", "3"]);
	});

	test("explicit selectors win over the aria defaults", async ({ page }) => {
		await page.goto(Route.AriaGridTable);
		const centerOnly = defineTable(page.locator("#Grid .center"), {
			aria: true,
			header: { rowSelector: ".header [role=row]" },
			row: { rowSelector: ".body [role=row]" },
		});

		expect(await centerOnly.headerKeys()).toEqual(["{{Empty}}", "Name", "Status"]);
		await expect(centerOnly.row({ Name: "Joe" }).cell("Status")).toHaveText("Active");
	});
});

test.describe("TableLocator shadow DOM", () => {
	test("finds rows, cells, columns and headers inside the shadow root of the root element", async ({ page }) => {
		await page.goto(Route.ShadowDomTable);
		const users = defineTable(page.locator("#Host"), { headers: ["Name", "Email", "Status", "Orders"] });

		expect(await users.headerKeys()).toEqual(["Name", "Email", "Status", "Orders"]);
		await expect(users.row({ Name: "Jane" }).cell("Email")).toHaveText("jane@example.com");
		await expect(users.row({ Name: "Jane" }).cell("Status")).toHaveText("Active");
		await expect(users.rowAt(2).cell(2)).toHaveText("Inactive");
		await expect(users.cell(users.rows.locator.last(), "Orders")).toHaveText("7");
		await expect(users.column("Name")).toHaveText(["John", "Jane", "Joe"]);
		await expect(users.header("Orders")).toHaveText("Orders");
		await expect(users).toHaveRows([{ Name: "John" }, { Name: "Jane", Status: "Active" }, { Status: "Inactive" }]);
		await expect(users.row({ Name: "Joe" })).toHaveCells({ Orders: "7" });
	});

	test("finds a table inside nested shadow roots", async ({ page }) => {
		await page.goto(Route.ShadowDomTable);
		const cities = defineTable(page.locator("#OuterHost"), { headers: ["Id", "City"] });

		await expect(cities).toHaveRowCount(3);
		await expect(cities.row({ City: "Berlin" }).cell("Id")).toHaveText("2");
		await expect(cities).toBeSortedBy("Id", { type: "number" });
		await expect(cities).toBeSortedBy("City");
		expect(await cities.toJson()).toEqual([
			{ Id: "1", City: "Amsterdam" },
			{ Id: "2", City: "Berlin" },
			{ Id: "3", City: "Copenhagen" },
		]);
	});

	test("a table in the shadow root of a cell is not part of the outer table", async ({ page }) => {
		await page.goto(Route.ShadowDomTable);
		const orders = defineTable(page.locator("#NestedHost"), { headers: ["Order", "Items"] });
		const items = defineTable(page.locator("#NestedHost #Items"), { headers: ["Item", "Count"] });

		await expect(orders).toHaveRowCount(2);
		await expect(orders.column("Order")).toHaveText(["A-1", "A-2"]);
		await expect(orders).not.toHaveRow({ Order: "Bikes" });
		await expect(items.row({ Item: "Cars" }).cell("Count")).toHaveText("4");
		await expect(items).toHaveRowCount(2);
	});
});

test.describe("TableRow first, last and nth", () => {
	test("pick one of several rows with typed cells", async ({ page }) => {
		const users = await openUsers(page);
		const active = users.row({ Status: "Active" });

		await expect(active.first().cell("Name")).toHaveText("John Doe");
		await expect(active.last().cell("Name")).toHaveText("Joe Bloggs");
		await expect(active.nth(1).cell("Age")).toHaveText("65");
		await expect(users.rows.nth(-1).cell("Name")).toHaveText("Joe Bloggs");
		await expect(users.rows.filter({ hasText: "Active" }).first()).toHaveCells({ Name: "John Doe" });
	});

	test("nth() rejects a non-integer index", async ({ page }) => {
		const users = await openUsers(page);
		expect(() => users.rows.nth(0.5)).toThrow("must be an integer");
	});
});

test.describe("TableLocator icon glyphs", () => {
	test("icon font glyphs are always removed from header keys", async ({ page }) => {
		await page.setContent(`
			<table>
				<thead><tr><th>Name <span class="icon">&#xE5CF;</span></th><th>&#xF0DC;Status</th></tr></thead>
				<tbody><tr><td>John</td><td>Active</td></tr></tbody>
			</table>
		`);
		const table = defineTable(page.locator("table"), { headers: ["Name", "Status"] });

		expect(await table.headerKeys()).toEqual(["Name", "Status"]);
		await expect(table.row({ Name: "John" }).cell("Status")).toHaveText("Active");
		await expect(table.header("Status")).toContainText("Status");
	});

	test("a header that is only a glyph becomes {{Empty}}", async ({ page }) => {
		await page.setContent(`
			<table>
				<thead><tr><th>Name</th><th>&#xE872;</th></tr></thead>
				<tbody><tr><td>John</td><td>x</td></tr></tbody>
			</table>
		`);
		const table = defineTable(page.locator("table"));

		expect(await table.headerKeys()).toEqual(["Name", "{{Empty}}"]);
	});
});

test.describe("TableLocator toJson", () => {
	test("reads every body row by header key", async ({ page }) => {
		const users = await openUsers(page);

		expect(await users.toJson()).toEqual([
			{ Name: "John Doe", Status: "Active", Email: "john@example.com", Age: "42", Remarks: "" },
			{ Name: "Jane Roe", Status: "Inactive", Email: "jane@example.com", Age: "17", Remarks: "New" },
			{ Name: "Joe Bloggs", Status: "Active", Email: "joe@example.com", Age: "65", Remarks: "" },
		]);
	});

	test("every demo page has a TableLocator case", () => {
		expect(Object.keys(demoCases).sort()).toEqual(Object.values(Route).sort());
	});

	for (const [route, demo] of Object.entries(demoCases)) {
		test(`reads ${route} like getJson()`, async ({ page }) => {
			await page.goto(route);
			const root = page.locator(demo.root ?? "table");
			const table = defineTable(root, demo.options);
			if (demo.wait) await expect(table).toHaveRow(demo.wait);

			const expected =
				demo.expected ??
				(await new PlaywrightTable(root, { header: demo.options?.header, row: demo.options?.row }).getJson()).map(row =>
					Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeCell(value)]))
				);

			expect(await table.toJson()).toEqual(expected);
			await expect(table).toHaveRowCount(expected.length);
		});
	}

	test("returns an empty array when there are no body rows", async ({ page }) => {
		await page.setContent("<table><thead><tr><th>Name</th></tr></thead><tbody></tbody></table>");
		expect(await defineTable(page.locator("table")).toJson()).toEqual([]);
	});

	test("minRows waits for a late table", async ({ page }) => {
		await page.goto(Route.DynamicLoadTable);
		const table = defineTable(page.locator("#DynamicTable"));

		const data = await table.toJson({ minRows: 1, timeout: 10_000 });
		expect(data[0]).toEqual({ "Header 1": "Row 1 Col 1", "Header 2": "Row 1 Col 2", "Header 3": "Row 1 Col 3" });
	});

	test("minRows does not count rows without content", async ({ page }) => {
		await page.setContent(`
			<table id="loading">
				<thead><tr><th>Name</th><th>Status</th></tr></thead>
				<tbody><tr><td></td><td></td></tr></tbody>
			</table>
		`);
		await page.evaluate(() => {
			setTimeout(() => {
				const tbody = document.querySelector("#loading tbody");
				if (tbody) tbody.innerHTML = "<tr><td>John</td><td>Active</td></tr><tr><td>Jane</td><td></td></tr>";
			}, 300);
		});

		const data = await defineTable(page.locator("#loading")).toJson({ minRows: 2 });
		expect(data).toEqual([
			{ Name: "John", Status: "Active" },
			{ Name: "Jane", Status: "" },
		]);
	});

	test("minRows fails with the rows that were found", async ({ page }) => {
		await page.setContent(`
			<table id="few">
				<thead><tr><th>Name</th></tr></thead>
				<tbody><tr><td>John</td></tr><tr><td></td></tr></tbody>
			</table>
		`);
		const table = defineTable(page.locator("#few"));

		const message = await errorMessage(() => table.toJson({ minRows: 2, timeout: 300 }));
		expect(message).toContain("expected at least 2 body rows with content, found 1 (2 body rows in total)");
		expect(message).toContain("Header keys: [Name]");
		expect(message).toContain("#few");
		expect(message).toContain("Timeout: 300ms");
	});

	test("minRows fails clearly for a table without header rows", async ({ page }) => {
		await page.setContent(`<table id="plain"><tbody><tr><td>x</td></tr></tbody></table>`);

		const message = await errorMessage(() => defineTable(page.locator("#plain")).toJson({ minRows: 1, timeout: 300 }));
		expect(message).toContain("the table has no header row");
	});

	test("minRows must be a non-negative integer", async ({ page }) => {
		const users = await openUsers(page);

		await expect(users.toJson({ minRows: -1 })).rejects.toThrow("non-negative integer");
		await expect(users.toJson({ minRows: 1.5 })).rejects.toThrow("non-negative integer");
		expect(await users.toJson({ minRows: 0 })).toHaveLength(3);
	});

	test("throws for a table without header rows", async ({ page }) => {
		await page.setContent(`<table id="plain"><tbody><tr><td>x</td></tr></tbody></table>`);
		const message = await errorMessage(() => defineTable(page.locator("#plain")).toJson());
		expect(message).toContain("needs a header row");
		expect(message).toContain("#plain");
	});
});
