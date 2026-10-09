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
	users.row({ Name: { predicate: async (text: string) => text === "x" } });

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
	// Locator matchers keep working
	await expect(users.rows.locator).toHaveCount(2);
}
