import type {
	EngineConfig,
	EngineKeysRequest,
	EngineQuery,
	SelectorEngine,
	SerializedMatcher,
} from "./table-locator.types";

/** Name under which the engine is registered with `selectors.register`. */
export const TABLE_SELECTOR_ENGINE_NAME = "pw-table";

/**
 * The `pw-table` custom selector engine.
 *
 * This function is serialized with `toString()` and executed in the browser, so it must stay
 * self-contained: no imports (type imports are erased), no references to module scope, and no syntax
 * that makes a bundler inject helpers (object spread, classes, class fields, ...).
 *
 * It has two modes:
 * - Called without arguments (what `selectors.register` does), it returns the selector engine.
 * - Called as `locator.evaluate(tableSelectorEngine, { op: "keys", cfg })`, it returns the header keys
 *   of the table, computed exactly as the engine resolves them.
 *
 * The engine never throws: invalid input or an unknown header simply yields no elements, so the
 * locator keeps waiting.
 *
 * @internal
 */
export function tableSelectorEngine(): SelectorEngine;
export function tableSelectorEngine(root: Element, request: EngineKeysRequest): string[];
export function tableSelectorEngine(root?: Element, request?: EngineKeysRequest): SelectorEngine | string[] {
	type GridCell = { el: Element; rowOffset: number; colOffset: number };
	type TableModel = {
		keys: string[];
		headerCells: Element[];
		bodyRows: Element[];
		bodyGrid: GridCell[][];
		texts: Map<Element, string>;
		contentType: EngineConfig["contentType"];
	};

	const EMPTY_HEADER = "{{Empty}}";
	const COLSPAN_SUFFIX = "__C";
	const DUPLICATE_SUFFIX = "__D";

	// Models are cached for the duration of one synchronous selector evaluation. The DOM cannot change
	// while an evaluation runs, and the cache is dropped on the next microtask, so retries always see
	// a fresh DOM.
	let modelCache: Map<Node, Map<string, TableModel | null>> | null = null;
	const predicateCache = new Map<string, ((text: string) => unknown) | null>();

	function getModelCache(): Map<Node, Map<string, TableModel | null>> {
		if (modelCache === null) {
			modelCache = new Map();
			void Promise.resolve().then(function () {
				modelCache = null;
			});
		}
		return modelCache;
	}

	function normalize(value: string | null | undefined): string {
		return (value || "").replace(/\s+/g, " ").trim();
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

	function span(el: Element, name: string): number {
		const value = parseInt(el.getAttribute(name) || "1", 10);
		return isNaN(value) || value < 1 ? 1 : value;
	}

	/** Lays out rows on a visual grid that respects rowspan and colspan. */
	function buildGrid(rows: Element[], cellSelector: string): GridCell[][] {
		const grid: GridCell[][] = [];
		for (let r = 0; r < rows.length; r++) {
			grid.push([]);
		}
		for (let r = 0; r < rows.length; r++) {
			const line = grid[r];
			const cells = rows[r].querySelectorAll(cellSelector);
			let c = 0;
			for (let i = 0; i < cells.length; i++) {
				const el = cells[i];
				while (line[c] !== undefined) c++;
				const rowspan = Math.min(span(el, "rowspan"), rows.length - r);
				const colspan = span(el, "colspan");
				for (let dr = 0; dr < rowspan; dr++) {
					for (let dc = 0; dc < colspan; dc++) {
						grid[r + dr][c + dc] = { el: el, rowOffset: dr, colOffset: dc };
					}
				}
				c += colspan;
			}
		}
		return grid;
	}

	/** Header keys of one header row, with the same rules as `PlaywrightTable.getJson()`. */
	function headerKeys(line: GridCell[], contentType: EngineConfig["contentType"]): string[] {
		const keys: string[] = [];
		for (let c = 0; c < line.length; c++) {
			const cell = line[c];
			if (cell === undefined) {
				keys.push(EMPTY_HEADER);
				continue;
			}
			const base = readText(cell.el, contentType) || EMPTY_HEADER;
			// Headers carried down by rowspan keep their plain text; colspan continuations get a suffix.
			keys.push(cell.rowOffset === 0 && cell.colOffset > 0 ? base + COLSPAN_SUFFIX + cell.colOffset : base);
		}
		const seen = new Map<string, number>();
		for (let c = 0; c < keys.length; c++) {
			const count = seen.get(keys[c]);
			if (count === undefined) {
				seen.set(keys[c], 1);
			} else {
				seen.set(keys[c], count + 1);
				keys[c] = keys[c] + DUPLICATE_SUFFIX + count;
			}
		}
		return keys;
	}

	function buildModel(table: Node, cfg: EngineConfig): TableModel | null {
		const scope = table as ParentNode;
		if (typeof scope.querySelectorAll !== "function") return null;
		const headerRows = Array.prototype.slice.call(scope.querySelectorAll(cfg.headerRow)) as Element[];
		if (headerRows.length === 0) return null;
		const mainIndex = cfg.mainHeaderRow === null ? headerRows.length - 1 : cfg.mainHeaderRow;
		if (mainIndex < 0 || mainIndex >= headerRows.length) return null;
		const mainLine = buildGrid(headerRows, cfg.headerCell)[mainIndex];
		const bodyRows = Array.prototype.slice.call(scope.querySelectorAll(cfg.bodyRow)) as Element[];
		const headerCells: Element[] = [];
		for (let c = 0; c < mainLine.length; c++) {
			const cell = mainLine[c];
			if (cell !== undefined) headerCells[c] = cell.el;
		}
		return {
			keys: headerKeys(mainLine, cfg.contentType),
			headerCells: headerCells,
			bodyRows: bodyRows,
			bodyGrid: buildGrid(bodyRows, cfg.bodyCell),
			texts: new Map(),
			contentType: cfg.contentType,
		};
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
		if (predicateCache.has(src)) return predicateCache.get(src) || null;
		let fn: ((text: string) => unknown) | null = null;
		try {
			const value: unknown = new Function("return (" + src + ");")();
			if (typeof value === "function") fn = value as (text: string) => unknown;
		} catch {
			// Method shorthand (`predicate(t) { ... }`) is not a valid expression on its own.
			try {
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

	function matches(text: string, matcher: SerializedMatcher): boolean {
		switch (matcher.t) {
			case "s":
				return text === normalize(matcher.v);
			case "r":
				return new RegExp(matcher.s, matcher.f).test(text);
			case "c": {
				const actual = matcher.i ? text.toLowerCase() : text;
				const expected = matcher.i ? normalize(matcher.v).toLowerCase() : normalize(matcher.v);
				if (matcher.op === "equals") return actual === expected;
				if (matcher.op === "contains") return actual.indexOf(expected) !== -1;
				if (matcher.op === "startsWith") return actual.slice(0, expected.length) === expected;
				return expected.length <= actual.length && actual.slice(actual.length - expected.length) === expected;
			}
			case "o":
				for (let i = 0; i < matcher.v.length; i++) {
					if (normalize(matcher.v[i]) === text) return true;
				}
				return false;
			case "e":
				return text === "";
			case "f": {
				const predicate = compilePredicate(matcher.src);
				if (predicate === null) return false;
				try {
					const result = predicate(text);
					if (
						result !== null &&
						typeof result === "object" &&
						typeof (result as { then?: unknown }).then === "function"
					) {
						return false;
					}
					return Boolean(result);
				} catch {
					return false;
				}
			}
			default:
				return false;
		}
	}

	function unique(elements: Element[]): Element[] {
		const result: Element[] = [];
		const seen = new Set<Element>();
		for (let i = 0; i < elements.length; i++) {
			if (!seen.has(elements[i])) {
				seen.add(elements[i]);
				result.push(elements[i]);
			}
		}
		return result;
	}

	function queryRows(root: Node, query: Extract<EngineQuery, { op: "row" }>): Element[] {
		const model = getModel(root, query.cfg);
		if (model === null || query.where.length === 0) return [];
		const columns: number[] = [];
		for (let i = 0; i < query.where.length; i++) {
			const index = model.keys.indexOf(query.where[i].h);
			if (index === -1) return [];
			columns.push(index);
		}
		const result: Element[] = [];
		for (let r = 0; r < model.bodyRows.length; r++) {
			let rowMatches = true;
			for (let i = 0; i < columns.length && rowMatches; i++) {
				const cell = model.bodyGrid[r][columns[i]];
				const text = cell === undefined ? "" : textOf(model, cell.el);
				rowMatches = matches(text, query.where[i].m);
			}
			if (rowMatches) result.push(model.bodyRows[r]);
		}
		return result;
	}

	function queryCell(root: Node, query: Extract<EngineQuery, { op: "cell" }>): Element[] {
		const row = root as Element;
		if (typeof row.closest !== "function") return [];
		// The owning table is the first ancestor that has a header row and contains this row as a body row.
		let ancestor = row.parentElement;
		while (ancestor !== null) {
			if (ancestor.querySelector(query.cfg.headerRow) !== null) {
				const model = getModel(ancestor, query.cfg);
				const rowIndex = model === null ? -1 : model.bodyRows.indexOf(row);
				if (model !== null && rowIndex !== -1) {
					const column = model.keys.indexOf(query.header);
					if (column === -1) return [];
					const cell = model.bodyGrid[rowIndex][column];
					return cell === undefined ? [] : [cell.el];
				}
			}
			ancestor = ancestor.parentElement;
		}
		return [];
	}

	function queryColumn(root: Node, query: Extract<EngineQuery, { op: "column" }>): Element[] {
		const model = getModel(root, query.cfg);
		if (model === null) return [];
		const column = model.keys.indexOf(query.header);
		if (column === -1) return [];
		const cells: Element[] = [];
		for (let r = 0; r < model.bodyGrid.length; r++) {
			const cell = model.bodyGrid[r][column];
			if (cell !== undefined) cells.push(cell.el);
		}
		return unique(cells);
	}

	function queryHeader(root: Node, query: Extract<EngineQuery, { op: "header" }>): Element[] {
		const model = getModel(root, query.cfg);
		if (model === null) return [];
		const column = model.keys.indexOf(query.header);
		const cell = column === -1 ? undefined : model.headerCells[column];
		return cell === undefined ? [] : [cell];
	}

	function queryAll(root: Node, body: string): Element[] {
		try {
			const query = JSON.parse(body) as EngineQuery;
			switch (query.op) {
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
		return model === null ? [] : model.keys;
	}

	return {
		query: function (root: Node, body: string): Element | null {
			const all = queryAll(root, body);
			return all.length > 0 ? all[0] : null;
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
