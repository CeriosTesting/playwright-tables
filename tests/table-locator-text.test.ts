import { Page } from "@playwright/test";
import { CellContentType, DEFAULT_IGNORE, defineTable, expect, test } from "src";

const contentTypes = [CellContentType.InnerText, CellContentType.TextContent];

/** Screen reader only text, like Bootstrap `.visually-hidden` and Tailwind `sr-only`. */
const srOnlyStyle = `
	<style>
		.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	</style>
`;

async function errorMessage(action: () => Promise<unknown>): Promise<string> {
	try {
		await action();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("Expected the action to fail");
}

async function openAddresses(page: Page): Promise<void> {
	await page.setContent(`
		<table id="addresses">
			<thead><tr><th>Name</th><th>Address</th></tr></thead>
			<tbody>
				<tr><td>John
					Doe</td><td>Street 1<br>Amsterdam</td></tr>
				<tr><td>Jane</td><td><div>Street 2</div><div>Utrecht</div></td></tr>
				<tr><td>Joe</td><td>  Street 3<br><br>   Rotterdam  </td></tr>
			</tbody>
		</table>
	`);
}

test.describe("TableLocator header text is one line", () => {
	for (const cellContentType of contentTypes) {
		test(`line breaks, tabs and non-breaking spaces become one space (${cellContentType})`, async ({ page }) => {
			await page.setContent(`
				<table>
					<thead><tr>
						<th>First<br>name</th>
						<th>Date of
								birth</th>
						<th><div>Postal</div><div>code</div></th>
						<th>Phone&nbsp;&nbsp;number</th>
						<th><p>Total</p><p>(incl. VAT)</p></th>
					</tr></thead>
					<tbody><tr><td>John</td><td>1990</td><td>1234 AB</td><td>06</td><td>10</td></tr></tbody>
				</table>
			`);
			const table = defineTable(page.locator("table"), { cellContentType });

			expect(await table.headerKeys()).toEqual([
				"First name",
				"Date of birth",
				"Postal code",
				"Phone number",
				"Total (incl. VAT)",
			]);
		});
	}

	test("a hidden table reads its headers on one line too", async ({ page }) => {
		await page.setContent(`
			<table style="display: none">
				<thead><tr><th>First<br>name</th><th><div>Postal</div><div>code</div></th></tr></thead>
				<tbody><tr><td>Street 1<br>Amsterdam</td><td>1234 AB</td></tr></tbody>
			</table>
		`);
		const table = defineTable(page.locator("table"));

		expect(await table.headerKeys()).toEqual(["First name", "Postal code"]);
		expect(await table.toJson()).toEqual([{ "First name": "Street 1\nAmsterdam", "Postal code": "1234 AB" }]);
	});

	test("CSS text-transform is kept, as the user sees it", async ({ page }) => {
		await page.setContent(`
			${srOnlyStyle}
			<table>
				<thead><tr>
					<th style="text-transform: uppercase">Name</th>
					<th style="text-transform: uppercase">Status<span class="sr-only">, sortable</span></th>
				</tr></thead>
				<tbody><tr><td>John</td><td>Active</td></tr></tbody>
			</table>
		`);
		const table = defineTable(page.locator("table"));

		expect(await table.headerKeys()).toEqual(["NAME", "STATUS"]);
	});
});

test.describe("TableLocator body cells keep line breaks", () => {
	for (const cellContentType of contentTypes) {
		test(`one \\n between trimmed lines (${cellContentType})`, async ({ page }) => {
			await openAddresses(page);
			const table = defineTable(page.locator("#addresses"), { cellContentType });

			expect(await table.toJson()).toEqual([
				{ Name: "John Doe", Address: "Street 1\nAmsterdam" },
				{ Name: "Jane", Address: "Street 2\nUtrecht" },
				{ Name: "Joe", Address: "Street 3\nRotterdam" },
			]);
		});
	}

	test("conditions compare against the text with its line breaks", async ({ page }) => {
		await openAddresses(page);
		const table = defineTable(page.locator("#addresses"), { headers: ["Name", "Address"] });

		// The expected value is normalized the same way, so \r\n and spaces around the break are fine
		await expect(table.row({ Address: "Street 1\r\nAmsterdam" }).cell("Name")).toHaveText("John Doe");
		await expect(table.row({ Address: "  Street 2 \n\n Utrecht " }).cell("Name")).toHaveText("Jane");
		await expect(table.row({ Address: "Street 1 Amsterdam" }).locator).toHaveCount(0);
		await expect(table.row({ Address: { contains: "Rotterdam" } }).cell("Name")).toHaveText("Joe");
		await expect(table.row({ Address: /^Utrecht$/m }).cell("Name")).toHaveText("Jane");
		await expect(table.row({ Address: { oneOf: ["Street 3\nRotterdam"] } }).cell("Name")).toHaveText("Joe");
		await expect(table).toHaveRow({ Name: "John Doe", Address: { endsWith: "\nAmsterdam" } });
		await expect(table).toHaveRows([
			{ Address: "Street 1\nAmsterdam" },
			{ Address: "Street 2\nUtrecht" },
			{ Address: "Street 3\nRotterdam" },
		]);
		await expect(table.row({ Name: "Jane" })).toHaveCells({ Address: "Street 2\nUtrecht" });
	});

	test("failure messages show the line breaks", async ({ page }) => {
		await openAddresses(page);
		const table = defineTable(page.locator("#addresses"));

		const cells = await errorMessage(() =>
			expect(table.row({ Name: "John Doe" })).toHaveCells({ Address: "Amsterdam" }, { timeout: 2_000 })
		);
		expect(cells).toContain(`"Address": "Street 1\\nAmsterdam"`);

		const rows = await errorMessage(() => expect(table).toHaveRows([{ Address: "x" }, {}, {}], { timeout: 2_000 }));
		expect(rows).toContain(`"Address": "Street 1\\nAmsterdam"`);
	});
});

test.describe("TableLocator text is read as the user sees it", () => {
	test("invisible characters are removed, symbols and emoji stay", async ({ page }) => {
		await page.setContent(`
			<table>
				<thead><tr>
					<th>Verzekerings&shy;nummer</th>
					<th>Zero&#8203;width</th>
					<th>&#x200E;Amount&#xFEFF;</th>
					<th>Temp (°C)</th>
				</tr></thead>
				<tbody><tr>
					<td>12&shy;34</td>
					<td>&#x1F468;&#x200D;&#x1F469;&#x200D;&#x1F467; ✓</td>
					<td>€&nbsp;5</td>
					<td>21°</td>
				</tr></tbody>
			</table>
		`);
		const table = defineTable(page.locator("table"));

		expect(await table.headerKeys()).toEqual(["Verzekeringsnummer", "Zerowidth", "Amount", "Temp (°C)"]);
		expect(await table.toJson()).toEqual([
			{
				Verzekeringsnummer: "1234",
				Zerowidth: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467} ✓",
				Amount: "€ 5",
				"Temp (°C)": "21°",
			},
		]);
		await expect(table.row({ Amount: "€ 5" }).cell("Verzekeringsnummer")).toHaveText("1234");
	});

	test("accents are composed (NFC), in the page and in your conditions", async ({ page }) => {
		await page.setContent(`
			<table>
				<thead><tr><th>Cafe&#x301;</th><th>Stad</th></tr></thead>
				<tbody><tr><td>Cre&#x300;me</td><td>Utrecht</td></tr></tbody>
			</table>
		`);
		const table = defineTable(page.locator("table"));

		expect(await table.headerKeys()).toEqual(["Caf\u00E9", "Stad"]);
		await expect(table.row({ "Caf\u00E9": "Cr\u00E8me" }).cell("Stad")).toHaveText("Utrecht");
		await expect(table.row({ "Cafe\u0301": "Cre\u0300me" }).cell("Stad")).toHaveText("Utrecht");
	});

	for (const cellContentType of contentTypes) {
		test(`icon glyphs and ignored elements are left out (${cellContentType})`, async ({ page }) => {
			await page.setContent(`
				${srOnlyStyle}
				<table>
					<thead><tr>
						<th>Name <span class="material-icons">arrow_upward</span><span class="sr-only">, sorted ascending</span></th>
						<th>&#xF0DC;Status <span aria-hidden="true">▲</span></th>
					</tr></thead>
					<tbody><tr>
						<td>John<span class="visually-hidden"> (admin)</span></td>
						<td><span class="material-symbols-outlined">check_circle</span> &#xE5CA;<b>Active</b></td>
					</tr></tbody>
				</table>
			`);
			const table = defineTable(page.locator("table"), { cellContentType });

			expect(await table.headerKeys()).toEqual(["Name", "Status"]);
			expect(await table.toJson()).toEqual([{ Name: "John", Status: "Active" }]);
			await expect(table).toHaveRow({ Name: "John", Status: "Active" });
		});
	}

	test("only elements matching the ignore selectors are left out", async ({ page }) => {
		await page.setContent(`
			${srOnlyStyle}
			<table>
				<thead><tr>
					<th>Name<span class="sr-only">, sorted ascending</span></th>
					<th>Status <span class="hint">(filter)</span></th>
				</tr></thead>
				<tbody><tr>
					<td>John<span class="sr-only"> (admin)</span></td>
					<td><b>Active</b><span class="hint">, current</span></td>
				</tr></tbody>
			</table>
		`);

		const byDefault = defineTable(page.locator("table"));
		expect(await byDefault.headerKeys()).toEqual(["Name", "Status (filter)"]);
		expect(await byDefault.toJson()).toEqual([{ Name: "John", "Status (filter)": "Active, current" }]);

		const extended = defineTable(page.locator("table"), { ignore: [...DEFAULT_IGNORE, ".hint"] });
		expect(await extended.headerKeys()).toEqual(["Name", "Status"]);
		expect(await extended.toJson()).toEqual([{ Name: "John", Status: "Active" }]);

		// With innerText, browsers put absolutely positioned elements (like `sr-only`) on a line of their own
		const everything = defineTable(page.locator("table"), { ignore: [], cellContentType: CellContentType.TextContent });
		expect(await everything.headerKeys()).toEqual(["Name, sorted ascending", "Status (filter)"]);
		expect(await everything.toJson()).toEqual([
			{ "Name, sorted ascending": "John (admin)", "Status (filter)": "Active, current" },
		]);
	});

	test("an ignored element is left out wherever it is in the cell", async ({ page }) => {
		await page.setContent(`
			<table>
				<thead><tr><th><div><b>Total</b> <i class="sort-icon">sort</i></div></th></tr></thead>
				<tbody><tr><td><div><span class="sort-icon">x</span>10</div></td></tr></tbody>
			</table>
		`);

		const table = defineTable(page.locator("table"), { ignore: [".sort-icon"] });
		expect(await table.headerKeys()).toEqual(["Total"]);
		expect(await table.toJson()).toEqual([{ Total: "10" }]);
		expect(await table.toJson({ raw: true })).toEqual([{ Total: "x10" }]);
	});

	test("a select reads as its selected option", async ({ page }) => {
		await page.setContent(`
			<table>
				<thead><tr><th>Name</th><th>Priority</th></tr></thead>
				<tbody>
					<tr><td>John</td><td><select><option>Low</option><option selected>High</option></select></td></tr>
					<tr><td>Jane</td><td><select><option selected>Low</option><option>High</option></select></td></tr>
				</tbody>
			</table>
		`);
		const table = defineTable(page.locator("table"));

		expect(await table.toJson()).toEqual([
			{ Name: "John", Priority: "High" },
			{ Name: "Jane", Priority: "Low" },
		]);
		await table.row({ Name: "Jane" }).cell("Priority").locator("select").selectOption("High");
		await expect(table).toHaveRows([{ Priority: "High" }, { Priority: "High" }]);
	});
});

test.describe("TableLocator header names you pass are normalized", () => {
	test("line breaks, extra spaces and non-breaking spaces in header names still match", async ({ page }) => {
		await page.setContent(`
			<table>
				<thead><tr><th>First<br>name</th><th>Date of birth</th></tr></thead>
				<tbody>
					<tr><td>John</td><td>1990</td></tr>
					<tr><td>Jane</td><td>1985</td></tr>
				</tbody>
			</table>
		`);
		const table = defineTable(page.locator("table"), { headers: ["First\nname", "Date of birth"] });
		const untyped = defineTable(page.locator("table"));

		await expect(table.row({ "First\nname": "John" }).cell("Date of birth")).toHaveText("1990");
		await expect(untyped.rowAt(1).cell("First  name")).toHaveText("Jane");
		await expect(table.column("First\nname")).toHaveText(["John", "Jane"]);
		await expect(table.header("First\nname")).toBeVisible();
		await table.validateHeaders();
		await untyped.validateHeaders(["First\u00A0name"]);
		await expect(table).toHaveHeaders(["First\tname", "Date  of  birth"], { exact: true });
		await expect(untyped).toHaveRow({ "First\r\nname": "Jane" });
		await expect(table).toHaveRows([{ "First\nname": "John" }, { "First\nname": "Jane" }]);
		await expect(untyped.rowAt(0)).toHaveCells({ " First name ": "John" });
		await expect(untyped).toBeSortedBy("Date\nof birth", { order: "desc", type: "number" });
		await expect(table).not.toHaveRow({ "First\nname": "Ghost" });
	});
});

test.describe("TableLocator raw cell values", () => {
	const usersHtml = `
		${srOnlyStyle}
		<table>
			<thead><tr><th>Name</th><th>Status</th></tr></thead>
			<tbody>
				<tr><td>John&nbsp;Doe<span class="sr-only"> (admin)</span></td><td>&#xE5CA;Active</td></tr>
				<tr><td>Jane</td><td>Inactive</td></tr>
			</tbody>
		</table>
	`;

	test("toJson({ raw: true }) returns the cells as the browser reads them", async ({ page }) => {
		await page.setContent(usersHtml);
		const table = defineTable(page.locator("table"));

		expect(await table.toJson()).toEqual([
			{ Name: "John Doe", Status: "Active" },
			{ Name: "Jane", Status: "Inactive" },
		]);
		const raw = await table.toJson({ raw: true });
		expect(Object.keys(raw[0] ?? {})).toEqual(["Name", "Status"]);
		// Browsers put the absolutely positioned span on a line of its own
		expect(raw[0]?.Name).toMatch(/^John Doe\s+\(admin\)$/);
		expect(raw[0]?.Status).toBe("\uE5CAActive");
		expect(await table.toJson({ raw: true, minRows: 2 })).toEqual(raw);
	});

	test("a predicate gets the raw text as its second argument", async ({ page }) => {
		await page.setContent(usersHtml);
		const table = defineTable(page.locator("table"));

		await expect(
			table.row({ Name: { predicate: (text, raw) => text === "John Doe" && raw.includes("(admin)") } }).cell("Status")
		).toHaveText(/Active/);
		await expect(table.row({ Status: { predicate: (_text, raw) => raw.charCodeAt(0) === 0xe5ca } })).toHaveCells({
			Name: "John Doe",
		});
		await expect(table.row({ Name: { not: { predicate: (_text, raw) => raw.includes("(admin)") } } })).toHaveCells({
			Name: "Jane",
		});
		await expect(table).toHaveRow({
			Name: { anyOf: ["Nobody", { predicate: (_text, raw) => raw.endsWith("(admin)") }] },
		});
	});
});
