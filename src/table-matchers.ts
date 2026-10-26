import { expect as baseExpect, Expect, ExpectMatcherState, Locator } from "@playwright/test";

import { describeMatcher, describeWhere, serializeMatcher, serializeWhere } from "./cell-matcher-serializer";
import { describeLastError, MIN_READ_TIMEOUT, PollOutcome, pollUntil } from "./polling";
import { TableLocator, TableRow } from "./table-locator";
import {
	CellMatcher,
	DecimalSeparator,
	EngineFindRequest,
	EngineMatchRequest,
	EngineMatchResult,
	EngineMatrixRequest,
	EngineMatrixResult,
	EngineTextRequest,
	EngineTexts,
	EngineTextsRequest,
	EngineValues,
	EngineValuesRequest,
	RowWhere,
	SerializedMatcher,
	SerializedWhere,
} from "./table-locator.types";
import {
	findTableRows,
	matchTableMatrix,
	matchTableRows,
	normalizeLine,
	parseNumber,
	readCellText,
	readColumnValues,
	readTableTexts,
} from "./table-selector-engine";

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
	 * - `"number"`: the one number in the text, read with the `decimal` separator (`"€ 1,200"` is 1200).
	 *   See {@link DecimalSeparator} for the rules.
	 * - `"date"`: parsed with `Date.parse`.
	 */
	type?: "text" | "number" | "date";
	/** The decimal separator for `type: "number"`. Defaults to `"."`. */
	decimal?: DecimalSeparator;
	/**
	 * Custom comparison of two cell texts, like `Array.sort`. Runs in Node, so it can use test variables.
	 * Overrides `type`.
	 */
	compare?: (a: string, b: string) => number;
	/** Also require `aria-sort="ascending"` or `"descending"` on the header cell. Defaults to `false`. */
	ariaSort?: boolean;
};

/** Options for the `toHaveRows` and `toHaveColumnValues` matchers. */
export type TableRowsOptions = TableMatcherOptions & {
	/**
	 * Accept the rows (or values) in any order: each expected entry must match a different body row.
	 * Defaults to `false`: body row `i` must match entry `i`.
	 */
	anyOrder?: boolean;
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

	// Header names are normalized like header text, so "First\nname" finds the header "First name".
	const expected = headers.map(normalizeLine);
	const matches = (keys: string[]): boolean =>
		exact
			? keys.length === expected.length && expected.every((header, index) => keys[index] === header)
			: expected.every(header => keys.includes(header));

	const poll = await pollUntil(
		readTimeout => table.headerKeys({ timeout: readTimeout }),
		read => matches(read) !== this.isNot,
		[] as string[],
		deadline
	);
	const keys = poll.value;
	const matched = matches(keys);
	const missing = headers.filter(header => !keys.includes(normalizeLine(header)));

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
 * With `anyOrder: true`, the rows may come in any order: each entry must match a different body row.
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
	options?: TableRowsOptions
): Promise<MatcherResult> {
	const matcherName = "toHaveRows";
	const timeout = options?.timeout ?? this.timeout;
	if (options?.anyOrder === true) {
		return matchUnordered(this, { matcherName, table, rows, exact: true, timeout });
	}
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
 * Asserts that every entry of `rows` matches a different body row, in any order; other body rows are
 * allowed. With `.not`, at least one entry has no body row of its own. Retries until the timeout.
 *
 * @example
 * await expect(users).toContainRows([
 *   { Name: "Joe", Status: "Active" },
 *   { Name: "John" },
 * ]);
 */
async function toContainRows(
	this: ExpectMatcherState,
	table: TableLocator,
	rows: readonly RowWhere<string>[],
	options?: TableMatcherOptions
): Promise<MatcherResult> {
	const timeout = options?.timeout ?? this.timeout;
	return matchUnordered(this, { matcherName: "toContainRows", table, rows, exact: false, timeout });
}

/**
 * Asserts that the table has body rows and that every one of them matches `where`, for example after
 * filtering. With `.not`, at least one body row doesn't match. A table without body rows fails both,
 * so a filter that leaves nothing never passes. Retries until the timeout.
 *
 * @example
 * await page.getByLabel("Status").selectOption("Active");
 * await expect(users).toHaveEveryRow({ Status: "Active" });
 */
async function toHaveEveryRow(
	this: ExpectMatcherState,
	table: TableLocator,
	where: RowWhere<string>,
	options?: TableMatcherOptions
): Promise<MatcherResult> {
	const matcherName = "toHaveEveryRow";
	const timeout = options?.timeout ?? this.timeout;
	const conditions = serializeWhere(where);
	if (conditions.length === 0) {
		throw new Error(`${matcherName}() requires at least one condition.`);
	}
	const checkable = (result: EngineMatrixResult): boolean => result.unknown.length === 0 && result.count > 0;
	const every = (result: EngineMatrixResult): boolean => (result.matches[0]?.length ?? 0) === result.count;

	const poll = await pollMatrix(
		table,
		[conditions],
		Date.now() + timeout,
		read => checkable(read) && every(read) !== this.isNot
	);
	const result = poll.value;
	const canCheck = poll.read && checkable(result);
	const pass = canCheck ? every(result) : this.isNot;
	const failed = pass === this.isNot;
	const matching = new Set(result.matches[0] ?? []);
	const mismatches = range(result.count).filter(index => !matching.has(index));
	const body = failed && canCheck && !this.isNot ? await readBody(table) : undefined;

	return {
		name: matcherName,
		pass,
		expected: where,
		actual: result.count - mismatches.length,
		timeout,
		message: () =>
			this.utils.matcherHint(matcherName, "table", "where", { isNot: this.isNot }) +
			"\n\n" +
			`Expected: ${this.isNot ? "not every" : "every"} body row matching ${describeWhere(where)}\n` +
			(!poll.read
				? "Received: the table could not be read\n"
				: result.unknown.length > 0
					? "Received: a table that cannot be checked\n" + describeUnknown(result.unknown, result.keys)
					: result.count === 0
						? "Received: the table has no body rows\n"
						: `Received: ${result.count - mismatches.length} of ${result.count} body rows match\n`) +
			(body === undefined
				? ""
				: "Body rows that do not match:\n" + describeBodyRows(body, mismatches, conditionHeaders(where))) +
			describePredicateErrors(result.errors) +
			describeLastError(poll.error) +
			`Table locator: ${table.root.toString()}\n` +
			`Timeout: ${timeout}ms`,
	};
}

/**
 * Asserts that `column` has exactly these cell values, one per body row: body row `i` matches `values[i]`,
 * or with `anyOrder: true`, each value matches a different body row. Values are an exact string, a RegExp
 * or a {@link CellCondition}, compared as in row conditions. With `.not`, the column must not match.
 * Retries until the timeout.
 *
 * @example
 * await expect(users).toHaveColumnValues("Status", ["Active", "Inactive", "Active"]);
 * await expect(orders).toHaveColumnValues("Total", [{ gt: 0 }, { gt: 0 }], { anyOrder: true });
 */
async function toHaveColumnValues(
	this: ExpectMatcherState,
	table: TableLocator,
	column: string | number,
	values: readonly CellMatcher[],
	options?: TableRowsOptions
): Promise<MatcherResult> {
	const matcherName = "toHaveColumnValues";
	const timeout = options?.timeout ?? this.timeout;
	const anyOrder = options?.anyOrder === true;
	if (typeof column === "number" && (column < 0 || !Number.isInteger(column))) {
		throw new Error(`Column index must be a non-negative integer, got: ${column}`);
	}
	const header = typeof column === "string" ? normalizeLine(column) : column;
	const label = String(column);
	const rows: SerializedWhere[] = values.map(value => [{ h: header, m: serializeMatcher(label, value) }]);
	// `_config` is private to TableLocator; the matchers of this package read it to query the engine.
	const request: EngineMatchRequest = { op: "match", cfg: table["_config"], rows };
	const matches = (result: EngineMatchResult): boolean =>
		result.unknown.length === 0 && result.count === values.length && result.matched.every(Boolean);
	const accept = (result: EngineMatchResult): boolean =>
		matches(result) !== this.isNot && (!this.isNot || result.unknown.length === 0);

	let poll: PollOutcome<EngineMatchResult>;
	if (anyOrder) {
		// The matrix lists every body row a value matches; the values match when each gets a row of its own.
		const matrix = await pollMatrix(table, rows, Date.now() + timeout, read => accept(fromMatrix(read)));
		poll = { ...matrix, value: fromMatrix(matrix.value) };
	} else {
		poll = await pollUntil(
			readTimeout => table.root.evaluate(matchTableRows, request, { timeout: readTimeout }),
			accept,
			{ keys: [], rows: [], count: 0, matched: [], unknown: [], errors: [] },
			Date.now() + timeout
		);
	}
	const result = poll.value;
	const uncheckable = !poll.read || result.unknown.length > 0;
	const pass = uncheckable ? this.isNot : matches(result);
	const received =
		pass === this.isNot && !uncheckable ? await readValues(table, header).catch(() => undefined) : undefined;

	return {
		name: matcherName,
		pass,
		expected: values,
		actual: received,
		timeout,
		message: () =>
			this.utils.matcherHint(matcherName, "table", "values", { isNot: this.isNot }) +
			"\n\n" +
			`Expected: ${typeof column === "number" ? `column ${column}` : `column ${JSON.stringify(column)}`} ` +
			`${this.isNot ? "not " : ""}with ${values.length} values${anyOrder ? " in any order" : ""}: ` +
			`[${values.map(describeMatcher).join(", ")}]\n` +
			(!poll.read
				? "Received: the table could not be read\n"
				: result.unknown.length > 0
					? "Received: a table that cannot be checked\n" + describeUnknown(result.unknown, result.keys)
					: describeReceivedValues(values, result, received, anyOrder, this.isNot)) +
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
		decimal: options?.decimal ?? ".",
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
	decimal: DecimalSeparator;
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
	const request: EngineValuesRequest = {
		op: "values",
		cfg: table["_config"],
		column: typeof column === "string" ? normalizeLine(column) : column,
	};
	const evaluate = (read: SortRead): { check: SortCheck; sorted: boolean } => {
		const check = checkSorted(read.column, column, sort);
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
 * - `toHaveRows(rows, options?)`: exactly these body rows, in order (or `anyOrder`), each matching its conditions.
 * - `toContainRows(rows, options?)`: each entry matches a different body row, in any order; other rows are allowed.
 * - `toHaveEveryRow(where, options?)`: there are body rows, and every one matches the conditions.
 * - `toHaveColumnValues(column, values, options?)`: one value per body row, in order (or `anyOrder`).
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
	toContainRows: typeof toContainRows;
	toHaveEveryRow: typeof toHaveEveryRow;
	toHaveColumnValues: typeof toHaveColumnValues;
	toHaveHeaders: typeof toHaveHeaders;
	toHaveCells: typeof toHaveCells;
	toBeSortedBy: typeof toBeSortedBy;
} = {
	toHaveRow,
	toHaveRowCount,
	toHaveRows,
	toContainRows,
	toHaveEveryRow,
	toHaveColumnValues,
	toHaveHeaders,
	toHaveCells,
	toBeSortedBy,
};

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
 *   await expect(users).toContainRows([{ Name: "Joe" }, { Name: "John" }]);
 *   await expect(users).toHaveColumnValues("Status", ["Active", "Inactive", "Active"]);
 *   await users.header("Name").click();
 *   await expect(users).toBeSortedBy("Name");
 *   await expect(users.row({ Name: "John" })).toHaveCells({ Status: "Active" });
 * });
 */
export const expect: Expect<typeof tableMatchers> = baseExpect.extend(tableMatchers);

async function readCells(row: TableRow, headers: readonly string[]): Promise<string> {
	// Read the cells the way the table compares them. `_config` is private to TableLocator; the matchers
	// of this package read it.
	const request: EngineTextRequest = { op: "text", cfg: row.table["_config"] };
	const parts = await Promise.all(
		headers.map(async header => {
			const text = await row
				.cell(header)
				.evaluate(readCellText, request, { timeout: 1_000 })
				.then(
					value => JSON.stringify(value),
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
	const unknown = headers.filter(header => !available.includes(normalizeLine(header)));
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
	const missing = (keys: readonly string[]): string[] =>
		headers.filter(header => !keys.includes(normalizeLine(header)));
	const poll = await pollUntil(
		readTimeout => table.headerKeys({ timeout: readTimeout }),
		keys => missing(keys).length === 0,
		[] as string[],
		deadline
	);
	const unknown = missing(poll.value);
	return unknown.length === 0 ? "" : describeUnknown(unknown, poll.value) + describeLastError(poll.error);
}

function describeUnknown(unknown: readonly (string | number)[], available: readonly string[]): string {
	return (
		unknown
			.map(header =>
				typeof header === "number" ? `Column ${header} does not exist.\n` : `Header "${header}" not found.\n`
			)
			.join("") + `Available headers: [${available.join(", ")}]\n`
	);
}

/** Reads the matrix of `rows` until `done` accepts it, or until `deadline`. */
function pollMatrix(
	table: TableLocator,
	rows: SerializedWhere[],
	deadline: number,
	done: (result: EngineMatrixResult) => boolean
): Promise<PollOutcome<EngineMatrixResult>> {
	// `_config` is private to TableLocator; the matchers of this package read it to query the engine.
	const request: EngineMatrixRequest = { op: "matrix", cfg: table["_config"], rows };
	return pollUntil(
		readTimeout => table.root.evaluate(matchTableMatrix, request, { timeout: readTimeout }),
		done,
		{ keys: [], count: 0, matches: [], unknown: [], errors: [] },
		deadline
	);
}

/**
 * Gives each expected row a different body row, as many as possible (a maximum bipartite matching), so
 * overlapping conditions such as `{ Status: "Active" }` and `{ Name: "John" }` don't steal each other's
 * rows. `matches[i]` lists the body rows expected row `i` matches. Returns the body row of every expected
 * row, or -1 for the ones left without.
 */
function assignRows(matches: readonly (readonly number[])[]): number[] {
	const assigned = matches.map(() => -1);
	const owner = new Map<number, number>();
	const assign = (expected: number, seen: Set<number>): boolean => {
		for (const row of matches[expected] ?? []) {
			if (seen.has(row)) continue;
			seen.add(row);
			const current = owner.get(row);
			if (current === undefined || assign(current, seen)) {
				owner.set(row, expected);
				assigned[expected] = row;
				return true;
			}
		}
		return false;
	};
	matches.forEach((_rows, expected) => assign(expected, new Set()));
	return assigned;
}

/** A matrix result as a match result: entry `i` matches when it has a body row of its own. */
function fromMatrix(result: EngineMatrixResult): EngineMatchResult {
	return {
		keys: result.keys,
		rows: [],
		count: result.count,
		matched: assignRows(result.matches).map(row => row !== -1),
		unknown: result.unknown,
		errors: result.errors,
	};
}

/** `toContainRows`, and `toHaveRows` with `anyOrder`: each entry of `rows` matches a different body row. */
async function matchUnordered(
	state: ExpectMatcherState,
	details: {
		matcherName: string;
		table: TableLocator;
		rows: readonly RowWhere<string>[];
		/** Whether the table must have exactly as many body rows as `rows`. */
		exact: boolean;
		timeout: number;
	}
): Promise<MatcherResult> {
	const { matcherName, table, rows, exact, timeout } = details;
	const matches = (result: EngineMatchResult): boolean =>
		result.unknown.length === 0 && result.matched.every(Boolean) && (!exact || result.count === rows.length);

	const poll = await pollMatrix(
		table,
		rows.map(serializeWhere),
		Date.now() + timeout,
		// With `.not`, an unknown header is not a pass: keep waiting for it to show up.
		read => {
			const result = fromMatrix(read);
			return matches(result) !== state.isNot && (!state.isNot || result.unknown.length === 0);
		}
	);
	const result = fromMatrix(poll.value);
	const uncheckable = !poll.read || result.unknown.length > 0;
	const pass = uncheckable ? state.isNot : matches(result);
	const failed = pass === state.isNot;
	const body = failed && !uncheckable ? await readBody(table) : undefined;
	const missing = range(rows.length).filter(index => result.matched[index] !== true);
	const headers = rows.flatMap(conditionHeaders);

	return {
		name: matcherName,
		pass,
		expected: rows,
		actual: body?.rows.map(texts => toRecord(body.keys, texts)),
		timeout,
		message: () =>
			state.utils.matcherHint(matcherName, "table", "rows", { isNot: state.isNot }) +
			"\n\n" +
			`Expected: ${state.isNot ? "not " : ""}${exact ? `${rows.length} body rows` : "body rows"} ` +
			`matching, in any order${exact ? "" : " (other rows allowed)"}\n` +
			rows.map((where, index) => `  [${index}] ${describeWhere(where)}\n`).join("") +
			(!poll.read
				? "Received: the table could not be read\n"
				: `Received: ${result.count} body rows${
						state.isNot && !uncheckable ? `, and every entry matches a different one` : ""
					}\n`) +
			(state.isNot || uncheckable
				? ""
				: missing
						.slice(0, MAX_REPORTED_ROWS)
						.map(index => `No body row left for [${index}] ${describeWhere(rows[index] ?? {})}\n`)
						.join("") +
					(missing.length > MAX_REPORTED_ROWS ? `... and ${missing.length - MAX_REPORTED_ROWS} more\n` : "")) +
			(body === undefined ? "" : "Body rows:\n" + describeBodyRows(body, range(body.rows.length), headers)) +
			(result.unknown.length > 0 ? describeUnknown(result.unknown, result.keys) : "") +
			describePredicateErrors(result.errors) +
			describeLastError(poll.error) +
			`Table locator: ${table.root.toString()}\n` +
			`Timeout: ${timeout}ms`,
	};
}

/** Reads the header keys and body cell texts for a failure message, or `undefined` if that fails. */
async function readBody(table: TableLocator): Promise<EngineTexts | undefined> {
	// `_config` is private to TableLocator; the matchers of this package read it to query the engine.
	const request: EngineTextsRequest = { op: "texts", cfg: table["_config"] };
	return table.root.evaluate(readTableTexts, request, { timeout: 1_000 }).catch(() => undefined);
}

/** Reads the body cell texts of `column` for a failure message. */
async function readValues(table: TableLocator, column: string | number): Promise<string[] | undefined> {
	// `_config` is private to TableLocator; the matchers of this package read it to query the engine.
	const request: EngineValuesRequest = { op: "values", cfg: table["_config"], column };
	const read = await table.root.evaluate(readColumnValues, request, { timeout: 1_000 });
	return read.values ?? undefined;
}

/** Longest cell text shown in a table of body rows. */
const MAX_CELL_WIDTH = 30;

/**
 * The body rows at `indexes` as an aligned text table, with the row index in front. Only the columns of
 * `headers` are shown (all of them if none of `headers` is a column), and at most `MAX_REPORTED_ROWS` rows.
 *
 * @example
 *   #  | Name | Status
 *   0  | John | Active
 */
function describeBodyRows(
	body: EngineTexts,
	indexes: readonly number[],
	headers: readonly (string | number)[]
): string {
	if (indexes.length === 0) return "  (none)\n";
	const columns: number[] = [];
	for (const header of headers) {
		const column = typeof header === "number" ? header : body.keys.indexOf(normalizeLine(header));
		if (column >= 0 && column < body.keys.length && !columns.includes(column)) columns.push(column);
	}
	if (columns.length === 0) columns.push(...range(body.keys.length));

	const shown = indexes.slice(0, MAX_REPORTED_ROWS);
	const cell = (text: string): string => {
		const line = text.replace(/\n/g, "↵");
		return line.length > MAX_CELL_WIDTH ? `${line.slice(0, MAX_CELL_WIDTH - 1)}…` : line;
	};
	const lines = [
		["#", ...columns.map(column => cell(body.keys[column] ?? ""))],
		...shown.map(index => [String(index), ...columns.map(column => cell(body.rows[index]?.[column] ?? ""))]),
	];
	const widths = (lines[0] ?? []).map((_text, c) => Math.max(...lines.map(line => line[c]?.length ?? 0)));
	let table = lines
		.map(line => `  ${line.map((text, c) => text.padEnd(widths[c] ?? 0)).join(" | ")}`.trimEnd() + "\n")
		.join("");
	if (indexes.length > shown.length) table += `  ... and ${indexes.length - shown.length} more rows\n`;
	return table;
}

/** The "Received:" lines of a `toHaveColumnValues` failure. */
function describeReceivedValues(
	values: readonly CellMatcher[],
	result: EngineMatchResult,
	received: readonly string[] | undefined,
	anyOrder: boolean,
	isNot: boolean
): string {
	const shown = (received ?? []).slice(0, MAX_REPORTED_VALUES).map(value => JSON.stringify(value));
	if (received !== undefined && received.length > MAX_REPORTED_VALUES) {
		shown.push(`... ${received.length - MAX_REPORTED_VALUES} more`);
	}
	let message = received === undefined ? `Received: ${result.count} body rows\n` : `Received: [${shown.join(", ")}]\n`;
	if (isNot) return message;
	if (result.count !== values.length) message += `Expected ${values.length} values, received ${result.count}\n`;
	const mismatches = range(Math.min(values.length, result.matched.length)).filter(i => result.matched[i] !== true);
	for (const index of mismatches.slice(0, MAX_REPORTED_ROWS)) {
		const value = values[index];
		const description = value === undefined ? "" : describeMatcher(value);
		message += anyOrder
			? `No body row left for value [${index}] ${description}\n`
			: `Row ${index} does not match ${description}, received ${JSON.stringify(received?.[index])}\n`;
	}
	if (mismatches.length > MAX_REPORTED_ROWS) {
		message += `... and ${mismatches.length - MAX_REPORTED_ROWS} more that do not match\n`;
	}
	return message;
}

/** The numbers `0` to `count - 1`. */
function range(count: number): number[] {
	return Array.from({ length: count }, (_value, index) => index);
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
		const headers = Object.keys(rows[index] ?? {}).filter(header => result.keys.includes(normalizeLine(header)));
		const cells = headers.map(
			header => `${JSON.stringify(header)}: ${JSON.stringify(received[index]?.[normalizeLine(header)])}`
		);
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

function checkSorted(read: EngineValues, column: string | number, sort: SortSettings): SortCheck {
	const { order, type, compare, decimal } = sort;
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
		const parse = type === "number" ? (text: string) => parseNumber(text, decimal) : Date.parse;
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

function toRecord(keys: readonly string[], texts: readonly string[]): Record<string, string> {
	const record: Record<string, string> = {};
	keys.forEach((key, index) => {
		record[key] = texts[index] ?? "";
	});
	return record;
}
