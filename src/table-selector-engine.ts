import type {
	EngineConfig,
	EngineFindRequest,
	EngineFindResult,
	EngineKeysRequest,
	EngineMatchRequest,
	EngineMatchResult,
	EngineQuery,
	EngineTexts,
	EngineTextsRequest,
	EngineValues,
	EngineValuesRequest,
	SelectorEngine,
	SerializedMatcher,
	SerializedWhere,
} from "./table-locator.types";

/**
 * Name under which the engine is registered with `selectors.register`.
 *
 * A second copy of this package that registers the same name reuses the engine that was registered
 * first (see `registerTableSelectors`). So whenever the wire format changes (a new query `op`, condition
 * kind or config field), give the engine a new name, such as `pw-table-v2` after `pw-table-v1`: otherwise an older engine
 * silently matches nothing for the queries it doesn't know.
 */
export const TABLE_SELECTOR_ENGINE_NAME = "pw-table-v1";

/**
 * The `pw-table-v1` custom selector engine.
 *
 * This function is serialized with `toString()` and executed in the browser, so it must stay
 * self-contained: no imports (type imports are erased), no references to module scope, and no syntax
 * that makes a bundler inject helpers (object spread, classes, class fields, ...).
 *
 * It has two modes:
 * - Called without arguments (what `selectors.register` does), it returns the selector engine.
 * - Called as `locator.evaluate(tableSelectorEngine, request)`, it reads the table exactly as the engine
 *   resolves it: `{ op: "keys" }` returns the header keys, `{ op: "texts" }` the header keys and body cell
 *   texts, `{ op: "values" }` the body cell texts of one column, and `{ op: "match" }` matches every body
 *   row against its own conditions. `{ op: "find" }` counts the body rows that match one set of conditions;
 *   it and "match" also report problems with `predicate` conditions.
 *
 * The engine never throws: invalid input or an unknown header simply yields no elements, so the
 * locator keeps waiting.
 *
 * @internal
 */
export function tableSelectorEngine(): SelectorEngine;
export function tableSelectorEngine(root: Element, request: EngineKeysRequest): string[];
export function tableSelectorEngine(root: Element, request: EngineTextsRequest): EngineTexts;
export function tableSelectorEngine(root: Element, request: EngineMatchRequest): EngineMatchResult;
export function tableSelectorEngine(root: Element, request: EngineValuesRequest): EngineValues;
export function tableSelectorEngine(root: Element, request: EngineFindRequest): EngineFindResult;
export function tableSelectorEngine(
	root?: Element,
	request?: EngineKeysRequest | EngineTextsRequest | EngineMatchRequest | EngineValuesRequest | EngineFindRequest
): SelectorEngine | string[] | EngineTexts | EngineMatchResult | EngineValues | EngineFindResult {
	type GridCell = { el: Element; rowOffset: number; colOffset: number };
	/** One row of the visual grid. Positions without a cell are holes. */
	type GridLine = (GridCell | undefined)[];
	/** The elements of one logical row: one element, or several for a row split over several containers. */
	type RowGroup = [Element, ...Element[]];
	/** A compiled cell condition. */
	type TextTest = (text: string) => boolean;
	/** A row condition with the grid column of its header. */
	type ColumnCondition = { column: number; test: TextTest };
	type TableBody = {
		/** One element per logical body row: the first element of a row split over several containers. */
		rows: Element[];
		/** The logical body row of every body row element, including the other parts of a split row. */
		rowOf: Map<Element, number>;
		grid: GridLine[];
	};
	type TableModel = {
		/** Whether the table has header rows of its own (not inside a cell). */
		hasHeader: boolean;
		keys: string[];
		headerCells: (Element | undefined)[];
		/** The body rows, read on first use: header-only reads don't need them. */
		body: () => TableBody;
		texts: Map<Element, string>;
		contentType: EngineConfig["contentType"];
	};

	const EMPTY_HEADER = "{{Empty}}";
	const COLSPAN_SUFFIX = "__C";
	const DUPLICATE_SUFFIX = "__D";
	// Unicode private use areas, where icon fonts put their glyphs.
	const ICON_GLYPHS = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;

	// Models are cached for the duration of one synchronous selector evaluation. The DOM cannot change
	// while an evaluation runs, and the cache is dropped on the next microtask, so retries always see
	// a fresh DOM.
	let modelCache: Map<Node, Map<string, TableModel | null>> | null = null;
	// Whether an element has a header row, by header row selector. Cached and dropped like the models.
	let headerRowCache: Map<Node, Map<string, boolean>> | null = null;
	// Whether a node has a shadow host inside it. Cached and dropped like the models: a cell lookup asks
	// it of every ancestor, and each answer scans the whole subtree.
	let shadowHostCache: Map<Node, boolean> | null = null;
	const predicateCache = new Map<string, ((text: string) => unknown) | null>();
	// Problems with `predicate` conditions, collected while the engine function is evaluated directly, so
	// the matchers can report them. `null` while the engine runs as a selector engine.
	let predicateErrors: string[] | null = null;

	function getModelCache(): Map<Node, Map<string, TableModel | null>> {
		if (modelCache === null) {
			modelCache = new Map();
			headerRowCache = new Map();
			shadowHostCache = new Map();
			void Promise.resolve().then(function () {
				modelCache = null;
				headerRowCache = null;
				shadowHostCache = null;
			});
		}
		return modelCache;
	}

	function normalize(value: string | null | undefined): string {
		return (value ?? "").replace(/\s+/g, " ").trim();
	}

	function readText(el: Element, contentType: EngineConfig["contentType"]): string {
		if (contentType === "innerText" && "innerText" in el) {
			return normalize((el as HTMLElement).innerText);
		}
		return normalize(el.textContent);
	}

	function textOf(model: TableModel, el: Element): string {
		const cached = model.texts.get(el);
		if (cached !== undefined) return cached;
		const text = readText(el, model.contentType);
		model.texts.set(el, text);
		return text;
	}

	/** `value`, or `null` if it is an empty string. */
	function nonEmpty(value: string | null): string | null {
		return value === "" ? null : value;
	}

	/** A `rowspan`/`colspan` attribute, or its `aria-rowspan`/`aria-colspan` counterpart. */
	function span(el: Element, name: string): number {
		const value = parseInt(nonEmpty(el.getAttribute(name)) ?? nonEmpty(el.getAttribute("aria-" + name)) ?? "1", 10);
		return isNaN(value) || value < 1 ? 1 : value;
	}

	/** The parent element of `node` in the composed tree: the host stands in for a shadow root. */
	function parentOf(node: Node): Element | null {
		const parent = node.parentNode;
		if (parent === null) return null;
		if (isShadowRoot(parent)) return parent.host;
		return isElement(parent) ? parent : null;
	}

	function isElement(node: Node): node is Element {
		return node.nodeType === 1;
	}

	function isShadowRoot(node: Node): node is ShadowRoot {
		return node.nodeType === 11 && "host" in node;
	}

	/** Whether `node` can contain elements: an element, a document or a document fragment (such as a shadow root). */
	function isParentNode(node: Node): node is Node & ParentNode {
		return node.nodeType === 1 || node.nodeType === 9 || node.nodeType === 11;
	}

	/** The shadow root of `scope`, or `null` if it is not a shadow host. */
	function shadowRootOf(scope: Node): ShadowRoot | null {
		return isElement(scope) ? scope.shadowRoot : null;
	}

	/** Whether `scope` is a shadow host or has one inside it (outside of shadow roots). */
	function hasShadowHost(scope: Node & ParentNode): boolean {
		const cached = shadowHostCache === null ? undefined : shadowHostCache.get(scope);
		if (cached !== undefined) return cached;
		let found = shadowRootOf(scope) !== null;
		if (!found) {
			for (const el of scope.querySelectorAll("*")) {
				if (el.shadowRoot !== null) {
					found = true;
					break;
				}
			}
		}
		if (shadowHostCache !== null) shadowHostCache.set(scope, found);
		return found;
	}

	/**
	 * The elements matching `selector` in `scope`, its shadow root and every open shadow root inside it,
	 * in composed tree order: the shadow content of a host comes right after the host. Like Playwright
	 * CSS, a selector matches within one tree; combinators don't cross a shadow boundary.
	 */
	function deepQueryAll(scope: Node & ParentNode, selector: string): Element[] {
		const result: Element[] = [];
		const shadow = shadowRootOf(scope);
		if (shadow !== null) collectDeep(shadow, selector, result);
		collectDeep(scope, selector, result);
		return result;
	}

	function collectDeep(scope: ParentNode, selector: string, result: Element[]): void {
		const matched = new Set<Element>(scope.querySelectorAll(selector));
		for (const el of scope.querySelectorAll("*")) {
			if (matched.has(el)) result.push(el);
			if (el.shadowRoot !== null) collectDeep(el.shadowRoot, selector, result);
		}
	}

	/** The elements matching `selector` in `scope`, also inside open shadow roots when `deep` is set. */
	function queryIn(scope: Node & ParentNode, selector: string, deep: boolean): Element[] {
		return deep ? deepQueryAll(scope, selector) : Array.from(scope.querySelectorAll(selector));
	}

	/** Whether `el` has a header row, also inside open shadow roots. */
	function hasHeaderRow(el: Element, selector: string): boolean {
		getModelCache();
		const cache = headerRowCache as Map<Node, Map<string, boolean>>;
		let bySelector = cache.get(el);
		if (bySelector === undefined) {
			bySelector = new Map();
			cache.set(el, bySelector);
		}
		let found = bySelector.get(selector);
		if (found === undefined) {
			found = el.querySelector(selector) !== null || (hasShadowHost(el) && deepQueryAll(el, selector).length > 0);
			bySelector.set(selector, found);
		}
		return found;
	}

	/**
	 * Whether `el` is part of `container` itself, rather than content of a cell inside it (such as a
	 * nested table). `cellSelector` matches the header and body cells of the table.
	 */
	function owned(el: Element, container: Node, cellSelector: string): boolean {
		let node = parentOf(el);
		while (node !== null && node !== container) {
			if (node.matches(cellSelector)) return false;
			node = parentOf(node);
		}
		return true;
	}

	/** The rows of `scope` that match `selector` and are not inside a cell. */
	function ownRows(scope: Node & ParentNode, selector: string, cellSelector: string, deep: boolean): Element[] {
		return queryIn(scope, selector, deep).filter(function (row) {
			return owned(row, scope, cellSelector);
		});
	}

	/**
	 * Groups row elements into logical rows. Rows that share an `aria-rowindex` are one row split over
	 * several containers (for example pinned columns). When every row has an `aria-rowindex`, rows are
	 * ordered by it, because virtualized grids don't always keep the DOM in visual order.
	 */
	function groupRows(rows: Element[]): RowGroup[] {
		const groups: RowGroup[] = [];
		const byIndex = new Map<string, RowGroup>();
		let indexed = true;
		for (const row of rows) {
			const key = row.getAttribute("aria-rowindex");
			const group = key === null ? undefined : byIndex.get(key);
			if (group !== undefined) {
				group.push(row);
				continue;
			}
			const created: RowGroup = [row];
			if (key === null || isNaN(parseInt(key, 10))) indexed = false;
			if (key !== null) byIndex.set(key, created);
			groups.push(created);
		}
		if (indexed) {
			groups.sort(function (a, b) {
				return (
					parseInt(a[0].getAttribute("aria-rowindex") ?? "", 10) -
					parseInt(b[0].getAttribute("aria-rowindex") ?? "", 10)
				);
			});
		}
		return groups;
	}

	/**
	 * Lays out logical rows on a visual grid that respects rowspan and colspan. A cell with an
	 * `aria-colindex` is placed in that column, so cells of virtualized and split rows line up.
	 */
	function buildGrid(rows: RowGroup[], cellSelector: string, ownCellSelector: string, deep: boolean): GridLine[] {
		const grid = rows.map(function (): GridLine {
			return [];
		});
		rows.forEach(function (group, r) {
			let c = 0;
			for (const el of ownCells(group, cellSelector, ownCellSelector, deep)) {
				const colindex = parseInt(el.getAttribute("aria-colindex") ?? "", 10);
				if (colindex >= 1) {
					c = colindex - 1;
				} else {
					while (grid[r]?.[c] !== undefined) c++;
				}
				const rowspan = Math.min(span(el, "rowspan"), rows.length - r);
				const colspan = span(el, "colspan");
				for (let dr = 0; dr < rowspan; dr++) {
					const line = grid[r + dr];
					if (line === undefined) break;
					for (let dc = 0; dc < colspan; dc++) {
						line[c + dc] = { el: el, rowOffset: dr, colOffset: dc };
					}
				}
				c += colspan;
			}
		});
		return grid;
	}

	/** The cells of a logical row that match `cellSelector` and are not inside a nested cell. */
	function ownCells(group: RowGroup, cellSelector: string, ownCellSelector: string, deep: boolean): Element[] {
		const cells: Element[] = [];
		for (const part of group) {
			for (const cell of queryIn(part, cellSelector, deep)) {
				if (owned(cell, part, ownCellSelector)) cells.push(cell);
			}
		}
		return cells;
	}

	/** Header keys of one header row, with the same rules as `PlaywrightTable.getJson()`. */
	function headerKeys(line: GridLine, cfg: EngineConfig): string[] {
		const keys: string[] = [];
		// A `for...of` loop visits holes too, as `undefined`.
		for (const cell of line) {
			if (cell === undefined) {
				keys.push(EMPTY_HEADER);
				continue;
			}
			let text = readText(cell.el, cfg.contentType);
			if (cfg.stripIconGlyphs) text = normalize(text.replace(ICON_GLYPHS, ""));
			const base = text || EMPTY_HEADER;
			// Headers carried down by rowspan keep their plain text; colspan continuations get a suffix.
			keys.push(cell.rowOffset === 0 && cell.colOffset > 0 ? base + COLSPAN_SUFFIX + cell.colOffset : base);
		}
		const seen = new Map<string, number>();
		return keys.map(function (key) {
			const count = seen.get(key);
			seen.set(key, (count ?? 0) + 1);
			return count === undefined ? key : key + DUPLICATE_SUFFIX + count;
		});
	}

	/**
	 * Builds the model of a table. A table without header rows (or with an out of range main header row)
	 * has no header keys: only column indexes resolve in it.
	 */
	function buildModel(scope: Node, cfg: EngineConfig): TableModel | null {
		if (!isParentNode(scope)) return null;
		const deep = hasShadowHost(scope);
		const anyCell = cfg.headerCell + "," + cfg.bodyCell;
		const headerRows = groupRows(ownRows(scope, cfg.headerRow, anyCell, deep));
		const mainIndex = cfg.mainHeaderRow ?? headerRows.length - 1;
		const mainLine =
			(mainIndex >= 0 && mainIndex < headerRows.length
				? buildGrid(headerRows, cfg.headerCell, anyCell, deep)[mainIndex]
				: undefined) ?? [];
		// A row without header cells that shares its aria-rowindex with a header row is part of that header
		// row (such as an empty pinned container), not a body row.
		const headerIndexes = new Set<string>();
		for (const group of headerRows) {
			const key = group[0].getAttribute("aria-rowindex");
			if (key !== null) headerIndexes.add(key);
		}
		let body: TableBody | null = null;
		return {
			hasHeader: headerRows.length > 0,
			keys: headerKeys(mainLine, cfg),
			headerCells: mainLine.map(function (cell) {
				return cell === undefined ? undefined : cell.el;
			}),
			body: function (): TableBody {
				return (body ??= buildBody(scope, cfg, headerIndexes, deep));
			},
			texts: new Map(),
			contentType: cfg.contentType,
		};
	}

	function buildBody(
		scope: Node & ParentNode,
		cfg: EngineConfig,
		headerIndexes: Set<string>,
		deep: boolean
	): TableBody {
		const anyCell = cfg.headerCell + "," + cfg.bodyCell;
		const groups = groupRows(ownRows(scope, cfg.bodyRow, anyCell, deep)).filter(function (group) {
			const key = group[0].getAttribute("aria-rowindex");
			return key === null || !headerIndexes.has(key);
		});
		const rows: Element[] = [];
		const rowOf = new Map<Element, number>();
		groups.forEach(function (group, r) {
			rows.push(group[0]);
			for (const part of group) {
				rowOf.set(part, r);
			}
		});
		return { rows: rows, rowOf: rowOf, grid: buildGrid(groups, cfg.bodyCell, anyCell, deep) };
	}

	function getModel(table: Node, cfg: EngineConfig): TableModel | null {
		const cache = getModelCache();
		let byConfig = cache.get(table);
		if (byConfig === undefined) {
			byConfig = new Map();
			cache.set(table, byConfig);
		}
		const cfgKey = JSON.stringify(cfg);
		let model = byConfig.get(cfgKey);
		if (model === undefined) {
			model = buildModel(table, cfg);
			byConfig.set(cfgKey, model);
		}
		return model;
	}

	function compilePredicate(src: string): ((text: string) => unknown) | null {
		if (predicateCache.has(src)) return predicateCache.get(src) ?? null;
		let fn: ((text: string) => unknown) | null = null;
		// `predicate` conditions are serialized functions, so compiling them is the feature. The engine is
		// registered in an isolated world, where a strict page CSP does not block this.
		try {
			// oxlint-disable-next-line typescript/no-implied-eval -- compiles a `predicate` condition, see above
			const value: unknown = new Function("return (" + src + ");")();
			if (typeof value === "function") fn = value as (text: string) => unknown;
		} catch {
			// Method shorthand (`predicate(t) { ... }`) is not a valid expression on its own.
			try {
				// oxlint-disable-next-line typescript/no-implied-eval -- compiles a `predicate` condition, see above
				const holder: unknown = new Function("return ({" + src + "});")();
				if (holder !== null && typeof holder === "object") {
					const values = Object.keys(holder).map(function (key) {
						return (holder as Record<string, unknown>)[key];
					});
					if (typeof values[0] === "function") fn = values[0] as (text: string) => unknown;
				}
			} catch {
				fn = null;
			}
		}
		predicateCache.set(src, fn);
		return fn;
	}

	/**
	 * Compiles a condition once per query, so RegExps and expected texts are not rebuilt for every cell.
	 * Throws for an invalid RegExp; the selector engine turns that into no match.
	 */
	function compileMatcher(matcher: SerializedMatcher, header: string): TextTest {
		switch (matcher.t) {
			case "s": {
				const expected = normalize(matcher.v);
				return function (text) {
					return text === expected;
				};
			}
			case "r": {
				const regexp = new RegExp(matcher.s, matcher.f);
				return function (text) {
					// A global or sticky RegExp keeps its position between calls.
					regexp.lastIndex = 0;
					return regexp.test(text);
				};
			}
			case "c":
				return compileTextMatcher(matcher);
			case "o": {
				const values = matcher.v.map(normalize);
				return function (text) {
					return values.indexOf(text) !== -1;
				};
			}
			case "e":
				return function (text) {
					return text === "";
				};
			case "f":
				return compilePredicateMatcher(matcher.src, header);
			case "n": {
				const inner = compileMatcher(matcher.m, header);
				return function (text) {
					return !inner(text);
				};
			}
			case "a": {
				const tests = compileAll(matcher.m, header);
				return function (text) {
					return tests.some(function (test) {
						return test(text);
					});
				};
			}
			case "l": {
				const tests = compileAll(matcher.m, header);
				// An empty list never matches.
				return function (text) {
					return (
						tests.length > 0 &&
						tests.every(function (test) {
							return test(text);
						})
					);
				};
			}
			default:
				return function () {
					return false;
				};
		}
	}

	function compileTextMatcher(matcher: Extract<SerializedMatcher, { t: "c" }>): TextTest {
		const expected = matcher.i ? normalize(matcher.v).toLowerCase() : normalize(matcher.v);
		const op = matcher.op;
		return function (text) {
			const actual = matcher.i ? text.toLowerCase() : text;
			if (op === "equals") return actual === expected;
			if (op === "contains") return actual.indexOf(expected) !== -1;
			if (op === "startsWith") return actual.slice(0, expected.length) === expected;
			return expected.length <= actual.length && actual.slice(actual.length - expected.length) === expected;
		};
	}

	function compileAll(matchers: SerializedMatcher[], header: string): TextTest[] {
		return matchers.map(function (matcher) {
			return compileMatcher(matcher, header);
		});
	}

	/**
	 * A `predicate` condition. A predicate that cannot be compiled, throws, or returns a promise fails the
	 * whole row, also inside `not`, `anyOf` or `allOf`: a broken predicate must not turn into a match. The
	 * problem is reported when the engine function is evaluated directly.
	 */
	function compilePredicateMatcher(src: string, header: string): TextTest {
		const predicate = compilePredicate(src);
		if (predicate === null) reportPredicate(header, "is not a function expression: " + src.slice(0, 80));
		return function (text) {
			if (predicate === null) throw PREDICATE_FAILED;
			let result: unknown;
			try {
				result = predicate(text);
			} catch (error) {
				reportPredicate(header, "threw " + describeError(error));
				throw PREDICATE_FAILED;
			}
			if (result !== null && typeof result === "object" && typeof (result as { then?: unknown }).then === "function") {
				reportPredicate(header, "returned a promise; predicates must be synchronous");
				throw PREDICATE_FAILED;
			}
			return Boolean(result);
		};
	}

	/** Thrown by a predicate that cannot run, and caught per row by `rowMatches`. */
	const PREDICATE_FAILED = new Error("predicate failed");

	/** Maximum number of predicate problems reported, so a predicate that throws for every row stays readable. */
	const MAX_PREDICATE_ERRORS = 5;

	function reportPredicate(header: string, problem: string): void {
		if (predicateErrors === null || predicateErrors.length >= MAX_PREDICATE_ERRORS) return;
		const message = "Predicate for " + JSON.stringify(header) + " " + problem;
		if (predicateErrors.indexOf(message) === -1) predicateErrors.push(message);
	}

	function describeError(error: unknown): string {
		if (error instanceof Error) return error.name + ": " + error.message;
		return typeof error === "string" ? error : String(JSON.stringify(error));
	}

	function unique(elements: Element[]): Element[] {
		const result: Element[] = [];
		const seen = new Set<Element>();
		for (const el of elements) {
			if (!seen.has(el)) {
				seen.add(el);
				result.push(el);
			}
		}
		return result;
	}

	/** The grid column of a header key or column index, or -1 if there is none. */
	function columnOf(model: TableModel, column: string | number): number {
		if (typeof column === "number") return column >= 0 && column % 1 === 0 ? column : -1;
		return model.keys.indexOf(column);
	}

	/** The text of body row `r` in grid column `c`. Positions without a cell read as an empty string. */
	function cellText(model: TableModel, r: number, c: number): string {
		const cell = model.body().grid[r]?.[c];
		return cell === undefined ? "" : textOf(model, cell.el);
	}

	/** The conditions of `where` with the grid columns of their headers, or `null` if a header is unknown. */
	function whereColumns(model: TableModel, where: SerializedWhere): ColumnCondition[] | null {
		const conditions: ColumnCondition[] = [];
		for (const condition of where) {
			const column = model.keys.indexOf(condition.h);
			if (column === -1) return null;
			conditions.push({ column: column, test: compileMatcher(condition.m, condition.h) });
		}
		return conditions;
	}

	/** Whether row `r` matches every condition. A predicate that cannot run fails the row. */
	function rowMatches(model: TableModel, r: number, conditions: ColumnCondition[]): boolean {
		try {
			return conditions.every(function (condition) {
				return condition.test(cellText(model, r, condition.column));
			});
		} catch (error) {
			if (error === PREDICATE_FAILED) return false;
			throw error;
		}
	}

	function queryRows(root: Node, query: Extract<EngineQuery, { op: "row" }>): Element[] {
		const model = getModel(root, query.cfg);
		if (model === null || query.where.length === 0) return [];
		const conditions = whereColumns(model, query.where);
		if (conditions === null) return [];
		return model.body().rows.filter(function (_row, r) {
			return rowMatches(model, r, conditions);
		});
	}

	function queryCell(root: Node, query: Extract<EngineQuery, { op: "cell" }>): Element[] {
		if (!isElement(root)) return [];
		const row = root;
		// The owning table is the first ancestor with its own header row that contains this row as a body
		// row and has the column. A container of a split row (such as pinned columns) can look like a table
		// with only some of the columns, so the search goes on when the column is missing. Column indexes
		// don't need a header row, so without one they fall back to the first ancestor that has the row.
		// The search goes up through shadow hosts, so a row inside a shadow root finds its table.
		// Only a row with an `aria-rowindex` can be split, so any other row stops at the first table that
		// has it: further up, the header rows of other tables would mix in.
		const byIndex = typeof query.header === "number";
		const splittable = row.hasAttribute("aria-rowindex");
		let fallback: Element[] | null = null;
		let ancestor = parentOf(row);
		while (ancestor !== null) {
			if ((byIndex && fallback === null) || hasHeaderRow(ancestor, query.cfg.headerRow)) {
				const model = getModel(ancestor, query.cfg);
				if (model !== null && model.body().rowOf.has(row)) {
					const cell = cellAt(model, row, query.header);
					if (model.hasHeader && (cell.length > 0 || !splittable)) return cell;
					if (!model.hasHeader && fallback === null) fallback = cell;
				}
			}
			ancestor = parentOf(ancestor);
		}
		return fallback ?? [];
	}

	function cellAt(model: TableModel, row: Element, header: string | number): Element[] {
		const body = model.body();
		const rowIndex = body.rowOf.get(row);
		const column = columnOf(model, header);
		const cell = rowIndex === undefined || column === -1 ? undefined : body.grid[rowIndex]?.[column];
		return cell === undefined ? [] : [cell.el];
	}

	function queryAllRows(root: Node, query: Extract<EngineQuery, { op: "rows" }>): Element[] {
		const model = getModel(root, query.cfg);
		return model === null ? [] : model.body().rows;
	}

	function queryColumn(root: Node, query: Extract<EngineQuery, { op: "column" }>): Element[] {
		const model = getModel(root, query.cfg);
		if (model === null) return [];
		const column = columnOf(model, query.header);
		if (column === -1) return [];
		const cells: Element[] = [];
		for (const line of model.body().grid) {
			const cell = line[column];
			if (cell !== undefined) cells.push(cell.el);
		}
		return unique(cells);
	}

	function queryHeader(root: Node, query: Extract<EngineQuery, { op: "header" }>): Element[] {
		const model = getModel(root, query.cfg);
		if (model === null) return [];
		const column = columnOf(model, query.header);
		const cell = column === -1 ? undefined : model.headerCells[column];
		return cell === undefined ? [] : [cell];
	}

	/** Header keys and the text of every body cell under them. */
	function readTexts(model: TableModel): EngineTexts {
		const rows: string[][] = [];
		for (let r = 0; r < model.body().rows.length; r++) {
			const texts: string[] = [];
			for (let c = 0; c < model.keys.length; c++) {
				texts.push(cellText(model, r, c));
			}
			rows.push(texts);
		}
		return { keys: model.keys, rows: rows };
	}

	/**
	 * The text of every body cell in `column`, or `null` if there is no such column. A column index works
	 * without header rows, up to the widest body row.
	 */
	function readValues(model: TableModel, column: string | number): EngineValues {
		const body = model.body();
		let width = model.keys.length;
		for (const line of body.grid) {
			if (line.length > width) width = line.length;
		}
		const c = columnOf(model, column);
		if (c === -1 || c >= width) return { keys: model.keys, values: null };
		const values: string[] = [];
		for (let r = 0; r < body.rows.length; r++) {
			values.push(cellText(model, r, c));
		}
		return { keys: model.keys, values: values };
	}

	function matchRows(model: TableModel, expected: SerializedWhere[]): EngineMatchResult {
		const unknown: string[] = [];
		for (const where of expected) {
			for (const condition of where) {
				const header = condition.h;
				if (model.keys.indexOf(header) === -1 && unknown.indexOf(header) === -1) unknown.push(header);
			}
		}
		const count = model.body().rows.length;
		// Only rows that exist both in the table and in `expected` are matched.
		const matched = expected.slice(0, count).map(function (where, r) {
			const conditions = whereColumns(model, where);
			return conditions !== null && rowMatches(model, r, conditions);
		});
		const pass =
			unknown.length === 0 &&
			count === expected.length &&
			matched.every(function (ok) {
				return ok;
			});
		// The texts are only needed to describe a mismatch, so a match doesn't send the whole table.
		const rows = pass ? [] : readTexts(model).rows;
		return {
			keys: model.keys,
			rows: rows,
			count: count,
			matched: matched,
			unknown: unknown,
			errors: predicateErrors ?? [],
		};
	}

	/** Runs the conditions of `where` against every body row, to count the matches and collect predicate problems. */
	function findRows(model: TableModel, where: SerializedWhere): EngineFindResult {
		const conditions = whereColumns(model, where);
		let matches = 0;
		if (conditions !== null) {
			for (let r = 0; r < model.body().rows.length; r++) {
				if (rowMatches(model, r, conditions)) matches++;
			}
		}
		return { matches: matches, errors: predicateErrors ?? [] };
	}

	function queryAll(root: Node, body: string): Element[] {
		try {
			const query = JSON.parse(body) as EngineQuery;
			switch (query.op) {
				case "rows":
					return queryAllRows(root, query);
				case "row":
					return queryRows(root, query);
				case "cell":
					return queryCell(root, query);
				case "column":
					return queryColumn(root, query);
				case "header":
					return queryHeader(root, query);
				default:
					return [];
			}
		} catch {
			return [];
		}
	}

	if (root !== undefined && request !== undefined) {
		const model = buildModel(root, request.cfg);
		if (request.op === "keys") return model === null ? [] : model.keys;
		if (request.op === "texts") return model === null ? { keys: [], rows: [] } : readTexts(model);
		if (request.op === "values") return model === null ? { keys: [], values: null } : readValues(model, request.column);
		predicateErrors = [];
		if (request.op === "find") return model === null ? { matches: 0, errors: [] } : findRows(model, request.where);
		return model === null
			? { keys: [], rows: [], count: 0, matched: [], unknown: [], errors: [] }
			: matchRows(model, request.rows);
	}

	return {
		query: function (root: Node, body: string): Element | null {
			return queryAll(root, body)[0] ?? null;
		},
		queryAll: queryAll,
	};
}

/**
 * The engine function typed for its "keys" mode, for use with `locator.evaluate`.
 * Same function object as {@link tableSelectorEngine}.
 *
 * @internal
 */
export const readTableHeaderKeys: (root: Element, request: EngineKeysRequest) => string[] = tableSelectorEngine;

/**
 * The engine function typed for its "texts" mode, for use with `locator.evaluate`.
 * Same function object as {@link tableSelectorEngine}.
 *
 * @internal
 */
export const readTableTexts: (root: Element, request: EngineTextsRequest) => EngineTexts = tableSelectorEngine;

/**
 * The engine function typed for its "match" mode, for use with `locator.evaluate`.
 * Same function object as {@link tableSelectorEngine}.
 *
 * @internal
 */
export const matchTableRows: (root: Element, request: EngineMatchRequest) => EngineMatchResult = tableSelectorEngine;

/**
 * The engine function typed for its "values" mode, for use with `locator.evaluate`.
 * Same function object as {@link tableSelectorEngine}.
 *
 * @internal
 */
export const readColumnValues: (root: Element, request: EngineValuesRequest) => EngineValues = tableSelectorEngine;

/**
 * The engine function typed for its "find" mode, for use with `locator.evaluate`.
 * Same function object as {@link tableSelectorEngine}.
 *
 * @internal
 */
export const findTableRows: (root: Element, request: EngineFindRequest) => EngineFindResult = tableSelectorEngine;
