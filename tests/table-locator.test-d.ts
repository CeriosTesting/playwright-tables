/**
 * Type-level tests for TableLocator. Checked by `npm run compile` (tsc --noEmit); never executed.
 * Every `@ts-expect-error` line must produce a type error, otherwise compilation fails.
 */
import { Locator } from "@playwright/test";
import { defineTable, expect, HeaderKey, TableLocator, TableRow } from "src";

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

	// stripIconGlyphs is a header option
	defineTable(root, { header: { stripIconGlyphs: true } });
	// @ts-expect-error stripIconGlyphs is a boolean
	defineTable(root, { header: { stripIconGlyphs: "yes" } });

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
	// Locator matchers keep working
	await expect(users.rows.locator).toHaveCount(2);
}
