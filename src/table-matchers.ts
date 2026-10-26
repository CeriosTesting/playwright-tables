import { expect as baseExpect, Expect, ExpectMatcherState, Locator } from "@playwright/test";

import { serializeWhere } from "./cell-matcher-serializer";
import { describeLastError, MIN_READ_TIMEOUT, pollUntil } from "./polling";
import { TableLocator, TableRow } from "./table-locator";
import {
	CellMatcher,
	EngineFindRequest,
	EngineMatchRequest,
	EngineMatchResult,
	EngineTextsRequest,
	EngineValues,
	EngineValuesRequest,
	RowWhere,
	SerializedMatcher,
} from "./table-locator.types";
import { findTableRows, matchTableRows, readColumnValues, readTableTexts } from "./table-selector-engine";

/** Maximum number of mismatching rows listed in a `toHaveRows` failure message. */
const MAX_REPORTED_ROWS = 10;

/** Maximum number of column values listed in a `toBeSortedBy` failure message. */
const MAX_REPORTED_VALUES = 20;

/**
 * What a matcher returns to `expect.extend`. Declared here instead of importing `MatcherReturnType`,
 * which older versions of `@playwright/test` within the peer range don't export.
 */
type MatcherResult = {
	name: string;
	pass: boolean;
	message: () => string;
	expected?: unknown;
	actual?: unknown;
	timeout?: number;
};

/** Options shared by the table matchers. */
export type TableMatcherOptions = {
	/** Time to retry the assertion for, in milliseconds. Defaults to the `expect` timeout. */
	timeout?: number;
};

/** Options for the `toBeSortedBy` matcher. */
export type TableSortOptions = TableMatcherOptions & {
	/** The expected order. Defaults to `"asc"`. */
	order?: "asc" | "desc";
	/**
	 * How cell texts are compared. Defaults to `"text"`.
	 * - `"text"`: case-insensitive, with digit runs compared as numbers (`"item 9"` before `"item 10"`).
	 * - `"number"`: the number in the text, ignoring everything but digits, `.` and `-` (`"€ 1,200"` is 1200).
	 * - `"date"`: parsed with `Date.parse`.
	 */
	type?: "text" | "number" | "date";
	/**
	 * Custom comparison of two cell texts, like `Array.sort`. Runs in Node, so it can use test variables.
	 * Overrides `type`.
	 */
	compare?: (a: string, b: string) => number;
	/** Also require `aria-sort="ascending"` or `"descending"` on the header cell. Defaults to `false`. */
	ariaSort?: boolean;
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
): Promise<MatcherResult> {
	const matcherName = "toHaveRow";
	const timeout = options?.timeout ?? this.timeout;
	const deadline = Date.now() + timeout;
	const rows = table.row(where).locator;

	// A condition on an unknown header never matches, so `.not` would pass on a typo.
	const unknown = this.isNot ? await waitForHeaders(table, conditionHeaders(where), deadline) : "";
	if (unknown !== "") {
		return uncheckable(this, {
			matcherName,
			receiver: "table",
			argument: "where",
			expected: where,
			description: `no row matching ${describeWhere(where)}`,
			diagnostics: unknown,
			locator: `Table locator: ${table.root.toString()}`,
			timeout,
		});
	}

	let found: boolean;
	try {
		const remaining = Math.max(MIN_READ_TIMEOUT, deadline - Date.now());
		if (this.isNot) {
			await baseExpect(rows).toHaveCount(0, { timeout: remaining });
		} else {
			await baseExpect(rows).not.toHaveCount(0, { timeout: remaining });
		}
		found = !this.isNot;
	} catch {
		found = this.isNot;
	}

	const failed = found === this.isNot;
	const diagnostics = failed
		? (await headerDiagnostics(table, Object.keys(where))) + (await predicateDiagnostics(table, where))
		: "";

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
): Promise<MatcherResult> {
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
	// A broken selector matches no rows; reading the table directly shows why.
	const diagnostics = pass === this.isNot ? await headerDiagnostics(table, []) : "";

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
			diagnostics +
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
): Promise<MatcherResult> {
	const matcherName = "toHaveHeaders";
	const timeout = options?.timeout ?? this.timeout;
	const exact = options?.exact === true;
	const deadline = Date.now() + timeout;

	const matches = (keys: string[]): boolean =>
		exact
			? keys.length === headers.length && headers.every((header, index) => keys[index] === header)
			: headers.every(header => keys.includes(header));

	const poll = await pollUntil(
		readTimeout => table.headerKeys({ timeout: readTimeout }),
		read => matches(read) !== this.isNot,
		[] as string[],
		deadline
	);
	const keys = poll.value;
	const matched = matches(keys);
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
			describeLastError(poll.error) +
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
): Promise<MatcherResult> {
	const matcherName = "toHaveCells";
	const timeout = options?.timeout ?? this.timeout;
	const deadline = Date.now() + timeout;
	const matching = row.locator.and(row.table.row(cells).locator);

	// A condition on an unknown header never matches, so `.not` would pass on a typo.
	const unknown = this.isNot ? await waitForHeaders(row.table, conditionHeaders(cells), deadline) : "";
	if (unknown !== "") {
		return uncheckable(this, {
			matcherName,
			receiver: "row",
			argument: "cells",
			expected: cells,
			description: `a row not matching ${describeWhere(cells)}`,
			diagnostics: unknown,
			locator: `Row locator: ${row.locator.toString()}`,
			timeout,
		});
	}

	const { rowCount, reached } = await pollRowMatch(row, matching, this.isNot ? 0 : 1, deadline);
	const pass = this.isNot ? !reached : reached;
	const failed = pass === this.isNot;
	const headers = Object.keys(cells);
	const diagnostics = failed ? await headerDiagnostics(row.table, headers) : "";
	const received = failed && rowCount === 1 && diagnostics === "" ? await readCells(row, headers) : undefined;
	const predicates = failed ? await predicateDiagnostics(row.table, cells) : "";

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
			describeReceivedRow(rowCount, received) +
			diagnostics +
			predicates +
			`Row locator: ${row.locator.toString()}\n` +
			`Timeout: ${timeout}ms`,
	};
}

/**
 * Asserts that the table has exactly as many body rows as `rows`, and that body row `i` matches every
 * condition of `rows[i]`. Headers that a row does not mention are not checked, so `{}` matches any row.
 * With `.not`, the table must not match. Retries until the timeout.
 *
 * @example
 * await expect(users).toHaveRows([
 *   { Name: "John", Status: "Active" },
 *   { Name: "Jane", Status: /inactive/i },
 * ]);
 */
async function toHaveRows(
	this: ExpectMatcherState,
	table: TableLocator,
	rows: readonly RowWhere<string>[],
	options?: TableMatcherOptions
): Promise<MatcherResult> {
	const matcherName = "toHaveRows";
	const timeout = options?.timeout ?? this.timeout;
	const deadline = Date.now() + timeout;
	// `_config` is private to TableLocator; the matchers of this package read it to query the engine.
	const request: EngineMatchRequest = { op: "match", cfg: table["_config"], rows: rows.map(serializeWhere) };
	const matches = (result: EngineMatchResult): boolean =>
		result.unknown.length === 0 && result.count === rows.length && result.matched.every(Boolean);

	const poll = await pollUntil(
		readTimeout => table.root.evaluate(matchTableRows, request, { timeout: readTimeout }),
		// With `.not`, an unknown header is not a pass: keep waiting for it to show up.
		read => matches(read) !== this.isNot && (!this.isNot || read.unknown.length === 0),
		{ keys: [], rows: [], count: 0, matched: [], unknown: [], errors: [] },
		deadline
	);
	const result = poll.value;
	const matched = matches(result);
	// A table that was never read, or has an unknown header, cannot be checked: it fails both the
	// assertion and its negation.
	const uncheckable = !poll.read || result.unknown.length > 0;
	const received = result.rows.map(texts => toRecord(result.keys, texts));

	return {
		name: matcherName,
		pass: uncheckable ? this.isNot : matched,
		expected: rows,
		actual: received,
		timeout,
		message: () =>
			this.utils.matcherHint(matcherName, "table", "rows", { isNot: this.isNot }) +
			"\n\n" +
			`Expected: ${this.isNot ? "not " : ""}${rows.length} body rows matching\n` +
			rows.map((where, index) => `  [${index}] ${describeWhere(where)}\n`).join("") +
			(!poll.read
				? "Received: the table could not be read\n"
				: this.isNot
					? `Received: ${result.count} body rows that match\n`
					: describeRowMismatches(rows, result, received)) +
			(result.unknown.length > 0 ? describeUnknown(result.unknown, result.keys) : "") +
			describePredicateErrors(result.errors) +
			describeLastError(poll.error) +
			`Table locator: ${table.root.toString()}\n` +
			`Timeout: ${timeout}ms`,
	};
}

/**
 * Asserts that the body rows are sorted by `column`. Values are compared in Node, so `compare` can use
 * variables from the test. An empty body, an unknown column or a value that cannot be parsed fails the
 * assertion, also with `.not`. Retries until the timeout.
 *
 * @example
 * await users.header("Age").click();
 * await expect(users).toBeSortedBy("Age", { type: "number" });
 * await expect(users).toBeSortedBy("Name", { order: "desc", ariaSort: true });
 */
async function toBeSortedBy(
	this: ExpectMatcherState,
	table: TableLocator,
	column: string | number,
	options?: TableSortOptions
): Promise<MatcherResult> {
	const matcherName = "toBeSortedBy";
	const timeout = options?.timeout ?? this.timeout;
	const sort: SortSettings = {
		order: options?.order ?? "asc",
		type: options?.type ?? "text",
		compare: options?.compare,
		ariaSort: options?.ariaSort === true,
	};

	const { read, check, sorted, error } = await pollSorted(table, column, sort, Date.now() + timeout, this.isNot);
	const values = check.values ?? [];

	return {
		name: matcherName,
		// A table that cannot be checked fails both the assertion and its negation.
		pass: check.error === undefined ? sorted : this.isNot,
		expected: `${sort.order} (${sort.type})`,
		actual: values,
		timeout,
		message: () =>
			this.utils.matcherHint(matcherName, "table", "column", { isNot: this.isNot }) +
			"\n\n" +
			describeExpectedSort(column, sort, this.isNot) +
			describeReceivedSort(check, values, sort.ariaSort ? read.ariaSort : undefined) +
			(check.unknown === true ? `Available headers: [${read.column.keys.join(", ")}]\n` : "") +
			describeLastError(error) +
			`Table locator: ${table.root.toString()}\n` +
			`Timeout: ${timeout}ms`,
	};
}

/** The resolved {@link TableSortOptions} of a `toBeSortedBy` assertion. */
type SortSettings = {
	order: "asc" | "desc";
	type: "text" | "number" | "date";
	compare: ((a: string, b: string) => number) | undefined;
	ariaSort: boolean;
};

/** One read of a `toBeSortedBy` assertion. */
type SortRead = {
	column: EngineValues;
	/** The `aria-sort` attribute of the header cell, if it was read. */
	ariaSort: string | null;
};

/** The outcome of a `toBeSortedBy` assertion. */
type SortPoll = {
	read: SortRead;
	check: SortCheck;
	sorted: boolean;
	/** The error of the last read, if it failed. */
	error: unknown;
};

/**
 * Reads the column until it is sorted (or, with `isNot`, until it is not), or until `deadline`.
 * A table that cannot be checked keeps being read until the deadline.
 */
async function pollSorted(
	table: TableLocator,
	column: string | number,
	sort: SortSettings,
	deadline: number,
	isNot: boolean
): Promise<SortPoll> {
	const expectedAriaSort = sort.order === "asc" ? "ascending" : "descending";
	// `_config` is private to TableLocator; the matchers of this package read it to query the engine.
	const request: EngineValuesRequest = { op: "values", cfg: table["_config"], column };
	const evaluate = (read: SortRead): { check: SortCheck; sorted: boolean } => {
		const check = checkSorted(read.column, column, sort.order, sort.type, sort.compare);
		const sorted =
			check.error === undefined &&
			check.outOfOrder === undefined &&
			(!sort.ariaSort || read.ariaSort === expectedAriaSort);
		return { check, sorted };
	};

	const poll = await pollUntil(
		async (readTimeout): Promise<SortRead> => {
			const values = await table.root.evaluate(readColumnValues, request, { timeout: readTimeout });
			const ariaSort =
				sort.ariaSort && values.values !== null
					? await table
							.header(column)
							.getAttribute("aria-sort", { timeout: MIN_READ_TIMEOUT })
							.catch(() => null)
					: null;
			return { column: values, ariaSort };
		},
		read => {
			const { check, sorted } = evaluate(read);
			return check.error === undefined && sorted !== isNot;
		},
		{ column: { keys: [], values: null }, ariaSort: null },
		deadline
	);
	if (!poll.read) {
		return { read: poll.value, check: { error: "the table could not be read" }, sorted: false, error: poll.error };
	}
	return { read: poll.value, ...evaluate(poll.value), error: poll.error };
}

/** The "Expected:" line of a `toBeSortedBy` failure. */
function describeExpectedSort(column: string | number, sort: SortSettings, isNot: boolean): string {
	const name = typeof column === "number" ? `column ${column}` : `column ${JSON.stringify(column)}`;
	const direction = sort.order === "asc" ? "ascending" : "descending";
	const comparison = sort.compare === undefined ? ` as ${sort.type}` : " (custom compare)";
	const aria = sort.ariaSort ? ` with aria-sort="${direction}"` : "";
	return `Expected: ${name} ${isNot ? "not " : ""}sorted ${direction}${comparison}${aria}\n`;
}

/**
 * The "Received:" lines of a `toBeSortedBy` failure. `ariaSort` is `undefined` when the `aria-sort`
 * attribute is not checked.
 */
function describeReceivedSort(
	check: SortCheck,
	values: readonly string[],
	ariaSort: string | null | undefined
): string {
	if (check.error !== undefined) return `Received: ${check.error}\n`;
	const shown = values.slice(0, MAX_REPORTED_VALUES).map(value => JSON.stringify(value));
	if (values.length > MAX_REPORTED_VALUES) shown.push(`... ${values.length - MAX_REPORTED_VALUES} more`);
	let message = `Received: [${shown.join(", ")}]\n`;
	if (check.outOfOrder !== undefined) {
		message +=
			`Row ${check.outOfOrder} (${JSON.stringify(values[check.outOfOrder])}) comes before ` +
			`row ${check.outOfOrder + 1} (${JSON.stringify(values[check.outOfOrder + 1])})\n`;
	}
	if (ariaSort !== undefined) {
		message += `aria-sort: ${ariaSort === null ? "<none>" : JSON.stringify(ariaSort)}\n`;
	}
	return message;
}

/**
 * Custom `expect` matchers for {@link TableLocator} and {@link TableRow}. Use them to extend your own `expect`.
 *
 * - `toHaveRow(where, options?)`: at least one body row matches every condition.
 * - `toHaveRowCount(count, options?)`: exactly `count` body rows.
 * - `toHaveRows(rows, options?)`: exactly these body rows, in order, each matching its conditions.
 * - `toHaveHeaders(headers, options?)`: the main header row contains these header keys (`exact` for an ordered match).
 * - `toBeSortedBy(column, options?)`: the body rows are sorted by a column (see {@link TableSortOptions}).
 * - `toHaveCells(cells, options?)` on a {@link TableRow}: exactly one row, whose cells match every condition.
 *
 * @example
 * // Combine with your own matchers
 * import { expect as base } from "@playwright/test";
 * import { tableMatchers } from "@cerios/playwright-table";
 *
 * export const expect = base.extend({
 *   ...tableMatchers,
 *   async toHaveEmailFor(table: TableLocator, name: string) { ... },
 * });
 *
 * @example
 * // Or merge with another extended expect
 * import { mergeExpects } from "@playwright/test";
 * import { expect as tableExpect } from "@cerios/playwright-table";
 *
 * export const expect = mergeExpects(tableExpect, myExpect);
 */
export const tableMatchers: {
	toHaveRow: typeof toHaveRow;
	toHaveRowCount: typeof toHaveRowCount;
	toHaveRows: typeof toHaveRows;
	toHaveHeaders: typeof toHaveHeaders;
	toHaveCells: typeof toHaveCells;
	toBeSortedBy: typeof toBeSortedBy;
} = { toHaveRow, toHaveRowCount, toHaveRows, toHaveHeaders, toHaveCells, toBeSortedBy };

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
 *   await expect(users).toHaveRows([{ Name: "John" }, { Name: "Jane" }, { Name: "Joe" }]);
 *   await users.header("Name").click();
 *   await expect(users).toBeSortedBy("Name");
 *   await expect(users.row({ Name: "John" })).toHaveCells({ Status: "Active" });
 * });
 */
export const expect: Expect<typeof tableMatchers> = baseExpect.extend(tableMatchers);

async function readCells(row: TableRow, headers: readonly string[]): Promise<string> {
	// Read the cells the way the table compares them. `_config` is private to TableLocator; the matchers
	// of this package read it.
	const textContent = row.table["_config"].contentType === "textContent";
	const parts = await Promise.all(
		headers.map(async header => {
			const cell = row.cell(header);
			const text = await (
				textContent ? cell.textContent({ timeout: 500 }).then(value => value ?? "") : cell.innerText({ timeout: 500 })
			).then(
				value => JSON.stringify(value.replace(/\s+/g, " ").trim()),
				() => "<no cell>"
			);
			return `${JSON.stringify(header)}: ${text}`;
		})
	);
	return `{ ${parts.join(", ")} }`;
}

/**
 * The headers of `headers` the table does not have, with the available headers. If the table cannot be
 * read (it is not attached, or a selector is invalid), the error instead.
 */
async function headerDiagnostics(table: TableLocator, headers: readonly string[]): Promise<string> {
	// Reads the body too (unlike `headerKeys()`), so an invalid body selector shows up. Only failures
	// get here, so reading the whole table is fine.
	const request: EngineTextsRequest = { op: "texts", cfg: table["_config"] };
	let available: string[];
	try {
		available = (await table.root.evaluate(readTableTexts, request, { timeout: 1_000 })).keys;
	} catch (error) {
		return describeLastError(error);
	}
	const unknown = headers.filter(header => !available.includes(header));
	return unknown.length === 0 ? "" : describeUnknown(unknown, available);
}

/**
 * Problems with the `predicate` conditions of `where` (a predicate that threw, for example because it
 * uses a variable from the test), or `""` if there are none or `where` has no predicate.
 */
async function predicateDiagnostics(table: TableLocator, where: RowWhere<string>): Promise<string> {
	const conditions = serializeWhere(where);
	if (!conditions.some(condition => hasPredicate(condition.m))) return "";
	// `_config` is private to TableLocator; the matchers of this package read it to query the engine.
	const request: EngineFindRequest = { op: "find", cfg: table["_config"], where: conditions };
	try {
		const result = await table.root.evaluate(findTableRows, request, { timeout: 1_000 });
		return describePredicateErrors(result.errors);
	} catch {
		return "";
	}
}

function hasPredicate(matcher: SerializedMatcher): boolean {
	if (matcher.t === "f") return true;
	if (matcher.t === "n") return hasPredicate(matcher.m);
	if (matcher.t === "a" || matcher.t === "l") return matcher.m.some(hasPredicate);
	return false;
}

function describePredicateErrors(errors: readonly string[]): string {
	return errors.map(error => `${error}\n`).join("");
}

/**
 * Waits until the table has every header in `headers`, up to `deadline`. Returns the diagnostics for the
 * headers that are still unknown at the deadline, or `""` once they are all known.
 */
async function waitForHeaders(table: TableLocator, headers: readonly string[], deadline: number): Promise<string> {
	const missing = (keys: readonly string[]): string[] => headers.filter(header => !keys.includes(header));
	const poll = await pollUntil(
		readTimeout => table.headerKeys({ timeout: readTimeout }),
		keys => missing(keys).length === 0,
		[] as string[],
		deadline
	);
	const unknown = missing(poll.value);
	return unknown.length === 0 ? "" : describeUnknown(unknown, poll.value) + describeLastError(poll.error);
}

function describeUnknown(unknown: readonly string[], available: readonly string[]): string {
	return (
		unknown.map(header => `Header "${header}" not found.\n`).join("") + `Available headers: [${available.join(", ")}]\n`
	);
}

/** The headers that have a condition. */
function conditionHeaders(where: RowWhere<string>): string[] {
	const entries: [string, CellMatcher | undefined][] = Object.entries(where);
	return entries.filter(entry => entry[1] !== undefined).map(entry => entry[0]);
}

/**
 * The result of a `.not` assertion with a condition on an unknown header. Such a table cannot be checked,
 * so it fails both the assertion and its negation.
 */
function uncheckable(
	state: ExpectMatcherState,
	details: {
		matcherName: string;
		receiver: string;
		argument: string;
		expected: RowWhere<string>;
		description: string;
		diagnostics: string;
		locator: string;
		timeout: number;
	}
): MatcherResult {
	return {
		name: details.matcherName,
		pass: state.isNot,
		expected: details.expected,
		actual: undefined,
		timeout: details.timeout,
		message: () =>
			state.utils.matcherHint(details.matcherName, details.receiver, details.argument, { isNot: state.isNot }) +
			"\n\n" +
			`Expected: ${details.description}\n` +
			`Received: a table that cannot be checked\n` +
			details.diagnostics +
			`${details.locator}\n` +
			`Timeout: ${details.timeout}ms`,
	};
}

/**
 * Counts the rows of `row` and the ones of them in `matching` until `row` is exactly one row with
 * `expectedMatches` matches, or until `deadline`.
 */
async function pollRowMatch(
	row: TableRow,
	matching: Locator,
	expectedMatches: number,
	deadline: number
): Promise<{ rowCount: number; reached: boolean }> {
	const reached = ([rowCount, matchCount]: number[]): boolean => rowCount === 1 && matchCount === expectedMatches;
	const poll = await pollUntil(() => Promise.all([row.locator.count(), matching.count()]), reached, [0, 0], deadline);
	return { rowCount: poll.value[0] ?? 0, reached: reached(poll.value) };
}

/** The "Received:" line of a `toHaveCells` failure, or `""` when there is nothing to report. */
function describeReceivedRow(rowCount: number, received: string | undefined): string {
	if (rowCount !== 1) return `Received: the row locator matched ${rowCount} rows, expected exactly 1\n`;
	return received === undefined ? "" : `Received: ${received}\n`;
}

function describeRowMismatches(
	rows: readonly RowWhere<string>[],
	result: EngineMatchResult,
	received: Record<string, string>[]
): string {
	let message = `Received: ${result.count} body rows\n`;
	const mismatches: number[] = [];
	result.matched.forEach((ok, index) => {
		if (!ok) mismatches.push(index);
	});
	for (const index of mismatches.slice(0, MAX_REPORTED_ROWS)) {
		const headers = Object.keys(rows[index] ?? {}).filter(header => result.keys.includes(header));
		const cells = headers.map(header => `${JSON.stringify(header)}: ${JSON.stringify(received[index]?.[header])}`);
		message += `Row ${index} does not match, received { ${cells.join(", ")} }\n`;
	}
	if (mismatches.length > MAX_REPORTED_ROWS) {
		message += `... and ${mismatches.length - MAX_REPORTED_ROWS} more rows that do not match\n`;
	}
	return message;
}

type SortCheck = {
	/** Why the column cannot be checked. */
	error?: string;
	/** Whether the error is an unknown header. */
	unknown?: boolean;
	/** The cell texts of the column. */
	values?: string[];
	/** Index of the first row that should come after the next row. */
	outOfOrder?: number;
};

function checkSorted(
	read: EngineValues,
	column: string | number,
	order: "asc" | "desc",
	type: "text" | "number" | "date",
	compare?: (a: string, b: string) => number
): SortCheck {
	const values = read.values;
	if (values === null) {
		if (typeof column === "number") return { error: `column ${column} does not exist`, unknown: true };
		if (read.keys.length === 0) return { error: "the table has no header row" };
		return { error: `Header "${column}" not found.`, unknown: true };
	}
	if (values.length === 0) return { error: "the table has no body rows" };

	let comparator: (a: string, b: string) => number;
	if (compare !== undefined) {
		comparator = compare;
	} else if (type === "text") {
		comparator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;
	} else {
		const parse = type === "number" ? parseNumber : Date.parse;
		const parsed = new Map<string, number>();
		for (const [i, text] of values.entries()) {
			const value = parse(text);
			if (isNaN(value)) {
				return { error: `row ${i} (${JSON.stringify(text)}) is not a ${type}`, values };
			}
			parsed.set(text, value);
		}
		comparator = (a, b) => (parsed.get(a) ?? 0) - (parsed.get(b) ?? 0);
	}

	const direction = order === "asc" ? 1 : -1;
	let previous: string | undefined;
	for (const [i, value] of values.entries()) {
		if (previous !== undefined && comparator(previous, value) * direction > 0) return { values, outOfOrder: i - 1 };
		previous = value;
	}
	return { values };
}

/** Parses a number from text such as `"€ 1,200.50"` or `"-3 %"`. Only `.` is a decimal separator. */
function parseNumber(text: string): number {
	const digits = text.replace(/[^\d.-]/g, "");
	return digits === "" ? NaN : Number(digits);
}

function toRecord(keys: readonly string[], texts: readonly string[]): Record<string, string> {
	const record: Record<string, string> = {};
	keys.forEach((key, index) => {
		record[key] = texts[index] ?? "";
	});
	return record;
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
