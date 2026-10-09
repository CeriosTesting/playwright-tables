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
 */
export type CellCondition =
	| { equals: string; ignoreCase?: boolean }
	| { contains: string; ignoreCase?: boolean }
	| { startsWith: string; ignoreCase?: boolean }
	| { endsWith: string; ignoreCase?: boolean }
	| { oneOf: readonly string[] }
	| { empty: true }
	| {
			/**
			 * Serialized with `toString()` and executed in the page, like a `page.evaluate` function.
			 * It must be self-contained: it cannot use variables from the test scope.
			 */
			predicate: (text: string) => boolean;
	  };

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
	? { "row() requires at least one condition": never }
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
	header?: {
		/** Index of the main header row. Defaults to the last header row. */
		setMainHeaderRow?: number;
		/** CSS selector for header rows. Defaults to `"thead>tr"`. */
		rowSelector?: string;
		/** CSS selector for header cells. Defaults to `"th"`. */
		columnSelector?: string;
	};
	row?: {
		/** CSS selector for body rows. Defaults to `"tbody>tr"`. */
		rowSelector?: string;
		/** CSS selector for body cells. Defaults to `"td"`. */
		columnSelector?: string;
	};
	/** How cell text is read, for both header and body cells. Defaults to `InnerText`. */
	cellContentType?: CellContentType;
};

/**
 * Wire format of a {@link CellMatcher} inside a `pw-table` selector.
 * @internal
 */
export type SerializedMatcher =
	| { t: "s"; v: string }
	| { t: "r"; s: string; f: string }
	| { t: "c"; op: "equals" | "contains" | "startsWith" | "endsWith"; v: string; i: boolean }
	| { t: "o"; v: string[] }
	| { t: "e" }
	| { t: "f"; src: string };

/**
 * Table configuration shared by every `pw-table` query.
 * @internal
 */
export type EngineConfig = {
	headerRow: string;
	headerCell: string;
	bodyRow: string;
	bodyCell: string;
	mainHeaderRow: number | null;
	contentType: "innerText" | "textContent";
};

/**
 * Body of a `pw-table=` selector (JSON encoded).
 * @internal
 */
export type EngineQuery =
	| { op: "row"; cfg: EngineConfig; where: { h: string; m: SerializedMatcher }[] }
	| { op: "cell"; cfg: EngineConfig; header: string }
	| { op: "column"; cfg: EngineConfig; header: string }
	| { op: "header"; cfg: EngineConfig; header: string };

/**
 * Argument for evaluating the engine function directly to read the header keys of a table.
 * @internal
 */
export type EngineKeysRequest = { op: "keys"; cfg: EngineConfig };

/**
 * The object a Playwright custom selector engine must return.
 * @internal
 */
export type SelectorEngine = {
	query(root: Node, body: string): Element | null;
	queryAll(root: Node, body: string): Element[];
};
