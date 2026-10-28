import type { Locator } from "@playwright/test";

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
 * Cell text is compared as the user sees it: each line whitespace-collapsed and trimmed, lines joined
 * with one `\n`, without icon glyphs, invisible characters or visually hidden text. Expected values are
 * normalized the same way, so `"Street 1\r\nAmsterdam"` matches a cell showing two lines.
 *
 * @example
 * table.row({ Name: { contains: "john", ignoreCase: true } });
 * table.row({ Status: { oneOf: ["Active", "Pending"] } });
 * table.row({ Remarks: { empty: true } });
 * // Runs in the browser, so it must not use variables from the test scope.
 * table.row({ Age: { predicate: text => Number(text) >= 18 } });
 * // The second argument is the raw cell text (`innerText` or `textContent`, unnormalized).
 * table.row({ Name: { predicate: (text, raw) => raw.includes("\u00a0") } });
 * // Combinators
 * table.row({ Status: { not: "Deleted" } });
 * table.row({ Email: { anyOf: [{ endsWith: "@example.com" }, /@test\./] } });
 * table.row({ Name: { allOf: [{ startsWith: "J" }, { not: { contains: "Doe" } }] } });
 * // Numeric comparisons on the number in the cell (see {@link NumberCondition})
 * table.row({ Age: { gte: 18 } });
 * table.row({ Price: { between: [10, 20], decimal: "," } });
 */
export type CellCondition =
	| ExclusiveCondition<{ equals: string; ignoreCase?: boolean }>
	| ExclusiveCondition<{ contains: string; ignoreCase?: boolean }>
	| ExclusiveCondition<{ startsWith: string; ignoreCase?: boolean }>
	| ExclusiveCondition<{ endsWith: string; ignoreCase?: boolean }>
	| ExclusiveCondition<{ oneOf: readonly string[]; ignoreCase?: boolean }>
	/** `true`: the cell has no text. `false`: the cell has text. */
	| ExclusiveCondition<{ empty: boolean }>
	| ExclusiveCondition<{
			/**
			 * Serialized with `toString()` and executed in the page, like a `page.evaluate` function.
			 * It must be self-contained: it cannot use variables from the test scope.
			 *
			 * `text` is the normalized cell text that the other conditions compare; `raw` is the cell text
			 * exactly as the browser reads it (`innerText`, or `textContent`), without any normalization.
			 */
			predicate: (text: string, raw: string) => boolean;
	  }>
	| ExclusiveCondition<{ not: CellMatcher }>
	| ExclusiveCondition<{ anyOf: readonly [CellMatcher, ...CellMatcher[]] }>
	| ExclusiveCondition<{ allOf: readonly [CellMatcher, ...CellMatcher[]] }>
	| NumberCondition;

/**
 * A numeric cell condition: the cell holds exactly one number, and it compares as asked. `between` is
 * inclusive. A cell without a number, or with more than one, never matches.
 *
 * The number is read like {@link DecimalSeparator} describes: `"€ 1,200.50"` is 1200.5 and, with
 * `decimal: ","`, `"1.234,5 kg"` is 1234.5.
 *
 * @example
 * table.row({ Age: { gt: 65 } });
 * table.row({ Total: { between: [100, 200] } });
 */
export type NumberCondition =
	| ExclusiveCondition<{ gt: number; decimal?: DecimalSeparator }>
	| ExclusiveCondition<{ gte: number; decimal?: DecimalSeparator }>
	| ExclusiveCondition<{ lt: number; decimal?: DecimalSeparator }>
	| ExclusiveCondition<{ lte: number; decimal?: DecimalSeparator }>
	| ExclusiveCondition<{ between: readonly [number, number]; decimal?: DecimalSeparator }>;

/**
 * The decimal separator of the numbers in a table. Defaults to `"."`.
 *
 * A number is the one run of digits in the text, with an optional `-` or `−` in front (a currency symbol
 * may come in between). Digits are grouped by the other separator, `'`, or a (non-breaking) space, in
 * groups of three: with `"."`, `"1,234.5"`, `"1 234.5"` and `"1'234.5"` are all 1234.5. Other text, such
 * as a currency or a unit, is ignored. Text with no number, or with more than one, is not a number.
 */
export type DecimalSeparator = "." | ",";

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
	| "gt"
	| "gte"
	| "lt"
	| "lte"
	| "between"
	| "ignoreCase"
	| "decimal";

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
	};
	row?: {
		/**
		 * CSS selector for body rows. Defaults to `"tbody>tr"` (and `<tr>` right inside a `<table>` built
		 * without a `<tbody>`), without the header rows of a table without a `<thead>`.
		 */
		rowSelector?: string;
		/** CSS selector for body cells. Defaults to `"td, th"`, so row header cells are columns too. */
		columnSelector?: string;
	};
	footer?: {
		/**
		 * CSS selector for footer rows, such as a totals row. Their cells are found with `row.columnSelector`.
		 * Defaults to `"tfoot>tr"`, or no footer rows with `aria: true`. Footer rows are not body rows.
		 */
		rowSelector?: string;
	};
	/**
	 * How to go to the next page of a paginated table, so {@link TableLocator.findRow},
	 * `toJson({ allRows: true })` and {@link TableLocator.totalRowCount} see every page.
	 * See {@link PaginateOptions}.
	 */
	paginate?: PaginateOptions;
	/**
	 * How to scroll a virtualized grid (one that only renders the rows in view), so
	 * {@link TableLocator.findRow}, `toJson({ allRows: true })` and {@link TableLocator.totalRowCount}
	 * see every row. See {@link ScrollOptions}.
	 */
	scroll?: ScrollOptions;
	/**
	 * The loading indicator of the table, such as a spinner or an overlay. {@link TableLocator.waitForStable}
	 * and the page and scroll navigation wait until it is hidden.
	 */
	loading?: LocatorRef;
	/**
	 * CSS selector of placeholder rows, such as a "No data" row, that are never body rows: `rows`, `row()`,
	 * `toJson()`, the matchers and the row counts leave them out, so an empty table has 0 body rows.
	 *
	 * @example
	 * emptyRow: ".no-data"
	 */
	emptyRow?: string;
	/**
	 * Read the current value of text inputs and text areas in body cells as cell text, in row conditions,
	 * `toJson()`, `columnValues()` and the matchers, for editable grids and cells in edit mode. Text-like
	 * inputs only (`text`, `email`, `number`, `search`, `tel`, `url` and the date and time types):
	 * checkboxes, buttons, files and passwords stay out, and a `<select>` always reads as its selected option.
	 * Header cells never read their inputs, so filter fields don't end up in the header keys. Raw text
	 * (`raw: true`, a predicate's `raw`) is not affected. Defaults to `false`, like Playwright's `toHaveText`.
	 *
	 * @example
	 * const people = defineTable(page.locator("#people"), { readInputValues: true });
	 * await expect(people).toHaveRow({ Email: "john@example.org" }); // <td><input value="john@example.org"></td>
	 */
	readInputValues?: boolean;
	/**
	 * The control that selects a row, from the row locator, for {@link TableRow.select},
	 * {@link TableRow.deselect} and {@link TableRow.isSelected}. Defaults to the checkbox in a selection
	 * column: a column without header text (such as one with only a "select all" checkbox). A checkbox in a
	 * column with header text, such as "Active", is data and never selects the row.
	 *
	 * @example
	 * select: row => row.getByRole("checkbox", { name: "Select row" })
	 */
	select?: (row: Locator) => Locator;
	/**
	 * How cell text is read, for both header and body cells. Defaults to `InnerText`: the text as it is
	 * shown, without hidden text and with CSS `text-transform`. `TextContent` reads all text in the DOM,
	 * hidden text included. Either way, the text is normalized (see {@link CellCondition}).
	 */
	cellContentType?: CellContentType;
	/**
	 * CSS selectors of elements inside header and body cells whose text is left out, such as screen reader
	 * only text and icons. Defaults to {@link DEFAULT_IGNORE}: `.sr-only`, `.visually-hidden`, the Material
	 * Icons and Material Symbols classes, and `[aria-hidden=true]`.
	 *
	 * Setting it replaces the defaults. Spread them to add your own (`[...DEFAULT_IGNORE, ".sort-icon"]`),
	 * or pass `[]` to read all text. Raw values (`toJson({ raw: true })`, a predicate's `raw`) are never
	 * filtered.
	 */
	ignore?: readonly string[];
};

/**
 * A Playwright `Locator`, or a function that finds it from the table root. A function lets an option point
 * inside the table before the root is known, as the grid presets do.
 *
 * @example
 * const next: LocatorRef = root => root.getByRole("button", { name: "Next page" });
 */
export type LocatorRef = Locator | ((root: Locator) => Locator);

/**
 * Options for the `paginate` option of {@link TableLocator}.
 *
 * @example
 * defineTable(page.locator("#users"), {
 *   paginate: { next: page.getByRole("button", { name: "Next" }), first: page.getByRole("button", { name: "First" }) },
 * });
 */
export type PaginateOptions = {
	/** The control that goes to the next page. */
	next: LocatorRef;
	/**
	 * The control that goes to the first page. When set, navigation starts by clicking it (unless the table
	 * shows the first page), so it always covers every page. Without it, navigation starts at the current
	 * page.
	 *
	 * After the click, navigation waits for the table to change. A control that stays enabled on the first
	 * page doesn't change the table, so that wait ends after 2 seconds, or after 0.5 seconds for a table with
	 * a `loading` indicator that doesn't show. Set `isFirstPage` to skip the wait altogether.
	 */
	first?: LocatorRef;
	/**
	 * Whether the table shows the first page, for a `first` control that stays enabled there. When it says
	 * so, `first` is not clicked; after a click, navigation waits until it says so. Defaults to: `first` is
	 * missing, hidden or disabled (see `isLastPage`), and after a click, the table changed.
	 *
	 * @example
	 * isFirstPage: async () => (await page.getByRole("button", { name: "1", exact: true }).getAttribute("aria-current")) === "page"
	 */
	isFirstPage?: (first: Locator) => Promise<boolean>;
	/**
	 * Whether the table shows the last page. Defaults to: `next` is missing, hidden or disabled (with the
	 * `disabled` attribute, `aria-disabled="true"` or the `disabled` class, on `next` or an element around
	 * it, such as a Bootstrap `<li class="disabled">`). When `next` matches several elements (a pager above
	 * and below the table), the first one is used.
	 */
	isLastPage?: (next: Locator) => Promise<boolean>;
	/**
	 * The most pages to visit, a positive integer: `3` reads the first 3 pages, also when the table has
	 * more. Defaults to every page. A table that never reaches its last page is stopped by the `timeout`.
	 */
	maxPages?: number;
};

/**
 * Options for the `scroll` option of {@link TableLocator}.
 *
 * Navigation scrolls the container from the top to the bottom, one step at a time, and reads the rows in
 * view after each step. Rows are told apart by their key, so a row seen twice is read once.
 *
 * @example
 * defineTable(page.getByRole("grid"), { aria: true, scroll: { container: root => root.locator(".viewport") } });
 */
export type ScrollOptions = {
	/**
	 * The element that scrolls. Defaults to the table root. A container that can never scroll
	 * (`overflow-y: visible`) is an error that names the element around or inside it that does.
	 */
	container?: LocatorRef;
	/** How far to scroll per step, in pixels. Defaults to 90% of the container height. */
	step?: number;
	/**
	 * The attribute of a row element that identifies the row, such as `"data-id"`. Defaults to the first
	 * of `aria-rowindex`, `row-index`, `data-rowindex`, `data-index` and `data-id` that the row has, or
	 * else the text of its cells. Rows with the same text are told apart by their order within one view,
	 * so a repeated row is not lost, but the overlap between two scroll steps can't tell which of two
	 * identical rows it shows: give such rows a key.
	 *
	 * The position attributes (all of these but `data-id`) also order the rows. Other keys only identify
	 * a row, and rows are kept in the order they were shown.
	 */
	rowKey?: string;
	/**
	 * How long the table must stay the same after a scroll before it is read, in
	 * milliseconds. Defaults to 50; `0` reads the rows two animation frames after the scroll. The `loading`
	 * indicator, if set, is always waited for.
	 */
	settle?: number;
	/**
	 * The most scroll steps per page, a positive integer. Defaults to scrolling to the bottom. A grid that
	 * keeps growing is stopped by the `timeout`.
	 */
	maxSteps?: number;
};

/**
 * Options for {@link TableLocator.findRow} and {@link TableLocator.totalRowCount}.
 */
export type NavigationOptions = {
	/** The time for the whole search, in milliseconds. Defaults to 30000. */
	timeout?: number;
};

/**
 * How {@link TableLocator.toJson} converts the text of a column:
 * - `"number"`: a number, read as {@link DecimalSeparator} describes; an empty cell is `null`.
 * - `"date"`: a `Date`, parsed with `Date.parse`; an empty cell is `null`.
 * - A function: called in Node with the cell text, so it can use test variables. Its result is the value.
 *
 * A cell that `"number"` or `"date"` cannot parse, or a function that throws, fails `toJson()` with the
 * row, the column and the text.
 */
export type ColumnParser = "number" | "date" | ((text: string) => unknown);

/**
 * `T`, but not a place to infer `T` from: like `NoInfer`, which needs TypeScript 5.4.
 * @internal
 */
export type NotInferred<T> = [T][T extends unknown ? 0 : never];

/** The {@link ColumnParser}s of {@link TableJsonOptions.parse}, by header key. */
export type ColumnParsers<C extends string> = { readonly [K in C]?: ColumnParser };

/** The value a {@link ColumnParser} produces. */
export type ParsedValue<P> = P extends "number"
	? number | null
	: P extends "date"
		? Date | null
		: P extends (text: string) => infer R
			? R
			: string;

/**
 * One row of {@link TableLocator.toJson}: the text of every column in `C`, or the parsed value for the
 * columns in `P`.
 */
export type TableJsonRow<C extends string, P = {}> = { [K in C]: K extends keyof P ? ParsedValue<P[K]> : string };

/**
 * Options for {@link TableLocator.waitForStable}.
 *
 * @example
 * await users.waitForStable({ quiet: 300, loading: page.getByRole("progressbar") });
 */
export type StableOptions = {
	/**
	 * How long the header keys and body cell texts must stay the same, in milliseconds. Defaults to 500.
	 */
	quiet?: number;
	/** The time to wait in milliseconds. Defaults to 5000. */
	timeout?: number;
	/**
	 * A loading indicator, such as a spinner or an overlay. The table is only stable while it is hidden
	 * (not attached, or not visible), so a table that is about to refresh isn't read too early.
	 */
	loading?: LocatorRef;
};

/**
 * Options for {@link TableLocator.toJson}.
 *
 * @example
 * await users.toJson({ minRows: 1, timeout: 10_000 });
 *
 * @example
 * // Some columns, with typed values
 * await orders.toJson({ columns: ["Id", "Total"], parse: { Total: "number" }, decimal: "," });
 */
export type TableJsonOptions<C extends string = string, P = {}> = {
	/**
	 * Only these columns, in this order. Defaults to every column of the main header row. A key that is not
	 * a header key of the table fails `toJson()` with the available headers.
	 */
	columns?: readonly C[];
	/** Converts the text of some columns to typed values, see {@link ColumnParser}. */
	// Intersected with the parsers type, so a function parser gets its `text: string` parameter type. The
	// columns are not inferred from it, so `parse` alone keeps every column.
	parse?: P & ColumnParsers<NotInferred<C>>;
	/** The decimal separator of the `"number"` columns of `parse`. Defaults to `"."`. */
	decimal?: DecimalSeparator;
	/**
	 * Wait until the table stops changing before reading it, see {@link TableLocator.waitForStable}.
	 * `true` uses the default options. The `timeout` of the stable options defaults to (and can't exceed)
	 * the time left of `timeout`.
	 */
	stable?: boolean | StableOptions;
	/**
	 * Read every row: on every page with the `paginate` option, and from top to bottom with the `scroll`
	 * option of the table. `minRows` and `stable` apply to the first view. Defaults to `false`: the rows the
	 * table shows now.
	 *
	 * It leaves the table on its last page, scrolled down; without `paginate.first`, the next read starts
	 * there. It reads up to `paginate.maxPages` and `scroll.maxSteps`, if set. Reaching the `timeout` before that
	 * is an error that says how many rows were read, so part of the rows is never returned as all of them.
	 */
	allRows?: boolean;
	/**
	 * Wait for a header row and at least this many body rows with content (a row where at least one cell
	 * has text) before reading. Defaults to `0`: read once, without waiting.
	 */
	minRows?: number;
	/**
	 * With `minRows` or `stable`, the time for the whole read, waits included, in milliseconds (default
	 * 5000). With `allRows`, the time for the whole read, pages and scrolling included (default 30000).
	 * Without any of them, the time to wait for the table element to be attached.
	 */
	timeout?: number;
	/**
	 * Return every body cell as the browser reads it (`innerText`, or `textContent`), without any
	 * normalization: line breaks, tabs, non-breaking spaces, icon glyphs and visually hidden text stay.
	 * Header keys are normalized either way. Defaults to `false`.
	 */
	raw?: boolean;
};

/**
 * Wire format of a {@link CellMatcher} inside a `pw-table-v1` selector.
 * @internal
 */
export type SerializedMatcher =
	| { t: "s"; v: string }
	| { t: "r"; s: string; f: string }
	| { t: "c"; op: "equals" | "contains" | "startsWith" | "endsWith"; v: string; i: boolean }
	| { t: "o"; v: string[]; i?: boolean }
	| { t: "e" }
	| { t: "f"; src: string }
	| { t: "n"; m: SerializedMatcher }
	| { t: "a"; m: SerializedMatcher[] }
	| { t: "l"; m: SerializedMatcher[] }
	| { t: "g"; op: "gt" | "gte" | "lt" | "lte" | "between"; v: number; w: number; d: DecimalSeparator };

/**
 * Table configuration shared by every `pw-table-v1` query. Only what differs from the defaults is set,
 * so selectors stay short; the engine fills in the rest.
 * @internal
 */
export type EngineConfig = {
	/** Use the ARIA default selectors instead of the HTML ones. */
	aria?: 1;
	headerRow?: string;
	headerCell?: string;
	bodyRow?: string;
	bodyCell?: string;
	/** Footer row selector, or `""` for none. Defaults to `"tfoot>tr"`, or none for ARIA. */
	footerRow?: string;
	/** Index of the main header row. Defaults to the last header row. */
	mainHeaderRow?: number;
	/** Read text with `textContent` instead of `innerText`. */
	textContent?: 1;
	/** Selectors of the elements inside a cell whose text is left out. Defaults to `DEFAULT_IGNORE`. */
	ignore?: string[];
	/** Selector of placeholder rows (such as "No data") that are never body rows. */
	emptyRow?: string;
	/** Read the value of text inputs and text areas in body cells as their text. */
	inputs?: 1;
};

/**
 * Row conditions in wire format: one entry per header, every entry must match. The matchers of this
 * package can also pass a column index as `h`.
 * @internal
 */
export type SerializedWhere = { h: string | number; m: SerializedMatcher }[];

/**
 * Body of a `pw-table-v1=` selector (JSON encoded).
 * @internal
 */
export type EngineQuery =
	| { op: "rows"; cfg: EngineConfig }
	| { op: "row"; cfg: EngineConfig; where: SerializedWhere }
	| { op: "cell"; cfg: EngineConfig; header: string | number }
	// `f: 1` also finds the cells of footer rows.
	| { op: "column"; cfg: EngineConfig; header: string | number; f?: 1 }
	| { op: "footer"; cfg: EngineConfig }
	| { op: "header"; cfg: EngineConfig; header: string | number };

/**
 * Argument for evaluating the engine function directly to read the header keys of a table.
 * @internal
 */
export type EngineKeysRequest = { op: "keys"; cfg: EngineConfig };

/**
 * Argument for evaluating the engine function directly to read the text of every body cell, normalized
 * or with `raw`, as the browser reads it.
 * @internal
 */
export type EngineTextsRequest = {
	op: "texts";
	cfg: EngineConfig;
	raw?: true;
	/**
	 * Only read the cells under these header keys, in this order. `keys` still lists every header key, and
	 * a key that is not one of them reads as `""`.
	 */
	columns?: string[];
};

/**
 * Argument for evaluating the engine function directly to read a fingerprint of the table: the header
 * keys and every body cell text, so a change shows up as a different fingerprint.
 * @internal
 */
export type EngineFingerprintRequest = { op: "fingerprint"; cfg: EngineConfig };

/**
 * Argument for evaluating the engine function directly to read the body rows in view with a key per row,
 * so rows read at several scroll positions can be told apart. `rowKey` is the attribute that identifies a
 * row; without it, the first of the default key attributes is used, or the cell texts.
 * @internal
 */
export type EngineWindowRequest = {
	op: "window";
	cfg: EngineConfig;
	raw?: true;
	columns?: string[];
	rowKey?: string;
};

/**
 * Result of an {@link EngineWindowRequest}. `index` is the key as a number when it is one, to order rows.
 * @internal
 */
export type EngineWindow = { keys: string[]; rows: { key: string; index: number | null; texts: string[] }[] };

/**
 * Argument for evaluating the engine function directly to read the total number of rows a grid declares.
 * @internal
 */
export type EngineTotalRequest = { op: "total"; cfg: EngineConfig };

/**
 * Result of an {@link EngineTotalRequest}. `ariaRowCount` is the `aria-rowcount` of the grid (on the root,
 * inside it, or around it), or `null` if there is none or it is `-1`. `otherRows` is the number of rows
 * that count in `aria-rowcount` but are not body rows, such as header rows. `bodyRows` is the number of
 * body rows in the DOM.
 * @internal
 */
export type EngineTotal = { ariaRowCount: number | null; otherRows: number; bodyRows: number };

/**
 * Result of an {@link EngineFingerprintRequest}: the number of body rows, and a hash of the header keys
 * and body cell texts.
 * @internal
 */
export type EngineFingerprint = { rows: number; hash: string };

/**
 * Argument for evaluating the engine function directly to find, for each set of conditions in `rows`, the
 * body rows that match it.
 * @internal
 */
export type EngineMatrixRequest = {
	op: "matrix";
	cfg: EngineConfig;
	rows: SerializedWhere[];
	/**
	 * `1` to give each entry of `rows` a different body row in the browser, and return only that
	 * (`assigned`) instead of every body row an entry matches (`matches` stays empty).
	 */
	assign?: 1;
};

/**
 * Result of an {@link EngineMatrixRequest}. `matches[i]` lists the indexes of the body rows that match
 * `rows[i]` of the request; with `assign`, `assigned[i]` is the body row given to `rows[i]`, or -1. `count`
 * is the number of body rows; `unknown` lists the headers (or column indexes) the table doesn't have;
 * `errors` lists problems with `predicate` conditions.
 * @internal
 */
export type EngineMatrixResult = {
	keys: string[];
	count: number;
	matches: number[][];
	assigned?: number[];
	unknown: (string | number)[];
	errors: string[];
};

/**
 * Argument for evaluating the engine function directly on a body cell, to read its normalized text.
 * @internal
 */
export type EngineTextRequest = { op: "text"; cfg: EngineConfig };

/**
 * Argument for evaluating the engine function directly to match every body row against its own conditions.
 * @internal
 */
export type EngineMatchRequest = {
	op: "match";
	cfg: EngineConfig;
	rows: SerializedWhere[];
	/** `1` to also return the body cell texts when the rows don't match, to describe the mismatch. */
	texts?: 1;
};

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
	unknown: (string | number)[];
	errors: string[];
};

/**
 * Result of an {@link EngineValuesRequest}: the header keys, and the cell text of every body row in the
 * column, or `null` if the table has no such column.
 * @internal
 */
export type EngineValues = { keys: string[]; values: string[] | null };

/**
 * The object a Playwright custom selector engine must return, plus the engine's text normalization
 * (Playwright ignores the extra members), so Node normalizes exactly like the browser.
 * @internal
 */
export type SelectorEngine = {
	query(root: Node, body: string): Element | null;
	queryAll(root: Node, body: string): Element[];
	normalizeLine: (text: string) => string;
	normalizeCell: (text: string) => string;
	parseNumber: (text: string, decimal: DecimalSeparator) => number;
	defaultIgnore: string[];
};
