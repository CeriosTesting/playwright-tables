import { Locator } from "@playwright/test";

import { CellContentType } from "./cell-content-type";
import { pollTable } from "./polling";
import {
	CellMatcher,
	EngineConfig,
	EngineKeysRequest,
	EngineQuery,
	HeaderKey,
	RowWhere,
	SerializedMatcher,
	TableLocatorOptions,
	ValidRowWhere,
} from "./table-locator.types";
import { readTableHeaderKeys, TABLE_SELECTOR_ENGINE_NAME } from "./table-selector-engine";

/** Filter options accepted by `Locator.filter()`. */
export type RowFilterOptions = Parameters<Locator["filter"]>[0];

/**
 * One or more body rows of a {@link TableLocator}, with typed access to their cells.
 *
 * Instances are created by {@link TableLocator.row}, {@link TableLocator.rowAt} and {@link TableLocator.rows}.
 *
 * @example
 * const row = table.row({ Name: "John" });
 * await expect(row.locator).toBeVisible();
 * await expect(row.cell("Status")).toHaveText("Active");
 */
export class TableRow<H extends string = string> {
	/**
	 * @param _table - The table this row belongs to.
	 * @param locator - The Playwright `Locator` for the row element(s).
	 */
	constructor(
		private readonly _table: TableLocator<H>,
		readonly locator: Locator
	) {}

	/**
	 * Returns the cell of this row under `header`.
	 * If this row locator matches several rows, the cell locator matches one cell per row.
	 *
	 * @param header - The header key of the column.
	 * @returns A Playwright Locator for the cell.
	 *
	 * @example
	 * await table.row({ Name: "John" }).cell("Email").click();
	 */
	cell(header: HeaderKey<H>): Locator {
		return this._table.cell(this.locator, header);
	}

	/**
	 * Narrows these rows with `Locator.filter()` and keeps typed cell access.
	 *
	 * @param options - The same options as `Locator.filter()`.
	 * @returns A new {@link TableRow} for the filtered rows.
	 *
	 * @example
	 * await expect(table.rows.filter({ hasText: "Jane" }).cell("Status")).toHaveText("Active");
	 */
	filter(options?: RowFilterOptions): TableRow<H> {
		return new TableRow(this._table, this.locator.filter(options));
	}
}

/**
 * A type-safe table API that only returns Playwright `Locator`s.
 *
 * Header names are resolved to columns inside the browser by the `pw-table` selector engine on every
 * evaluation, so every locator auto-waits for late headers and rows, and keeps working when columns are
 * reordered at runtime. Building locators is synchronous.
 *
 * The `pw-table` selector engine must be registered first: import `test` from this package, or call
 * {@link registerTableSelectors} before the page is created.
 *
 * @example
 * import { test, expect, TableLocator } from "@cerios/playwright-table";
 *
 * test("user is active", async ({ page }) => {
 *   const users = new TableLocator(page.locator("table"), { headers: ["Name", "Status", "Email"] });
 *   await expect(users.row({ Name: "John" }).cell("Status")).toHaveText("Active");
 * });
 */
export class TableLocator<const H extends string = string> {
	/** The Playwright `Locator` pointing to the root table element. */
	readonly root: Locator;
	private readonly _config: EngineConfig;
	private readonly _headers: readonly H[] | undefined;

	/**
	 * Creates a table with customizable selectors for headers and rows.
	 * Selector defaults are the same as {@link PlaywrightTable}.
	 *
	 * @param root - The Playwright `Locator` pointing to the root table element.
	 * @param options - Optional configuration. See {@link TableLocatorOptions}.
	 * @param options.headers - (Optional) Header names, used for typed header keys and {@link validateHeaders}.
	 * @param options.header.setMainHeaderRow - (Optional) Index of the main header row. Defaults to the last header row.
	 * @param options.header.rowSelector - (Optional) CSS selector for header rows. Defaults to `"thead>tr"`.
	 * @param options.header.columnSelector - (Optional) CSS selector for header cells. Defaults to `"th"`.
	 * @param options.row.rowSelector - (Optional) CSS selector for body rows. Defaults to `"tbody>tr"`.
	 * @param options.row.columnSelector - (Optional) CSS selector for body cells. Defaults to `"td"`.
	 * @param options.cellContentType - (Optional) How cell text is read. Defaults to `InnerText`.
	 *
	 * @example
	 * // Typed headers: header arguments are checked at compile time
	 * const users = new TableLocator(page.locator("table"), { headers: ["Name", "Status"] });
	 *
	 * @example
	 * // Div based table with custom selectors
	 * const table = new TableLocator(page.locator(".divTable"), {
	 *   header: { rowSelector: ".divTableHeading > .divTableRow", columnSelector: ".divTableHead" },
	 *   row: { rowSelector: ".divTableBody > .divTableRow", columnSelector: ".divTableCell" },
	 * });
	 */
	constructor(root: Locator, options?: TableLocatorOptions<H>) {
		const headerRowSelector = options?.header?.rowSelector;
		const bodyRowSelector = options?.row?.rowSelector;
		if (headerRowSelector && bodyRowSelector && headerRowSelector === bodyRowSelector) {
			console.warn(
				`TableLocator: header.rowSelector and row.rowSelector are identical ("${headerRowSelector}"). ` +
					`This can cause header rows to be included in body rows. Consider scoping selectors to separate row groups.`
			);
		}

		this.root = root;
		this._headers = options?.headers;
		this._config = {
			headerRow: headerRowSelector ?? "thead>tr",
			headerCell: options?.header?.columnSelector ?? "th",
			bodyRow: bodyRowSelector ?? "tbody>tr",
			bodyCell: options?.row?.columnSelector ?? "td",
			mainHeaderRow: options?.header?.setMainHeaderRow ?? null,
			contentType: options?.cellContentType === CellContentType.TextContent ? "textContent" : "innerText",
		};
	}

	/**
	 * All body rows of the table.
	 *
	 * @example
	 * await expect(table.rows.locator).toHaveCount(3);
	 *
	 * @example
	 * // Compose with Locator.filter and keep typed cell access
	 * await expect(table.rows.filter({ hasText: "Jane" }).cell("Status")).toHaveText("Active");
	 */
	get rows(): TableRow<H> {
		return new TableRow(this, this.root.locator(this._config.bodyRow));
	}

	/**
	 * Body rows where every condition matches. Conditions are keyed by header; values are an exact
	 * string, a RegExp, or a {@link CellCondition}. Cell text is whitespace-collapsed and trimmed.
	 *
	 * The returned locator follows Playwright's strict mode: acting on it when several rows match throws.
	 *
	 * @param where - At least one condition. Unknown headers are compile-time errors.
	 * @returns A {@link TableRow} for the matching rows.
	 * @throws Error if no condition has a value.
	 *
	 * @example
	 * await expect(table.row({ Name: "John", Status: /active/i }).cell("Email")).toHaveText("john@example.com");
	 *
	 * @example
	 * // Declarative conditions
	 * await table.row({ Name: { startsWith: "Jo" }, Remarks: { empty: true } }).cell("Actions").click();
	 */
	row<W extends RowWhere<H>>(where: W & ValidRowWhere<H, W>): TableRow<H> {
		const conditions: { h: string; m: SerializedMatcher }[] = [];
		const entries: [string, CellMatcher | undefined][] = Object.entries(where);
		for (const [header, matcher] of entries) {
			if (matcher !== undefined) {
				conditions.push({ h: header, m: serializeMatcher(header, matcher) });
			}
		}
		if (conditions.length === 0) {
			throw new Error(`TableLocator.row() requires at least one condition.\nTable locator: ${this.root.toString()}`);
		}
		return new TableRow(this, this.root.locator(this.selector({ op: "row", cfg: this._config, where: conditions })));
	}

	/**
	 * The body row at `index`.
	 *
	 * @param index - The row number (0-based).
	 * @returns A {@link TableRow} for the row.
	 * @throws Error if index is not a non-negative integer.
	 *
	 * @example
	 * await expect(table.rowAt(0).cell("Name")).toHaveText("John");
	 */
	rowAt(index: number): TableRow<H> {
		if (index < 0 || !Number.isInteger(index)) {
			throw new Error(`Row index must be a non-negative integer, got: ${index}`);
		}
		return new TableRow(this, this.rows.locator.nth(index));
	}

	/**
	 * The cell under `header` for any row locator, for example one built with `filter()` or `nth()`.
	 *
	 * @param row - A locator for one or more body rows of this table.
	 * @param header - The header key of the column.
	 * @returns A Playwright Locator for the cell.
	 *
	 * @example
	 * const lastRow = table.rows.locator.last();
	 * await expect(table.cell(lastRow, "Name")).toHaveText("Jane");
	 */
	cell(row: Locator, header: HeaderKey<H>): Locator {
		return row.locator(this.selector({ op: "cell", cfg: this._config, header }));
	}

	/**
	 * All body cells under `header`. A cell spanning several rows is included once.
	 *
	 * @param header - The header key of the column.
	 * @returns A Playwright Locator for the cells.
	 *
	 * @example
	 * await expect(table.column("Status")).toHaveText(["Active", "Inactive", "Active"]);
	 */
	column(header: HeaderKey<H>): Locator {
		return this.root.locator(this.selector({ op: "column", cfg: this._config, header }));
	}

	/**
	 * The header cell element for `header` in the main header row.
	 *
	 * @param header - The header key of the column.
	 * @returns A Playwright Locator for the header cell.
	 *
	 * @example
	 * await table.header("Name").click(); // sort by name
	 */
	header(header: HeaderKey<H>): Locator {
		return this.root.locator(this.selector({ op: "header", cfg: this._config, header }));
	}

	/**
	 * Reads the current header keys of the main header row, exactly as the engine resolves them
	 * (including `__C`/`__D` suffixes and `{{Empty}}`). This is a snapshot, not a locator.
	 *
	 * @param options - Optional timeout for waiting until the table element is attached.
	 * @returns A promise that resolves to the header keys, or an empty array if there are no header rows.
	 *
	 * @example
	 * expect(await table.headerKeys()).toEqual(["Name", "Status", "Email"]);
	 */
	async headerKeys(options?: { timeout?: number }): Promise<string[]> {
		const request: EngineKeysRequest = { op: "keys", cfg: this._config };
		return this.root.evaluate(readTableHeaderKeys, request, options);
	}

	/**
	 * Waits until every expected header exists, and fails fast with the available headers if they don't.
	 *
	 * @param expected - The headers to check. Defaults to the `headers` option of this table.
	 * @param options - Optional timeout in milliseconds. Defaults to 5000.
	 * @returns A promise that resolves once all headers exist.
	 * @throws Error listing the missing and available headers when the timeout is reached.
	 * @throws Error if there are no headers to check.
	 *
	 * @example
	 * const users = new TableLocator(page.locator("table"), { headers: ["Name", "Status"] });
	 * await users.validateHeaders();
	 * // Error: Missing headers: [Status]
	 * //        Available headers: [Name, State]
	 */
	async validateHeaders(expected?: readonly HeaderKey<H>[], options?: { timeout?: number }): Promise<void> {
		const required: readonly string[] = expected ?? this._headers ?? [];
		if (required.length === 0) {
			throw new Error(
				"TableLocator.validateHeaders() needs headers: pass them as an argument or set `headers` in the options."
			);
		}

		const timeout = options?.timeout ?? 5_000;
		const deadline = Date.now() + timeout;
		let available: string[] = [];
		let missing: string[] = [...required];

		try {
			await pollTable(
				async () => {
					available = await this.headerKeys({ timeout: Math.max(100, deadline - Date.now()) });
					missing = required.filter(header => !available.includes(header));
					if (missing.length > 0) {
						throw new Error(`Missing headers: [${missing.join(", ")}]`);
					}
				},
				{ timeout }
			);
		} catch {
			throw new Error(
				`Missing headers: [${missing.join(", ")}]\n` +
					`Available headers: [${available.join(", ")}]\n` +
					`Table locator: ${this.root.toString()}`
			);
		}
	}

	private selector(query: EngineQuery): string {
		return `${TABLE_SELECTOR_ENGINE_NAME}=${JSON.stringify(query)}`;
	}
}

/**
 * Creates a {@link TableLocator}. Header names passed in `options.headers` are inferred as literal
 * types, so header arguments are checked and autocompleted.
 *
 * @param root - The Playwright `Locator` pointing to the root table element.
 * @param options - Optional configuration. See {@link TableLocatorOptions}.
 * @returns A new {@link TableLocator}.
 *
 * @example
 * const users = defineTable(page.locator("#users"), { headers: ["Name", "Status", "Email"] });
 * await expect(users.row({ Name: "John" }).cell("Email")).toHaveText("john@example.com");
 * // @ts-expect-error "Nme" is not a header of this table
 * users.row({ Nme: "John" });
 */
export function defineTable<const H extends string = string>(
	root: Locator,
	options?: TableLocatorOptions<H>
): TableLocator<H> {
	return new TableLocator<H>(root, options);
}

function serializeMatcher(header: string, matcher: CellMatcher): SerializedMatcher {
	if (typeof matcher === "string") {
		return { t: "s", v: matcher };
	}
	if (matcher instanceof RegExp) {
		return { t: "r", s: matcher.source, f: matcher.flags };
	}
	const ignoreCase = matcher.ignoreCase === true;
	if (matcher.predicate !== undefined) {
		if (typeof matcher.predicate !== "function") {
			throw new TypeError(`Condition for header "${header}": predicate must be a function.`);
		}
		return { t: "f", src: matcher.predicate.toString() };
	}
	if (matcher.oneOf !== undefined) {
		return { t: "o", v: [...matcher.oneOf] };
	}
	if (matcher.empty === true) {
		return { t: "e" };
	}
	if (matcher.equals !== undefined) {
		return { t: "c", op: "equals", v: matcher.equals, i: ignoreCase };
	}
	if (matcher.contains !== undefined) {
		return { t: "c", op: "contains", v: matcher.contains, i: ignoreCase };
	}
	if (matcher.startsWith !== undefined) {
		return { t: "c", op: "startsWith", v: matcher.startsWith, i: ignoreCase };
	}
	if (matcher.endsWith !== undefined) {
		return { t: "c", op: "endsWith", v: matcher.endsWith, i: ignoreCase };
	}
	if (matcher.not !== undefined) {
		return { t: "n", m: serializeMatcher(header, matcher.not) };
	}
	if (matcher.anyOf !== undefined) {
		return { t: "a", m: serializeMatchers(header, "anyOf", matcher.anyOf) };
	}
	if (matcher.allOf !== undefined) {
		return { t: "l", m: serializeMatchers(header, "allOf", matcher.allOf) };
	}
	throw new TypeError(`Condition for header "${header}" is not a supported cell matcher.`);
}

function serializeMatchers(header: string, kind: string, matchers: readonly CellMatcher[]): SerializedMatcher[] {
	if (matchers.length === 0) {
		throw new TypeError(`Condition for header "${header}": ${kind} needs at least one matcher.`);
	}
	return matchers.map(matcher => serializeMatcher(header, matcher));
}
