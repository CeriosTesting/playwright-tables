import { CellContentType } from "./cell-content-type";

/**
 * A header key accepted by {@link TableLocator}: a plain header name, a colspan continuation
 * (`Name__C1`, `Name__C2`, ...) or a duplicate header (`Name__D1`, `Name__D2`, ...).
 *
 * These are the same keys that `PlaywrightTable.getJson()` produces.
 *
 * @example
 * type Keys = HeaderKey<"Name" | "Status">;
 * // "Name" | "Status" | `Name__C${number}` | `Status__C${number}` | `Name__D${number}` | `Status__D${number}`
 */
export type HeaderKey<H extends string> = H | `${H}__C${number}` | `${H}__D${number}`;

/**
 * A column of a {@link TableLocator}: a {@link HeaderKey}, or a 0-based column index on the visual grid
 * (rowspan and colspan aware). Column indexes also work for tables without header rows.
 *
 * @example
 * table.rowAt(0).cell("Name");
 * table.rowAt(0).cell(2);
 */
export type ColumnKey<H extends string> = HeaderKey<H> | number;

/**
 * A declarative cell condition. Exactly one key per condition.
 *
 * Cell text is always whitespace-collapsed and trimmed before it is compared.
 *
 * @example
 * table.row({ Name: { contains: "john", ignoreCase: true } });
 * table.row({ Status: { oneOf: ["Active", "Pending"] } });
 * table.row({ Remarks: { empty: true } });
 * // Runs in the browser, so it must not use variables from the test scope.
 * table.row({ Age: { predicate: text => Number(text) >= 18 } });
 * // Combinators
 * table.row({ Status: { not: "Deleted" } });
 * table.row({ Email: { anyOf: [{ endsWith: "@example.com" }, /@test\./] } });
 * table.row({ Name: { allOf: [{ startsWith: "J" }, { not: { contains: "Doe" } }] } });
 */
export type CellCondition =
	| ExclusiveCondition<{ equals: string; ignoreCase?: boolean }>
	| ExclusiveCondition<{ contains: string; ignoreCase?: boolean }>
	| ExclusiveCondition<{ startsWith: string; ignoreCase?: boolean }>
	| ExclusiveCondition<{ endsWith: string; ignoreCase?: boolean }>
	| ExclusiveCondition<{ oneOf: readonly string[] }>
	| ExclusiveCondition<{ empty: true }>
	| ExclusiveCondition<{
			/**
			 * Serialized with `toString()` and executed in the page, like a `page.evaluate` function.
			 * It must be self-contained: it cannot use variables from the test scope.
			 */
			predicate: (text: string) => boolean;
	  }>
	| ExclusiveCondition<{ not: CellMatcher }>
	| ExclusiveCondition<{ anyOf: readonly [CellMatcher, ...CellMatcher[]] }>
	| ExclusiveCondition<{ allOf: readonly [CellMatcher, ...CellMatcher[]] }>;

type CellConditionKey =
	| "equals"
	| "contains"
	| "startsWith"
	| "endsWith"
	| "oneOf"
	| "empty"
	| "predicate"
	| "not"
	| "anyOf"
	| "allOf"
	| "ignoreCase";

/** Forbids the keys of the other condition kinds, so a condition object has exactly one kind. */
type ExclusiveCondition<T> = T & { [K in Exclude<CellConditionKey, keyof T>]?: never };

/**
 * How a cell is matched: an exact string, a RegExp, or a {@link CellCondition}.
 */
export type CellMatcher = string | RegExp | CellCondition;

/**
 * Row conditions keyed by header. Every condition must match for a row to be selected.
 */
export type RowWhere<H extends string> = { [K in HeaderKey<H>]?: CellMatcher };

/**
 * Compile-time guard for {@link RowWhere}: rejects an empty object and keys that are not a
 * {@link HeaderKey} of `H`. Intersect it with the inferred conditions type `W`.
 */
export type ValidRowWhere<H extends string, W> = ([keyof W] extends [never]
	? "row() requires at least one condition"
	: unknown) &
	([Exclude<keyof W, HeaderKey<H>>] extends [never] ? unknown : { [K in Exclude<keyof W, HeaderKey<H>>]: never });

/**
 * Options for {@link TableLocator}.
 *
 * @example
 * const options: TableLocatorOptions<"Name" | "Status"> = {
 *   headers: ["Name", "Status"],
 *   header: { rowSelector: "thead>tr", columnSelector: "th" },
 *   row: { rowSelector: "tbody>tr", columnSelector: "td" },
 *   cellContentType: CellContentType.InnerText,
 * };
 */
export type TableLocatorOptions<H extends string> = {
	/**
	 * The header names of the table. Used to infer typed header keys and by
	 * {@link TableLocator.validateHeaders}. Does not restrict anything at runtime by itself.
	 */
	headers?: readonly H[];
	/**
	 * Use ARIA roles instead of HTML table elements for the default selectors, for grids built from
	 * other elements (such as AG Grid or MUI Data Grid). Selectors you set yourself still win.
	 * Defaults to `false`.
	 *
	 * - Header rows: `[role=row]` with a `[role=columnheader]` inside; header cells: `[role=columnheader]`.
	 * - Body rows: the other `[role=row]`s; body cells: `[role=gridcell]`, `[role=cell]` and `[role=rowheader]`.
	 *
	 * `aria-colindex`, `aria-rowindex`, `aria-colspan` and `aria-rowspan` are used whenever they are
	 * present, with or without this option.
	 */
	aria?: boolean;
	header?: {
		/** Index of the main header row. Defaults to the last header row. */
		setMainHeaderRow?: number;
		/**
		 * CSS selector for header rows. Defaults to `"thead>tr"`, plus the leading rows of `<th>` cells (and
		 * no `<td>`) in the first `<tbody>` of a table without a `<thead>`.
		 */
		rowSelector?: string;
		/** CSS selector for header cells. Defaults to `"th, td"`. */
		columnSelector?: string;
		/**
		 * Removes icon font glyphs (Unicode private use characters, such as sort arrows) from header
		 * text before it is used as a header key. Defaults to `false`.
		 */
		stripIconGlyphs?: boolean;
	};
	row?: {
		/** CSS selector for body rows. Defaults to `"tbody>tr"`, without the header rows of a table without a `<thead>`. */
		rowSelector?: string;
		/** CSS selector for body cells. Defaults to `"td, th"`, so row header cells are columns too. */
		columnSelector?: string;
	};
	/** How cell text is read, for both header and body cells. Defaults to `InnerText`. */
	cellContentType?: CellContentType;
};

/**
 * Options for {@link TableLocator.toJson}.
 *
 * @example
 * await users.toJson({ minRows: 1, timeout: 10_000 });
 */
export type TableJsonOptions = {
	/**
	 * Wait for a header row and at least this many body rows with content (a row where at least one cell
	 * has text) before reading. Defaults to `0`: read once, without waiting.
	 */
	minRows?: number;
	/**
	 * With `minRows`, the time to wait in milliseconds. Defaults to 5000.
	 * Without it, the time to wait for the table element to be attached.
	 */
	timeout?: number;
};

/**
 * Wire format of a {@link CellMatcher} inside a `pw-table-v1` selector.
 * @internal
 */
export type SerializedMatcher =
	| { t: "s"; v: string }
	| { t: "r"; s: string; f: string }
	| { t: "c"; op: "equals" | "contains" | "startsWith" | "endsWith"; v: string; i: boolean }
	| { t: "o"; v: string[] }
	| { t: "e" }
	| { t: "f"; src: string }
	| { t: "n"; m: SerializedMatcher }
	| { t: "a"; m: SerializedMatcher[] }
	| { t: "l"; m: SerializedMatcher[] };

/**
 * Table configuration shared by every `pw-table-v1` query.
 * @internal
 */
export type EngineConfig = {
	headerRow: string;
	headerCell: string;
	bodyRow: string;
	bodyCell: string;
	mainHeaderRow: number | null;
	contentType: "innerText" | "textContent";
	stripIconGlyphs: boolean;
};

/**
 * Row conditions in wire format: one entry per header, every entry must match.
 * @internal
 */
export type SerializedWhere = { h: string; m: SerializedMatcher }[];

/**
 * Body of a `pw-table-v1=` selector (JSON encoded).
 * @internal
 */
export type EngineQuery =
	| { op: "rows"; cfg: EngineConfig }
	| { op: "row"; cfg: EngineConfig; where: SerializedWhere }
	| { op: "cell"; cfg: EngineConfig; header: string | number }
	| { op: "column"; cfg: EngineConfig; header: string | number }
	| { op: "header"; cfg: EngineConfig; header: string | number };

/**
 * Argument for evaluating the engine function directly to read the header keys of a table.
 * @internal
 */
export type EngineKeysRequest = { op: "keys"; cfg: EngineConfig };

/**
 * Argument for evaluating the engine function directly to read the text of every body cell.
 * @internal
 */
export type EngineTextsRequest = { op: "texts"; cfg: EngineConfig };

/**
 * Argument for evaluating the engine function directly to match every body row against its own conditions.
 * @internal
 */
export type EngineMatchRequest = { op: "match"; cfg: EngineConfig; rows: SerializedWhere[] };

/**
 * Argument for evaluating the engine function directly to read the text of every body cell in one column.
 * @internal
 */
export type EngineValuesRequest = { op: "values"; cfg: EngineConfig; column: string | number };

/**
 * Argument for evaluating the engine function directly to count the body rows that match `where`.
 * @internal
 */
export type EngineFindRequest = { op: "find"; cfg: EngineConfig; where: SerializedWhere };

/**
 * Result of an {@link EngineFindRequest}: the number of matching body rows, and the problems with
 * `predicate` conditions (a predicate that could not be compiled, threw or returned a promise).
 * @internal
 */
export type EngineFindResult = { matches: number; errors: string[] };

/**
 * Header keys and body cell texts of a table. `rows[r][c]` is the text of body row `r` under `keys[c]`.
 * @internal
 */
export type EngineTexts = { keys: string[]; rows: string[][] };

/**
 * Result of an {@link EngineMatchRequest}. `count` is the number of body rows. `matched[r]` tells whether
 * body row `r` matches `rows[r]` of the request; it only has entries for rows that exist in both.
 * `unknown` lists headers that are not header keys of the table. `rows` (the cell texts) is only filled
 * in when the table does not match, because only a failure message needs it. `errors` lists problems
 * with `predicate` conditions.
 * @internal
 */
export type EngineMatchResult = EngineTexts & {
	count: number;
	matched: boolean[];
	unknown: string[];
	errors: string[];
};

/**
 * Result of an {@link EngineValuesRequest}: the header keys, and the cell text of every body row in the
 * column, or `null` if the table has no such column.
 * @internal
 */
export type EngineValues = { keys: string[]; values: string[] | null };

/**
 * The object a Playwright custom selector engine must return.
 * @internal
 */
export type SelectorEngine = {
	query(root: Node, body: string): Element | null;
	queryAll(root: Node, body: string): Element[];
};
