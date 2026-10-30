/**
 * Type-level tests for TableLocator. Checked by `npm run compile` (tsc --noEmit); never executed.
 * Every `@ts-expect-error` line must produce a type error, otherwise compilation fails.
 */
import { Locator } from "@playwright/test";
import { DEFAULT_IGNORE, defineTable, expect, HeaderKey, presets, TableLocator, TableRow } from "src";

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assertType<T extends true>(value?: T): T | undefined {
	return value;
}

export function typeTests(root: Locator): void {
	const users = defineTable(root, { headers: ["Name", "Status", "Email"] });

	// Header names are inferred as a literal union without `as const`
	assertType<Equals<typeof users, TableLocator<"Name" | "Status" | "Email">>>();
	assertType<Equals<ReturnType<typeof users.row>, TableRow<"Name" | "Status" | "Email">>>();

	// The class constructor infers the same way
	const viaClass = new TableLocator(root, { headers: ["Name", "Status"] });
	assertType<Equals<typeof viaClass, TableLocator<"Name" | "Status">>>();

	// Without headers H falls back to string
	const untyped = defineTable(root);
	assertType<Equals<typeof untyped, TableLocator<string>>>();
	untyped.row({ Anything: "goes" }).cell("Whatever");

	// Valid conditions: strings, RegExps, declarative conditions, suffixed keys
	users.row({ Name: "John" });
	users.row({ Name: "John", Status: /active/i });
	users.row({ Name: { contains: "jo", ignoreCase: true } });
	users.row({ Status: { oneOf: ["Active", "Pending"] } });
	users.row({ Email: { empty: true } });
	users.row({ Name: { predicate: text => text.length > 3 } });
	// The second predicate argument is the raw cell text
	users.row({
		Name: {
			predicate: (text, raw) => {
				assertType<Equals<typeof raw, string>>();
				return raw.length > text.length;
			},
		},
	});
	users.row({ Name__C1: "Doe", Status__D2: "x" });

	// @ts-expect-error unknown header
	users.row({ Nme: "John" });
	// @ts-expect-error unknown header next to a valid one
	users.row({ Name: "John", Nope: "x" });
	// @ts-expect-error empty conditions
	users.row({});
	// @ts-expect-error empty conditions, untyped table
	untyped.row({});
	// @ts-expect-error wrong matcher type
	users.row({ Name: 5 });
	// @ts-expect-error wrong condition value type
	users.row({ Name: { contains: 5 } });
	// @ts-expect-error a condition has exactly one kind
	users.row({ Name: { contains: "a", oneOf: ["b"] } });
	// @ts-expect-error predicate must take a string and return a boolean
	users.row({ Name: { predicate: (n: number) => n > 1 } });
	// @ts-expect-error async predicates are not supported
	users.row({ Name: { predicate: async (text: string) => text === "x" } }); // oxlint-disable-line typescript/require-await

	// Combinators nest any matcher
	users.row({ Status: { not: "Active" } });
	users.row({ Status: { anyOf: ["Active", /pend/i, { empty: true }] } });
	users.row({ Name: { allOf: [{ startsWith: "J" }, { not: { predicate: text => text.endsWith("x") } }] } });
	// @ts-expect-error anyOf needs at least one matcher
	users.row({ Status: { anyOf: [] } });
	// @ts-expect-error allOf needs at least one matcher
	users.row({ Status: { allOf: [] } });
	// @ts-expect-error nested matchers are type-checked
	users.row({ Status: { not: { contains: 5 } } });
	// @ts-expect-error not cannot be combined with another kind
	users.row({ Status: { not: "x", empty: true } });

	// Typed cells
	const row = users.row({ Name: "John" });
	row.cell("Email");
	row.cell("Name__C1");
	row.cell("Name__D1");
	row.filter({ hasText: "x" }).cell("Status");
	users.rowAt(0).cell("Status");
	users.rows.cell("Status");
	users.cell(users.rows.locator.nth(1), "Email");
	users.column("Status");
	users.header("Name__C2");

	// @ts-expect-error unknown header
	row.cell("Mail");
	// @ts-expect-error unknown colspan base
	row.cell("Nope__C1");
	// @ts-expect-error suffix must be numeric
	row.cell("Name__Cx");
	// @ts-expect-error unknown header
	users.cell(users.rows.locator, "Mail");
	// @ts-expect-error unknown header
	users.column("Mail");
	// @ts-expect-error unknown header
	users.header("Mail");

	// Column indexes are accepted wherever a header key is
	row.cell(2);
	users.cell(users.rows.locator, 0);
	users.column(1);
	users.header(0);
	untyped.rowAt(0).cell(3);
	// @ts-expect-error column index must be a number, not a numeric string of an unknown header
	row.cell("2");

	// first, last and nth keep typed cells
	assertType<Equals<ReturnType<typeof row.first>, TableRow<"Name" | "Status" | "Email">>>();
	row.first().cell("Status");
	users.rows.last().cell(1);
	users.row({ Status: "Active" }).nth(1).cell("Email");
	// @ts-expect-error unknown header
	users.rows.first().cell("Mail");

	// Icon glyphs are always stripped, so there is no stripIconGlyphs option
	// @ts-expect-error stripIconGlyphs was removed
	defineTable(root, { header: { stripIconGlyphs: true } });
	// ignore takes CSS selectors, and the defaults can be extended
	defineTable(root, { ignore: [...DEFAULT_IGNORE, ".sort-icon"] });
	defineTable(root, { ignore: [] });
	// @ts-expect-error ignore is a list of selectors
	defineTable(root, { ignore: ".sort-icon" });
	// @ts-expect-error DEFAULT_IGNORE is read-only
	DEFAULT_IGNORE.push(".x");

	// Selector options take a CSS selector or a descriptor
	defineTable(root, {
		header: { rowSelector: { css: "thead>tr" }, columnSelector: { role: "columnheader" } },
		row: { rowSelector: { role: "row", hasNotText: /loading/i }, columnSelector: { role: ["cell", "rowheader"] } },
		footer: { rowSelector: { css: "tr.total", hasText: "Total" } },
		emptyRow: { hasText: "No data" },
		ignore: [...DEFAULT_IGNORE, { css: "span", hasText: /^sort/ }],
	});
	// @ts-expect-error not a role
	defineTable(root, { row: { rowSelector: { role: "tablerow" } } });
	// @ts-expect-error a role list is not empty
	defineTable(root, { row: { columnSelector: { role: [] } } });
	// @ts-expect-error unknown descriptor key
	defineTable(root, { emptyRow: { text: "No data" } });
	// @ts-expect-error a Locator is not a selector option
	defineTable(root, { row: { rowSelector: root.locator("tr") } });

	// HeaderKey covers plain names and both suffix kinds
	const keys: HeaderKey<"Name">[] = ["Name", "Name__C1", "Name__D12"];
	void keys;
	// @ts-expect-error unknown header key
	const badKey: HeaderKey<"Name"> = "Email";
	void badKey;

	// validateHeaders takes typed keys
	void users.validateHeaders(["Name", "Status__C1"]);
	// @ts-expect-error unknown header
	void users.validateHeaders(["Mail"]);
}

export async function matcherTypeTests(root: Locator): Promise<void> {
	const users = defineTable(root, { headers: ["Name", "Status"] });
	// Typed tables are accepted as matcher receivers
	await expect(users).toHaveRow({ Name: "John", Status: /active/i });
	await expect(users).not.toHaveRow({ Name: { contains: "x" } });
	await expect(users).toHaveRowCount(2, { timeout: 1_000 });
	await expect(users).toHaveHeaders(["Name"], { exact: false });
	// @ts-expect-error table matchers are not available on other receivers
	await expect(root).toHaveRow({ Name: "John" });
	// @ts-expect-error wrong matcher value type
	await expect(users).toHaveRow({ Name: 5 });
	// Row matchers take typed rows
	await expect(users.row({ Name: "John" })).toHaveCells({ Status: "Active" });
	await expect(users.rowAt(1)).not.toHaveCells({ Status: { anyOf: ["Gone", /deleted/i] } });
	// @ts-expect-error toHaveCells is a row matcher, not a table matcher
	await expect(users).toHaveCells({ Status: "Active" });
	// @ts-expect-error toHaveRow is a table matcher, not a row matcher
	await expect(users.rowAt(0)).toHaveRow({ Status: "Active" });
	// toHaveRows takes a list of row conditions
	await expect(users).toHaveRows([{ Name: "John" }, { Status: /active/i }, {}], { timeout: 1_000 });
	await expect(users).not.toHaveRows([]);
	// @ts-expect-error wrong matcher value type
	await expect(users).toHaveRows([{ Name: 5 }]);
	// @ts-expect-error toHaveRows is a table matcher, not a row matcher
	await expect(users.rowAt(0)).toHaveRows([{ Name: "John" }]);
	// toBeSortedBy takes a header key or column index, and sort options
	await expect(users).toBeSortedBy("Name");
	await expect(users).toBeSortedBy(1, { order: "desc", type: "number", ariaSort: true, timeout: 1_000 });
	await expect(users).not.toBeSortedBy("Name", { compare: (a: string, b: string) => a.length - b.length });
	// @ts-expect-error unknown sort order
	await expect(users).toBeSortedBy("Name", { order: "up" });
	// @ts-expect-error unknown sort type
	await expect(users).toBeSortedBy("Name", { type: "boolean" });
	// @ts-expect-error toBeSortedBy is a table matcher, not a row matcher
	await expect(users.rowAt(0)).toBeSortedBy("Name");
	// The aria option switches the default selectors to ARIA roles
	const grid = defineTable(root, { aria: true, headers: ["Id", "Name"] });
	await expect(grid.row({ Id: "1" }).cell("Name")).toHaveText("John");
	// @ts-expect-error aria is a boolean
	defineTable(root, { aria: "grid" });
	// toJson is keyed by header keys
	const json = await users.toJson();
	assertType<Equals<typeof json, Record<HeaderKey<"Name" | "Status">, string>[]>>();
	await users.toJson({ minRows: 1, timeout: 10_000 });
	// @ts-expect-error minRows is a number
	await users.toJson({ minRows: true });
	await users.toJson({ raw: true });
	// @ts-expect-error raw is a boolean
	await users.toJson({ raw: "yes" });
	// columns narrows the keys, parse types the values
	const picked = await users.toJson({ columns: ["Status"] });
	assertType<Equals<typeof picked, { Status: string }[]>>();
	const parsed = await users.toJson({
		columns: ["Name", "Status"],
		parse: { Status: "number", Name: text => text.length > 3 },
		decimal: ",",
	});
	assertType<Equals<typeof parsed, { Name: boolean; Status: number | null }[]>>();
	const dated = await users.toJson({ parse: { Name: "date" } });
	assertType<Equals<(typeof dated)[number]["Name"], Date | null>>();
	assertType<Equals<(typeof dated)[number]["Status"], string>>();
	// @ts-expect-error unknown column
	await users.toJson({ columns: ["Mail"] });
	// @ts-expect-error unknown parser
	await users.toJson({ parse: { Name: "boolean" } });
	// @ts-expect-error unknown decimal separator
	await users.toJson({ decimal: ";" });
	await users.toJson({ stable: true });
	await users.toJson({ stable: { quiet: 200, loading: root } });
	// @ts-expect-error stable takes options or a boolean
	await users.toJson({ stable: 200 });
	// waitForStable and columnValues
	await users.waitForStable({ quiet: 200, timeout: 1_000, loading: root });
	const values = await users.columnValues("Status");
	assertType<Equals<typeof values, string[]>>();
	await users.columnValues(1);
	// @ts-expect-error unknown header
	await users.columnValues("Mail");
	// Numeric conditions
	users.row({ Status: { gt: 1 } });
	users.row({ Status: { between: [1, 2], decimal: "," } });
	// @ts-expect-error numeric conditions take numbers
	users.row({ Status: { gt: "1" } });
	// @ts-expect-error between takes a pair
	users.row({ Status: { between: [1, 2, 3] } });
	// @ts-expect-error decimal only goes with numeric conditions
	users.row({ Status: { equals: "1", decimal: "," } });
	// @ts-expect-error a condition has exactly one kind
	users.row({ Status: { gt: 1, lt: 5 } });
	// Dataset matchers
	await expect(users).toContainRows([{ Name: "John" }, { Status: { gte: 2 } }], { timeout: 1_000 });
	await expect(users).toHaveRows([{ Name: "John" }], { anyOrder: true });
	await expect(users).toHaveEveryRow({ Status: "Active" });
	await expect(users).toHaveColumnValues("Status", ["Active", /x/, { lt: 3 }], { anyOrder: true });
	await expect(users).toHaveColumnValues(0, []);
	await expect(users).toBeSortedBy("Status", { type: "number", decimal: "," });
	// @ts-expect-error wrong matcher value type
	await expect(users).toHaveColumnValues("Status", [5]);
	// @ts-expect-error toHaveEveryRow is a table matcher, not a row matcher
	await expect(users.rowAt(0)).toHaveEveryRow({ Name: "John" });
	// Locator matchers keep working
	await expect(users.rows.locator).toHaveCount(2);
}

export async function navigationTypeTests(root: Locator, page: { getByRole: Locator["getByRole"] }): Promise<void> {
	// Presets spread into options and keep typed headers
	const cars = defineTable(root, { ...presets.agGrid(), headers: ["Make", "Model"] });
	assertType<Equals<typeof cars, TableLocator<"Make" | "Model">>>();
	defineTable(root, presets.muiDataGrid());
	defineTable(root, presets.angularMaterial({ paginator: root }));
	defineTable(root, presets.tanstackVirtual({ container: root }));
	// @ts-expect-error tanstackVirtual needs the scroll container
	presets.tanstackVirtual();

	// paginate, scroll and loading take locators or functions of the root
	defineTable(root, {
		paginate: { next: page.getByRole("button", { name: "Next" }), first: r => r.locator(".first"), maxPages: 5 },
		scroll: { container: r => r.locator(".viewport"), step: 200, rowKey: "data-id", settle: 0 },
		loading: r => r.getByRole("progressbar"),
		footer: { rowSelector: "tfoot>tr" },
	});
	// @ts-expect-error next is required
	defineTable(root, { paginate: {} });
	// @ts-expect-error a locator or a function of the root
	defineTable(root, { loading: ".spinner" });

	// findRow takes typed conditions and returns a typed row
	const row = await cars.findRow({ Model: "Model 1" }, { timeout: 10_000 });
	assertType<Equals<typeof row, TableRow<"Make" | "Model">>>();
	// @ts-expect-error unknown header
	await cars.findRow({ Mdl: "Model 1" });
	const total = await cars.totalRowCount();
	assertType<Equals<typeof total, number>>();
	const all = await cars.toJson({ allRows: true, columns: ["Model"] });
	assertType<Equals<typeof all, { Model: string }[]>>();
	cars.footer.cell("Make");
	// @ts-expect-error unknown header
	cars.footer.cell("Price");
	const text = await cars.format({ columns: ["Make", 1], maxRows: 10 });
	assertType<Equals<typeof text, string>>();

	// Row interactions
	await row.fill({ Make: "Ford", Model: true }, { commit: "Tab" });
	// @ts-expect-error unknown header
	await row.fill({ Price: "1" });
	// @ts-expect-error values are strings or booleans
	await row.fill({ Make: 1 });
	await row.select();
	await row.deselect({ timeout: 1_000 });
	assertType<Equals<Awaited<ReturnType<typeof row.isSelected>>, boolean>>();
	await row.expand({ toggle: r => r.getByRole("button") });
	await row.collapse();
	assertType<Equals<Awaited<ReturnType<typeof row.isExpanded>>, boolean | null>>();
	assertType<Equals<Awaited<ReturnType<typeof row.level>>, number | null>>();

	// Typed matchers: header keys are checked, also with .not and expect.soft
	await expect(cars).toHaveTotalRowCount(200);
	await expect(cars).toHaveRow({ Make: "Ford" });
	await expect(cars).not.toHaveRow({ Make: { gt: 1 } });
	await expect.soft(cars).toHaveEveryRow({ Model: /x/ });
	await expect(cars).toHaveColumnValues(0, ["a"]);
	await expect(cars).toBeSortedBy("Model", { order: "desc" });
	// Headers that the table doesn't declare can be asserted absent
	await expect(cars).not.toHaveHeaders(["Deleted"]);
	// @ts-expect-error unknown header
	await expect(cars).toHaveRow({ Mke: "Ford" });
	// @ts-expect-error unknown header, also after .not
	await expect(cars).not.toHaveRow({ Mke: "Ford" });
	// @ts-expect-error unknown header, also with expect.soft
	await expect.soft(cars).toHaveRow({ Mke: "Ford" });
	// @ts-expect-error unknown header in a list of rows
	await expect(cars).toHaveRows([{ Mke: "Ford" }]);
	// @ts-expect-error unknown column
	await expect(cars).toHaveColumnValues("Mke", []);
	// @ts-expect-error unknown column
	await expect(cars).toBeSortedBy("Price");
	await expect(row).toHaveCells({ Make: "Ford" });
	await expect(row).toBeSelected();
	await expect(row).not.toBeExpanded({ timeout: 1_000 });
	// @ts-expect-error unknown header
	await expect(row).toHaveCells({ Mke: "Ford" });
	// @ts-expect-error toBeSelected is a row matcher
	await expect(cars).toBeSelected();
	// Generic matchers stay available on tables and rows
	expect(cars).toBeDefined();
	expect(row).toBeTruthy();
}
