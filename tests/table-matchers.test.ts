import { expect as baseExpect, mergeExpects, Page } from "@playwright/test";
import { defineTable, expect, TableLocator, tableMatchers, test } from "src";

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

async function openUsers(page: Page) {
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
