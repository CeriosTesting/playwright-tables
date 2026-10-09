import { expect as baseExpect, ExpectMatcherState, MatcherReturnType } from "@playwright/test";

import { TableLocator, TableRow } from "./table-locator";
import { CellMatcher, RowWhere } from "./table-locator.types";

/** Minimum time a single header read may take, so the last read before the deadline can still succeed. */
const MIN_READ_TIMEOUT = 100;

/** Options shared by the table matchers. */
export type TableMatcherOptions = {
	/** Time to retry the assertion for, in milliseconds. Defaults to the `expect` timeout. */
	timeout?: number;
};

/**
 * Asserts that the table has at least one body row matching every condition (or none, with `.not`).
 * Retries until the timeout. On failure, unknown headers are reported with the available headers.
 *
 * Conditions are checked against header names at runtime; for compile-time checks use
 * `expect(table.row({...}).locator).toBeVisible()`.
 */
async function toHaveRow(
	this: ExpectMatcherState,
	table: TableLocator,
	where: RowWhere<string>,
	options?: TableMatcherOptions
): Promise<MatcherReturnType> {
	const matcherName = "toHaveRow";
	const timeout = options?.timeout ?? this.timeout;
	const rows = table.row(where).locator;

	let found: boolean;
	try {
		if (this.isNot) {
			await baseExpect(rows).toHaveCount(0, { timeout });
		} else {
			await baseExpect(rows).not.toHaveCount(0, { timeout });
		}
		found = !this.isNot;
	} catch {
		found = this.isNot;
	}

	const failed = found === this.isNot;
	const diagnostics = failed ? await headerDiagnostics(table, Object.keys(where)) : "";

	return {
		name: matcherName,
		pass: found,
		expected: where,
		actual: found,
		timeout,
		message: () =>
			this.utils.matcherHint(matcherName, "table", "where", { isNot: this.isNot }) +
			"\n\n" +
			`Expected: ${this.isNot ? "no row" : "a row"} matching ${describeWhere(where)}\n` +
			`Received: ${found ? "a matching row" : "no matching row"}\n` +
			diagnostics +
			`Table locator: ${table.root.toString()}\n` +
			`Timeout: ${timeout}ms`,
	};
}

/**
 * Asserts that the table has exactly `count` body rows. Retries until the timeout.
 */
async function toHaveRowCount(
	this: ExpectMatcherState,
	table: TableLocator,
	count: number,
	options?: TableMatcherOptions
): Promise<MatcherReturnType> {
	const matcherName = "toHaveRowCount";
	const timeout = options?.timeout ?? this.timeout;
	const rows = table.rows.locator;

	let reached: boolean;
	try {
		const expectation = this.isNot ? baseExpect(rows).not : baseExpect(rows);
		await expectation.toHaveCount(count, { timeout });
		reached = true;
	} catch {
		reached = false;
	}

	const pass = this.isNot ? !reached : reached;
	const actual = reached ? count : await rows.count().catch(() => undefined);

	return {
		name: matcherName,
		pass,
		expected: count,
		actual,
		timeout,
		message: () =>
			this.utils.matcherHint(matcherName, "table", "count", { isNot: this.isNot }) +
			"\n\n" +
			`Expected: ${this.isNot ? "not " : ""}${this.utils.printExpected(count)} body rows\n` +
			`Received: ${this.utils.printReceived(actual)}\n` +
			`Table locator: ${table.root.toString()}\n` +
			`Timeout: ${timeout}ms`,
	};
}

/**
 * Asserts that the main header row contains every given header key, or with `exact: true`, that it
 * equals the given keys in order. Retries until the timeout.
 */
async function toHaveHeaders(
	this: ExpectMatcherState,
	table: TableLocator,
	headers: readonly string[],
	options?: TableMatcherOptions & {
		/** Require exactly these header keys, in this order. Defaults to `false`. */
		exact?: boolean;
	}
): Promise<MatcherReturnType> {
	const matcherName = "toHaveHeaders";
	const timeout = options?.timeout ?? this.timeout;
	const exact = options?.exact === true;
	const deadline = Date.now() + timeout;

	const matches = (keys: string[]): boolean =>
		exact
			? keys.length === headers.length && headers.every((header, index) => keys[index] === header)
			: headers.every(header => keys.includes(header));

	let keys: string[] = [];
	let matched = false;
	for (;;) {
		try {
			keys = await table.headerKeys({ timeout: Math.max(MIN_READ_TIMEOUT, deadline - Date.now()) });
		} catch {
			// Keep the last keys that were read; the table may not be attached yet.
		}
		matched = matches(keys);
		if (matched !== this.isNot || Date.now() >= deadline) break;
		await new Promise(resolve => setTimeout(resolve, 100));
	}

	const missing = headers.filter(header => !keys.includes(header));

	return {
		name: matcherName,
		pass: matched,
		expected: headers,
		actual: keys,
		timeout,
		message: () =>
			this.utils.matcherHint(matcherName, "table", "headers", { isNot: this.isNot }) +
			"\n\n" +
			`Expected: ${this.isNot ? "not " : ""}${exact ? "exactly " : ""}${this.utils.printExpected(headers)}\n` +
			`Received: ${this.utils.printReceived(keys)}\n` +
			(missing.length > 0 && !this.isNot ? `Missing headers: [${missing.join(", ")}]\n` : "") +
			`Table locator: ${table.root.toString()}\n` +
			`Timeout: ${timeout}ms`,
	};
}

/**
 * Asserts that a {@link TableRow} resolves to exactly one row whose cells match every condition.
 * With `.not`, the row must exist and not match. Retries until the timeout.
 *
 * @example
 * await expect(users.row({ Name: "John" })).toHaveCells({ Status: "Active", Email: /@example\.com$/ });
 * await expect(users.rowAt(0)).not.toHaveCells({ Status: "Deleted" });
 */
async function toHaveCells(
	this: ExpectMatcherState,
	row: TableRow,
	cells: RowWhere<string>,
	options?: TableMatcherOptions
): Promise<MatcherReturnType> {
	const matcherName = "toHaveCells";
	const timeout = options?.timeout ?? this.timeout;
	const deadline = Date.now() + timeout;
	const matching = row.locator.and(row.table.row(cells).locator);

	let rowCount = 0;
	let matchCount = 0;
	let reached = false;
	for (;;) {
		try {
			[rowCount, matchCount] = await Promise.all([row.locator.count(), matching.count()]);
		} catch {
			// Keep the last counts; the page may be navigating.
		}
		reached = rowCount === 1 && matchCount === (this.isNot ? 0 : 1);
		if (reached || Date.now() >= deadline) break;
		await new Promise(resolve => setTimeout(resolve, 100));
	}

	const pass = this.isNot ? !reached : reached;
	const failed = pass === this.isNot;
	const headers = Object.keys(cells);
	const diagnostics = failed ? await headerDiagnostics(row.table, headers) : "";
	const received = failed && rowCount === 1 && diagnostics === "" ? await readCells(row, headers) : undefined;

	return {
		name: matcherName,
		pass,
		expected: cells,
		actual: received,
		timeout,
		message: () =>
			this.utils.matcherHint(matcherName, "row", "cells", { isNot: this.isNot }) +
			"\n\n" +
			`Expected: ${this.isNot ? "a row not matching" : "a row matching"} ${describeWhere(cells)}\n` +
			(rowCount === 1
				? received !== undefined
					? `Received: ${received}\n`
					: ""
				: `Received: the row locator matched ${rowCount} rows, expected exactly 1\n`) +
			diagnostics +
			`Row locator: ${row.locator.toString()}\n` +
			`Timeout: ${timeout}ms`,
	};
}

/**
 * Custom `expect` matchers for {@link TableLocator} and {@link TableRow}. Use them to extend your own `expect`.
 *
 * - `toHaveRow(where, options?)`: at least one body row matches every condition.
 * - `toHaveRowCount(count, options?)`: exactly `count` body rows.
 * - `toHaveHeaders(headers, options?)`: the main header row contains these header keys (`exact` for an ordered match).
 * - `toHaveCells(cells, options?)` on a {@link TableRow}: exactly one row, whose cells match every condition.
 *
 * @example
 * // Combine with your own matchers
 * import { expect as base } from "@playwright/test";
 * import { tableMatchers } from "@cerios/playwright-table";
 *
 * export const expect = base.extend({
 *   ...tableMatchers,
 *   async toBeSorted(locator: Locator) { ... },
 * });
 *
 * @example
 * // Or merge with another extended expect
 * import { mergeExpects } from "@playwright/test";
 * import { expect as tableExpect } from "@cerios/playwright-table";
 *
 * export const expect = mergeExpects(tableExpect, myExpect);
 */
export const tableMatchers = { toHaveRow, toHaveRowCount, toHaveHeaders, toHaveCells };

/**
 * Playwright `expect` extended with {@link tableMatchers}.
 *
 * @example
 * import { test, expect, defineTable } from "@cerios/playwright-table";
 *
 * test("users", async ({ page }) => {
 *   const users = defineTable(page.locator("table"), { headers: ["Name", "Status"] });
 *   await expect(users).toHaveHeaders(["Name", "Status"]);
 *   await expect(users).toHaveRow({ Name: "John", Status: /active/i });
 *   await expect(users).not.toHaveRow({ Name: "Ghost" });
 *   await expect(users).toHaveRowCount(3);
 *   await expect(users.row({ Name: "John" })).toHaveCells({ Status: "Active" });
 * });
 */
export const expect = baseExpect.extend(tableMatchers);

async function readCells(row: TableRow, headers: readonly string[]): Promise<string> {
	const parts = await Promise.all(
		headers.map(async header => {
			const text = await row
				.cell(header)
				.innerText({ timeout: 500 })
				.then(
					value => JSON.stringify(value.replace(/\s+/g, " ").trim()),
					() => "<no cell>"
				);
			return `${JSON.stringify(header)}: ${text}`;
		})
	);
	return `{ ${parts.join(", ")} }`;
}

async function headerDiagnostics(table: TableLocator, headers: readonly string[]): Promise<string> {
	let available: string[];
	try {
		available = await table.headerKeys({ timeout: 1_000 });
	} catch {
		return "";
	}
	const unknown = headers.filter(header => !available.includes(header));
	if (unknown.length === 0) return "";
	return (
		unknown.map(header => `Header "${header}" not found.\n`).join("") + `Available headers: [${available.join(", ")}]\n`
	);
}

function describeWhere(where: RowWhere<string>): string {
	const entries: [string, CellMatcher | undefined][] = Object.entries(where);
	const parts = entries
		.filter((entry): entry is [string, CellMatcher] => entry[1] !== undefined)
		.map(([header, matcher]) => `${JSON.stringify(header)}: ${describeMatcher(matcher)}`);
	return `{ ${parts.join(", ")} }`;
}

function describeMatcher(matcher: CellMatcher): string {
	if (typeof matcher === "string") return JSON.stringify(matcher);
	if (matcher instanceof RegExp) return String(matcher);
	if (matcher.predicate !== undefined) return `{ predicate: ${matcher.predicate.toString()} }`;
	if (matcher.not !== undefined) return `{ not: ${describeMatcher(matcher.not)} }`;
	if (matcher.anyOf !== undefined) return `{ anyOf: [${matcher.anyOf.map(describeMatcher).join(", ")}] }`;
	if (matcher.allOf !== undefined) return `{ allOf: [${matcher.allOf.map(describeMatcher).join(", ")}] }`;
	return JSON.stringify(matcher);
}
