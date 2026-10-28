import type {
	DecimalSeparator,
	EngineConfig,
	EngineFindRequest,
	EngineFindResult,
	EngineFingerprint,
	EngineFingerprintRequest,
	EngineKeysRequest,
	EngineMatchRequest,
	EngineMatchResult,
	EngineMatrixRequest,
	EngineMatrixResult,
	EngineTotal,
	EngineTotalRequest,
	EngineQuery,
	EngineTextRequest,
	EngineTexts,
	EngineTextsRequest,
	EngineValues,
	EngineValuesRequest,
	EngineWindow,
	EngineWindowRequest,
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
 *   row against its own conditions. `{ op: "find" }` counts the body rows that match one set of conditions,
 *   and `{ op: "matrix" }` lists the body rows that match each of several sets; these three also report
 *   problems with `predicate` conditions. `{ op: "text" }` reads one body cell, and `{ op: "fingerprint" }`
 *   hashes the header keys and body cell texts, to tell whether the table changed.
 *
 * Header text is read on one line (`normalizeLine`); body cell text keeps its line breaks (`normalizeCell`).
 * Both leave out what the user doesn't see: icon glyphs, invisible characters and the text of the elements
 * matching the `ignore` option (screen reader only text and ligature icons by default).
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
export function tableSelectorEngine(root: Element, request: EngineTextRequest): string;
export function tableSelectorEngine(root: Element, request: EngineFingerprintRequest): EngineFingerprint;
export function tableSelectorEngine(root: Element, request: EngineMatrixRequest): EngineMatrixResult;
export function tableSelectorEngine(root: Element, request: EngineWindowRequest): EngineWindow;
export function tableSelectorEngine(root: Element, request: EngineTotalRequest): EngineTotal;
export function tableSelectorEngine(
	root?: Element,
	request?:
		| EngineKeysRequest
		| EngineTextsRequest
		| EngineMatchRequest
		| EngineValuesRequest
		| EngineFindRequest
		| EngineTextRequest
		| EngineFingerprintRequest
		| EngineMatrixRequest
		| EngineWindowRequest
		| EngineTotalRequest
):
	| SelectorEngine
	| string[]
	| string
	| EngineTexts
	| EngineMatchResult
	| EngineValues
	| EngineFindResult
	| EngineFingerprint
	| EngineMatrixResult
	| EngineWindow
	| EngineTotal {
	type GridCell = { el: Element; rowOffset: number; colOffset: number };
	/** One row of the visual grid. Positions without a cell are holes. */
	type GridLine = (GridCell | undefined)[];
	/** The elements of one logical row: one element, or several for a row split over several containers. */
	type RowGroup = [Element, ...Element[]];
	/** A compiled cell condition. `raw` returns the unnormalized cell text, read on first use. */
	type TextTest = (text: string, raw: () => string) => boolean;
	/** A row condition with the grid column of its header. */
	type ColumnCondition = { column: number; test: TextTest };
	/** How `readDomText` reads text without layout. */
	type DomTextOptions = { ignore: string; transform: boolean; inputs: boolean };
	/** An {@link EngineConfig} with the defaults filled in. */
	type Config = {
		headerRow: string;
		headerCell: string;
		bodyRow: string;
		bodyCell: string;
		/** Footer row selector, or `""` for none. */
		footerRow: string;
		mainHeaderRow: number | null;
		textContent: boolean;
		/** Selector of the elements inside a cell whose text is left out, or `""` for none. */
		ignore: string;
		/** Selector of placeholder rows that are never body rows, or `""` for none. */
		emptyRow: string;
		/** Whether the value of text inputs and text areas in body cells is read as their text. */
		inputs: boolean;
	};
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
		/** The footer rows, read on first use. */
		footer: () => TableBody;
		/** Normalized body cell texts, by cell. */
		texts: Map<Element, string>;
		/** Raw body cell texts, by cell. */
		raws: Map<Element, string>;
		cfg: Config;
	};

	const EMPTY_HEADER = "{{Empty}}";
	const COLSPAN_SUFFIX = "__C";
	const DUPLICATE_SUFFIX = "__D";
	// Unicode private use areas, where icon fonts put their glyphs.
	const ICON_GLYPHS = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;
	// Characters that take no space on screen: soft hyphen, zero width space, word joiner, byte order mark,
	// and bidi marks, embeddings and isolates. Zero width (non-)joiners stay: emoji sequences and some
	// scripts need them.
	const INVISIBLE = /[\u00AD\u061C\u180E\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
	// Whitespace that CSS `white-space: normal` collapses. Unlike `\s`, it leaves non-breaking spaces alone.
	const CSS_WHITESPACE = /[ \t\n\r\f]+/g;
	// Elements that start on a new line, for reading text without layout.
	const BLOCK_TAGS =
		/^(address|article|aside|blockquote|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)$/;
	const SKIPPED_TAGS = /^(script|style|template|noscript)$/;
	// The controls whose value is text, read with the `inputs` config: text areas and text-like inputs, not
	// checkboxes, buttons, files or passwords.
	const TEXT_INPUTS =
		"textarea, input:not([type]), input[type=text], input[type=email], input[type=number], input[type=search], " +
		"input[type=tel], input[type=url], input[type=date], input[type=time], input[type=datetime-local], " +
		"input[type=month], input[type=week]";
	// Elements inside a cell whose text the user doesn't read: screen reader only text (Bootstrap, Tailwind),
	// ligature icons (Material Icons and Material Symbols draw a word such as `arrow_upward` as an icon), and
	// content hidden from assistive technology, which is how decorative icons are marked.
	const DEFAULT_IGNORE = [
		".sr-only",
		".visually-hidden",
		".material-icons",
		".material-icons-outlined",
		".material-icons-round",
		".material-icons-sharp",
		".material-icons-two-tone",
		".material-symbols-outlined",
		".material-symbols-rounded",
		".material-symbols-sharp",
		"[aria-hidden=true]",
	];

	/**
	 * Header rows of a table without a `<thead>`: the leading rows of its first `<tbody>` that have `<th>`
	 * cells and no `<td>`. A row with both (a row header and data) stays a body row.
	 */
	const TBODY_HEADER_ROW =
		"table:not(:has(> thead)) > tbody:first-of-type > tr:has(> th):not(:has(> td)):not(tr:has(> td) ~ tr)";
	/**
	 * The same for rows right inside a `<table>`, without a `<tbody>`. The HTML parser always adds one, but a
	 * table built with DOM methods (`table.appendChild(tr)`) has none.
	 */
	const TABLE_HEADER_ROW = "table:not(:has(> thead)) > tr:has(> th):not(:has(> td)):not(tr:has(> td) ~ tr)";
	// Default selectors for HTML tables. Row header cells (`<th>` in a body row) are body cells too.
	const HTML_SELECTORS = {
		headerRow: "thead>tr, " + TBODY_HEADER_ROW + ", " + TABLE_HEADER_ROW,
		headerCell: "th, td",
		bodyRow: "tbody>tr:not(" + TBODY_HEADER_ROW + "), table>tr:not(" + TABLE_HEADER_ROW + ")",
		bodyCell: "td, th",
		footerRow: "tfoot>tr",
	};
	// Default selectors for ARIA grids (`role="grid"`, `"treegrid"` or `"table"` built from other elements).
	const ARIA_SELECTORS = {
		headerRow: "[role=row]:has([role=columnheader])",
		headerCell: "[role=columnheader]",
		bodyRow: "[role=row]:not(:has([role=columnheader]))",
		bodyCell: "[role=gridcell], [role=cell], [role=rowheader]",
		footerRow: "",
	};

	// Models are cached for the duration of one synchronous selector evaluation. The DOM cannot change
	// while an evaluation runs, and the cache is dropped on the next microtask, so retries always see
	// a fresh DOM.
	let modelCache: Map<Node, Map<string, TableModel | null>> | null = null;
	// Whether an element has a header row, by header row selector. Cached and dropped like the models.
	let headerRowCache: Map<Node, Map<string, boolean>> | null = null;
	// Whether a node has a shadow host inside it. Cached and dropped like the models: a cell lookup asks
	// it of every ancestor, and each answer scans the whole subtree.
	let shadowHostCache: Map<Node, boolean> | null = null;
	const predicateCache = new Map<string, ((text: string, raw: string) => unknown) | null>();
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

	function resolveConfig(cfg: EngineConfig): Config {
		const defaults = cfg.aria === 1 ? ARIA_SELECTORS : HTML_SELECTORS;
		return {
			headerRow: cfg.headerRow ?? defaults.headerRow,
			headerCell: cfg.headerCell ?? defaults.headerCell,
			bodyRow: cfg.bodyRow ?? defaults.bodyRow,
			bodyCell: cfg.bodyCell ?? defaults.bodyCell,
			footerRow: cfg.footerRow ?? defaults.footerRow,
			mainHeaderRow: cfg.mainHeaderRow ?? null,
			textContent: cfg.textContent === 1,
			ignore: (cfg.ignore ?? DEFAULT_IGNORE).join(", "),
			emptyRow: cfg.emptyRow ?? "",
			inputs: cfg.inputs === 1,
		};
	}

	/** Removes what takes no space on screen (icon glyphs and invisible characters), and composes accents (NFC). */
	function clean(value: string | null | undefined): string {
		return (value ?? "").replace(ICON_GLYPHS, "").replace(INVISIBLE, "").normalize("NFC");
	}

	/** Text on one line: every run of whitespace, line breaks included, becomes one space. For header text. */
	function normalizeLine(value: string | null | undefined): string {
		return clean(value).replace(/\s+/g, " ").trim();
	}

	/**
	 * Text that keeps its line breaks: one `\n` between lines, each line collapsed and trimmed, and no
	 * empty lines. For body cell text.
	 */
	function normalizeCell(value: string | null | undefined): string {
		const lines: string[] = [];
		for (const line of clean(value).split(/\r\n|[\r\n\u2028\u2029]/)) {
			const text = line.replace(/\s+/g, " ").trim();
			if (text !== "") lines.push(text);
		}
		return lines.join("\n");
	}

	// A minus sign in front of a number, possibly with a currency symbol in between, that is not part of a
	// word such as "Item-5".
	const MINUS_BEFORE = /(?:^|[^\p{L}\p{N}])[-−]\s*\p{Sc}?\s*$/u;

	/**
	 * The one number in `value`, or `NaN` if it has no number or more than one. Digits may be grouped by
	 * thousands with the other separator, `'` or a (non-breaking) space, so with `"."` both `"€ 1,200.50"`
	 * and `"1 200.5"` are numbers, and `"12:30"` or `"5 of 10"` are not.
	 */
	function parseNumber(value: string, decimal: DecimalSeparator): number {
		const text = clean(value);
		const pattern = numberPattern(decimal);
		// A global RegExp keeps its position between calls.
		pattern.lastIndex = 0;
		const first = pattern.exec(text);
		if (first === null || pattern.exec(text) !== null) return NaN;
		const integer = (first[1] ?? "0").replace(/\D/g, "");
		const fraction = first[2] ?? first[3] ?? "0";
		const number = Number(integer + "." + fraction);
		return MINUS_BEFORE.test(text.slice(0, first.index)) ? -number : number;
	}

	// The patterns of `parseNumber` by decimal separator, built once: numeric conditions parse every cell.
	const numberPatterns = new Map<string, RegExp>();

	/** The pattern of the numbers in a text with this decimal separator, global so a second number is found. */
	function numberPattern(decimal: DecimalSeparator): RegExp {
		let pattern = numberPatterns.get(decimal);
		if (pattern === undefined) {
			const group = decimal === "," ? "[.'\\u00a0\\u202f ]" : "[,'\\u00a0\\u202f ]";
			const separator = decimal === "," ? "," : "\\.";
			pattern = new RegExp(
				"(\\d{1,3}(?:" + group + "\\d{3})+|\\d+)(?:" + separator + "(\\d+))?|" + separator + "(\\d+)",
				"g"
			);
			numberPatterns.set(decimal, pattern);
		}
		return pattern;
	}

	/** The text of `el` as the browser reads it (`innerText` or `textContent`), without any changes. */
	function rawText(el: Element, textContent: boolean): string {
		if (!textContent && "innerText" in el) return (el as HTMLElement).innerText;
		return el.textContent;
	}

	/**
	 * The text of `el` as it is shown, before normalization: `innerText` without the text of the elements
	 * matching `cfg.ignore`, and with the selected option of a `<select>`. With `textContent`, all text in
	 * the DOM except the ignored elements, with line breaks for `<br>` and block elements. With `inputs`,
	 * text inputs and text areas read as their value.
	 */
	function readText(el: Element, cfg: Config, inputs: boolean): string {
		// An element that is not rendered has no layout, and its innerText is its textContent. Its CSS
		// `text-transform` is applied anyway, so a header reads the same whether it is shown or not.
		if (cfg.textContent || !("innerText" in el) || el.getClientRects().length === 0) {
			const parts: string[] = [];
			readDomText(el, false, parts, {
				ignore: cfg.ignore,
				transform: !cfg.textContent && "innerText" in el,
				inputs: inputs,
			});
			return parts.join("");
		}
		const special = specialElements(el, cfg.ignore, inputs);
		if (special.length === 0) return (el as HTMLElement).innerText;
		const parts: string[] = [];
		readShownText(el, special, parts);
		return parts.join("");
	}

	/** Whether `el` matches the `ignore` selector. */
	function isIgnored(el: Element, ignore: string): boolean {
		return ignore !== "" && el.matches(ignore);
	}

	/**
	 * Reads the text of the children of `node` without layout into `parts`: leaving out the elements that
	 * match `options.ignore`; with `options.transform`, applying the computed `text-transform` of each text,
	 * as `innerText` does; and with `options.inputs`, reading text inputs and text areas as their value.
	 */
	function readDomText(node: Node, pre: boolean, parts: string[], options: DomTextOptions): void {
		const textTransform = options.transform && isElement(node) ? getComputedStyle(node).textTransform : "none";
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === 3) {
				const value = child.nodeValue ?? "";
				parts.push(transformText(pre ? value : value.replace(CSS_WHITESPACE, " "), textTransform));
			} else if (isElement(child)) {
				readDomElement(child, pre, parts, options);
			}
		}
	}

	/** Reads the text of `el`, a child in {@link readDomText}, into `parts`. */
	function readDomElement(el: Element, pre: boolean, parts: string[], options: DomTextOptions): void {
		const name = el.localName;
		if (name === "br") {
			parts.push("\n");
			return;
		}
		if (SKIPPED_TAGS.test(name) || isIgnored(el, options.ignore)) return;
		if (options.inputs && el.matches(TEXT_INPUTS)) {
			parts.push(inputValue(el));
			return;
		}
		const block = BLOCK_TAGS.test(name);
		if (block) parts.push("\n");
		readDomText(el, pre || name === "pre" || name === "textarea", parts, options);
		if (block) parts.push("\n");
	}

	/**
	 * The descendants of `cell` whose text is not read with `innerText`: the elements matching `ignore`
	 * (left out), `<select>`s (read as their selected options), and with `inputs`, text inputs and text
	 * areas (read as their value). Not their descendants.
	 */
	function specialElements(cell: Element, ignore: string, inputs: boolean): Element[] {
		const found: Element[] = [];
		if (cell.firstElementChild === null) return found;
		const selector = (ignore === "" ? "select" : ignore + ", select") + (inputs ? ", " + TEXT_INPUTS : "");
		for (const el of Array.from(cell.querySelectorAll(selector))) {
			const inFound = found.some(function (outer) {
				return outer.contains(el);
			});
			if (!inFound) found.push(el);
		}
		return found;
	}

	/** Reads the shown text of the children of `node`, leaving out `special` elements, into `parts`. */
	function readShownText(node: Element, special: Element[], parts: string[]): void {
		const style = getComputedStyle(node);
		const pre = style.whiteSpace.slice(0, 3) === "pre";
		const shown = style.visibility === "visible";
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === 3) {
				const value = child.nodeValue ?? "";
				if (shown) parts.push(transformText(pre ? value : value.replace(CSS_WHITESPACE, " "), style.textTransform));
				continue;
			}
			if (isElement(child)) readShownElement(child, special, parts);
		}
	}

	/** Reads the shown text of `el`, a child of an element with `special` descendants, into `parts`. */
	function readShownElement(el: Element, special: Element[], parts: string[]): void {
		if (el.localName === "br") {
			parts.push("\n");
			return;
		}
		const style = getComputedStyle(el);
		if (style.display === "none") return;
		if (el.localName === "select" && "selectedOptions" in el) {
			parts.push(selectedText(el as HTMLSelectElement));
			return;
		}
		if (special.indexOf(el) !== -1) {
			// A text input among the special elements is read as its value; the others are left out.
			if (el.matches(TEXT_INPUTS) && style.visibility === "visible") parts.push(inputValue(el));
			return;
		}
		const block = style.display.slice(0, 6) !== "inline" && style.display !== "contents";
		if (block) parts.push("\n");
		const mixed = special.some(function (inner) {
			return el.contains(inner);
		});
		if (mixed) {
			readShownText(el, special, parts);
		} else {
			parts.push(rawText(el, false));
		}
		if (block) parts.push("\n");
	}

	/** The value of a text input or text area. */
	function inputValue(el: Element): string {
		return "value" in el ? String((el as HTMLInputElement).value) : "";
	}

	function selectedText(select: HTMLSelectElement): string {
		return Array.from(select.selectedOptions)
			.map(function (option) {
				return option.text;
			})
			.join("\n");
	}

	/** Applies a computed `text-transform`, like `innerText` does. */
	function transformText(text: string, transform: string): string {
		if (transform === "uppercase") return text.toUpperCase();
		if (transform === "lowercase") return text.toLowerCase();
		if (transform === "capitalize") {
			return text.replace(/(^|\s)(\S)/g, function (_match, space: string, letter: string) {
				return space + letter.toUpperCase();
			});
		}
		return text;
	}

	/** The normalized text of a body cell. */
	function textOf(model: TableModel, el: Element): string {
		const cached = model.texts.get(el);
		if (cached !== undefined) return cached;
		const text = normalizeCell(readText(el, model.cfg, model.cfg.inputs));
		model.texts.set(el, text);
		return text;
	}

	/** The raw text of a body cell. */
	function rawOf(model: TableModel, el: Element): string {
		const cached = model.raws.get(el);
		if (cached !== undefined) return cached;
		const text = rawText(el, model.cfg.textContent);
		model.raws.set(el, text);
		return text;
	}

	/** `value`, or `null` if it is an empty string. */
	function nonEmpty(value: string | null): string | null {
		return value === "" ? null : value;
	}

	/**
	 * A `rowspan`/`colspan` attribute, or its `aria-rowspan`/`aria-colspan` counterpart, capped like the
	 * browser caps it (1000 columns, 65534 rows). A `rowspan` of 0 is 0: the cell spans to the end of its row
	 * group. Anything else invalid is 1.
	 */
	function span(el: Element, name: "rowspan" | "colspan"): number {
		const value = parseInt(nonEmpty(el.getAttribute(name)) ?? nonEmpty(el.getAttribute("aria-" + name)) ?? "1", 10);
		if (isNaN(value) || value < 0) return 1;
		if (name === "colspan") return value === 0 ? 1 : Math.min(value, 1000);
		return Math.min(value, 65534);
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
		const ends = rowGroupEnds(rows);
		rows.forEach(function (group, r) {
			let c = 0;
			// Like in HTML, a rowspan stops at the end of its row group (`<tbody>`), and 0 spans to it.
			const end = ends[r] ?? rows.length;
			for (const el of ownCells(group, cellSelector, ownCellSelector, deep)) {
				const colindex = parseInt(el.getAttribute("aria-colindex") ?? "", 10);
				if (colindex >= 1) {
					c = colindex - 1;
				} else {
					while (grid[r]?.[c] !== undefined) c++;
				}
				const spanned = span(el, "rowspan");
				const rowspan = spanned === 0 ? end - r : Math.min(spanned, end - r);
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

	/**
	 * For each logical row, the index after the last row of its HTML row group: the rows that follow it in
	 * the same `<thead>`, `<tbody>` or `<tfoot>`. Rows outside one (such as ARIA rows) are one group.
	 */
	function rowGroupEnds(rows: RowGroup[]): number[] {
		const sections = rows.map(function (group) {
			const parent = group[0].parentElement;
			return parent !== null && /^(thead|tbody|tfoot)$/.test(parent.localName) ? parent : null;
		});
		const ends: number[] = [];
		for (let r = rows.length - 1; r >= 0; r--) {
			const next = ends[r + 1];
			ends[r] = next !== undefined && sections[r] === sections[r + 1] ? next : r + 1;
		}
		return ends;
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
	function headerKeys(line: GridLine, cfg: Config): string[] {
		const keys: string[] = [];
		// A `for...of` loop visits holes too, as `undefined`.
		for (const cell of line) {
			if (cell === undefined) {
				keys.push(EMPTY_HEADER);
				continue;
			}
			// Header cells never read their inputs, such as filter fields
			const base = normalizeLine(readText(cell.el, cfg, false)) || EMPTY_HEADER;
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
	function buildModel(scope: Node, cfg: Config): TableModel | null {
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
		let footer: TableBody | null = null;
		return {
			hasHeader: headerRows.length > 0,
			keys: headerKeys(mainLine, cfg),
			headerCells: mainLine.map(function (cell) {
				return cell === undefined ? undefined : cell.el;
			}),
			body: function (): TableBody {
				return (body ??= buildBody(scope, cfg, cfg.bodyRow, cfg.emptyRow, headerIndexes, deep));
			},
			footer: function (): TableBody {
				return (footer ??= buildBody(scope, cfg, cfg.footerRow, "", headerIndexes, deep));
			},
			texts: new Map(),
			raws: new Map(),
			cfg: cfg,
		};
	}

	/**
	 * The body rows of the table, or with the footer row selector, its footer rows. Rows matching `empty`
	 * (placeholder rows such as "No data") are left out.
	 */
	function buildBody(
		scope: Node & ParentNode,
		cfg: Config,
		rowSelector: string,
		empty: string,
		headerIndexes: Set<string>,
		deep: boolean
	): TableBody {
		if (rowSelector === "") return { rows: [], rowOf: new Map(), grid: [] };
		const anyCell = cfg.headerCell + "," + cfg.bodyCell;
		const groups = groupRows(ownRows(scope, rowSelector, anyCell, deep)).filter(function (group) {
			const key = group[0].getAttribute("aria-rowindex");
			if (empty !== "" && group[0].matches(empty)) return false;
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
			model = buildModel(table, resolveConfig(cfg));
			byConfig.set(cfgKey, model);
		}
		return model;
	}

	function compilePredicate(src: string): ((text: string, raw: string) => unknown) | null {
		if (predicateCache.has(src)) return predicateCache.get(src) ?? null;
		let fn: ((text: string, raw: string) => unknown) | null = null;
		// `predicate` conditions are serialized functions, so compiling them is the feature. The engine is
		// registered in an isolated world, where a strict page CSP does not block this.
		try {
			// oxlint-disable-next-line typescript/no-implied-eval -- compiles a `predicate` condition, see above
			const value: unknown = new Function("return (" + src + ");")();
			if (typeof value === "function") fn = value as (text: string, raw: string) => unknown;
		} catch {
			// Method shorthand (`predicate(t) { ... }`) is not a valid expression on its own.
			try {
				// oxlint-disable-next-line typescript/no-implied-eval -- compiles a `predicate` condition, see above
				const holder: unknown = new Function("return ({" + src + "});")();
				if (holder !== null && typeof holder === "object") {
					const values = Object.keys(holder).map(function (key) {
						return (holder as Record<string, unknown>)[key];
					});
					if (typeof values[0] === "function") fn = values[0] as (text: string, raw: string) => unknown;
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
				const expected = normalizeCell(matcher.v);
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
				const ignoreCase = matcher.i === true;
				const values = matcher.v.map(function (value) {
					return ignoreCase ? normalizeCell(value).toLowerCase() : normalizeCell(value);
				});
				return function (text) {
					return values.indexOf(ignoreCase ? text.toLowerCase() : text) !== -1;
				};
			}
			case "e":
				return function (text) {
					return text === "";
				};
			case "f":
				return compilePredicateMatcher(matcher.src, header);
			case "g":
				return compileNumberMatcher(matcher);
			case "n": {
				const inner = compileMatcher(matcher.m, header);
				return function (text, raw) {
					return !inner(text, raw);
				};
			}
			case "a": {
				const tests = compileAll(matcher.m, header);
				return function (text, raw) {
					return tests.some(function (test) {
						return test(text, raw);
					});
				};
			}
			case "l": {
				const tests = compileAll(matcher.m, header);
				// An empty list never matches.
				return function (text, raw) {
					return (
						tests.length > 0 &&
						tests.every(function (test) {
							return test(text, raw);
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
		const expected = matcher.i ? normalizeCell(matcher.v).toLowerCase() : normalizeCell(matcher.v);
		const op = matcher.op;
		return function (text) {
			const actual = matcher.i ? text.toLowerCase() : text;
			if (op === "equals") return actual === expected;
			if (op === "contains") return actual.indexOf(expected) !== -1;
			if (op === "startsWith") return actual.slice(0, expected.length) === expected;
			return expected.length <= actual.length && actual.slice(actual.length - expected.length) === expected;
		};
	}

	/** A numeric condition. A cell that is not a number never matches. */
	function compileNumberMatcher(matcher: Extract<SerializedMatcher, { t: "g" }>): TextTest {
		const op = matcher.op;
		const low = matcher.v;
		const high = matcher.w;
		const decimal = matcher.d;
		return function (text) {
			const value = parseNumber(text, decimal);
			if (isNaN(value)) return false;
			if (op === "gt") return value > low;
			if (op === "gte") return value >= low;
			if (op === "lt") return value < low;
			if (op === "lte") return value <= low;
			return value >= low && value <= high;
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
		return function (text, raw) {
			if (predicate === null) throw PREDICATE_FAILED;
			let result: unknown;
			try {
				result = predicate(text, raw());
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
		return model.keys.indexOf(normalizeLine(column));
	}

	/** The text of body row `r` in grid column `c`. Positions without a cell read as an empty string. */
	function cellText(model: TableModel, r: number, c: number): string {
		const cell = model.body().grid[r]?.[c];
		return cell === undefined ? "" : textOf(model, cell.el);
	}

	/** The raw text of body row `r` in grid column `c`. Positions without a cell read as an empty string. */
	function cellRaw(model: TableModel, r: number, c: number): string {
		const cell = model.body().grid[r]?.[c];
		return cell === undefined ? "" : rawOf(model, cell.el);
	}

	/** The number of grid columns: the header keys, or the widest body row if that is wider. */
	function gridWidth(model: TableModel): number {
		let width = model.keys.length;
		for (const line of model.body().grid) {
			if (line.length > width) width = line.length;
		}
		return width;
	}

	/**
	 * The grid column of a condition: of its header key, or its column index (up to the widest body row),
	 * or -1 if the table has no such column.
	 */
	function conditionColumn(model: TableModel, header: string | number): number {
		if (typeof header === "string") return model.keys.indexOf(normalizeLine(header));
		return header >= 0 && header % 1 === 0 && header < gridWidth(model) ? header : -1;
	}

	/** The conditions of `where` with the grid columns of their headers, or `null` if a header is unknown. */
	function whereColumns(model: TableModel, where: SerializedWhere): ColumnCondition[] | null {
		const conditions: ColumnCondition[] = [];
		for (const condition of where) {
			const column = conditionColumn(model, condition.h);
			if (column === -1) return null;
			conditions.push({ column: column, test: compileMatcher(condition.m, String(condition.h)) });
		}
		return conditions;
	}

	/** The headers (or column indexes) of the conditions in `expected` that the table doesn't have. */
	function unknownHeaders(model: TableModel, expected: SerializedWhere[]): (string | number)[] {
		const unknown: (string | number)[] = [];
		for (const where of expected) {
			for (const condition of where) {
				const header = condition.h;
				if (conditionColumn(model, header) === -1 && unknown.indexOf(header) === -1) unknown.push(header);
			}
		}
		return unknown;
	}

	/** Whether row `r` matches every condition. A predicate that cannot run fails the row. */
	function rowMatches(model: TableModel, r: number, conditions: ColumnCondition[]): boolean {
		try {
			return conditions.every(function (condition) {
				return condition.test(cellText(model, r, condition.column), function () {
					return cellRaw(model, r, condition.column);
				});
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
		const headerRow = resolveConfig(query.cfg).headerRow;
		let fallback: Element[] | null = null;
		let ancestor = parentOf(row);
		while (ancestor !== null) {
			if ((byIndex && fallback === null) || hasHeaderRow(ancestor, headerRow)) {
				const model = getModel(ancestor, query.cfg);
				if (model !== null && (model.body().rowOf.has(row) || model.footer().rowOf.has(row))) {
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
		const body = model.body().rowOf.has(row) ? model.body() : model.footer();
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
		const lines = query.f === 1 ? model.body().grid.concat(model.footer().grid) : model.body().grid;
		for (const line of lines) {
			const cell = line[column];
			if (cell !== undefined) cells.push(cell.el);
		}
		return unique(cells);
	}

	function queryFooter(root: Node, query: Extract<EngineQuery, { op: "footer" }>): Element[] {
		const model = getModel(root, query.cfg);
		return model === null ? [] : model.footer().rows;
	}

	function queryHeader(root: Node, query: Extract<EngineQuery, { op: "header" }>): Element[] {
		const model = getModel(root, query.cfg);
		if (model === null) return [];
		const column = columnOf(model, query.header);
		const cell = column === -1 ? undefined : model.headerCells[column];
		return cell === undefined ? [] : [cell];
	}

	/**
	 * Header keys and the text of every body cell (or only under `columns`, in that order): normalized, or
	 * with `raw`, as the browser reads it. Without `columns`, a row has a text for every grid column, also
	 * in a table without header rows or with body rows wider than the header.
	 */
	function readTexts(model: TableModel, raw: boolean, columns?: string[]): EngineTexts {
		const indexes: number[] = [];
		if (columns === undefined) {
			const width = gridWidth(model);
			for (let c = 0; c < width; c++) indexes.push(c);
		} else {
			for (const key of columns) indexes.push(model.keys.indexOf(normalizeLine(key)));
		}
		const rows: string[][] = [];
		for (let r = 0; r < model.body().rows.length; r++) {
			const texts: string[] = [];
			for (const c of indexes) {
				texts.push(c === -1 ? "" : raw ? cellRaw(model, r, c) : cellText(model, r, c));
			}
			rows.push(texts);
		}
		return { keys: model.keys, rows: rows };
	}

	/**
	 * A hash (FNV-1a) of the header keys and the text of every body cell, with the number of body rows. The
	 * texts are hashed one by one, without building one string of the whole table.
	 */
	function fingerprint(model: TableModel): EngineFingerprint {
		let hash = 0x811c9dc5;
		let length = 0;
		// Separators between cells (1) and rows (2), so ["ab", ""] and ["a", "b"] hash differently.
		function add(text: string, separator: number): void {
			for (let i = 0; i < text.length; i++) {
				hash ^= text.charCodeAt(i);
				hash = Math.imul(hash, 0x01000193);
			}
			hash ^= separator;
			hash = Math.imul(hash, 0x01000193);
			length += text.length + 1;
		}
		for (const key of model.keys) add(key, 1);
		add("", 2);
		const rows = model.body().rows.length;
		const width = gridWidth(model);
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < width; c++) add(cellText(model, r, c), 1);
			add("", 2);
		}
		return { rows: rows, hash: (hash >>> 0).toString(16) + ":" + length };
	}

	/** Attributes that identify a row in virtualized grids, in the order they are tried. */
	const ROW_KEY_ATTRIBUTES = ["aria-rowindex", "row-index", "data-rowindex", "data-index", "data-id"];
	/** The row key attributes that hold the position of the row, so rows can be ordered by them. */
	const ROW_POSITION_ATTRIBUTES = ["aria-rowindex", "row-index", "data-rowindex", "data-index"];

	/**
	 * The body rows in view, with a key per row: the `rowKey` attribute, or the first of the default key
	 * attributes, or else the normalized cell texts and how often the same texts came before in this view,
	 * so identical rows stay apart. Only a position attribute gives a row an `index` to order by: an id
	 * such as `data-id` says nothing about where the row is shown.
	 */
	function readWindow(model: TableModel, request: EngineWindowRequest): EngineWindow {
		const texts = readTexts(model, request.raw === true, request.columns);
		let all: string[][] | null = request.raw !== true && request.columns === undefined ? texts.rows : null;
		const names = request.rowKey === undefined ? ROW_KEY_ATTRIBUTES : [request.rowKey];
		const seen = new Map<string, number>();
		const rows = model.body().rows.map(function (row, r) {
			let attribute: string | null = null;
			let name = "";
			for (const candidate of names) {
				attribute = nonEmpty(row.getAttribute(candidate));
				name = candidate;
				if (attribute !== null) break;
			}
			const cells = texts.rows[r] ?? [];
			if (attribute === null) {
				all ??= readTexts(model, false).rows;
				const text = JSON.stringify(all[r] ?? []);
				const count = seen.get(text) ?? 0;
				seen.set(text, count + 1);
				return { key: "text:" + text + "#" + count, index: null, texts: cells };
			}
			const index = ROW_POSITION_ATTRIBUTES.indexOf(name) === -1 ? NaN : Number(attribute);
			return { key: attribute, index: isFinite(index) ? index : null, texts: cells };
		});
		return { keys: texts.keys, rows: rows };
	}

	/**
	 * The `aria-rowcount` of the grid (on `root`, inside it, or around it), and the number of rows it counts
	 * that are not body rows: the other rows of the grid, by `aria-rowindex` when they have one.
	 */
	function readTotal(root: Element, model: TableModel): EngineTotal {
		const body = model.body();
		const anyCell = model.cfg.headerCell + "," + model.cfg.bodyCell;
		// Not the aria-rowcount of a grid nested in a cell of this one
		const inside = Array.from(root.querySelectorAll("[aria-rowcount]")).find(function (el) {
			return owned(el, root, anyCell) && !el.matches(anyCell);
		});
		const holder = root.hasAttribute("aria-rowcount") ? root : (inside ?? root.closest("[aria-rowcount]"));
		const count = holder === null ? NaN : parseInt(holder.getAttribute("aria-rowcount") ?? "", 10);
		const scope = holder !== null && holder.contains(root) ? holder : root;
		const others = new Set<string>();
		ownRows(scope, "[role=row], tr", anyCell, hasShadowHost(scope)).forEach(function (row, i) {
			if (body.rowOf.has(row)) return;
			others.add(row.getAttribute("aria-rowindex") ?? "row " + i);
		});
		return {
			ariaRowCount: isNaN(count) || count < 0 ? null : count,
			otherRows: others.size,
			bodyRows: body.rows.length,
		};
	}

	/**
	 * The text of every body cell in `column`, or `null` if there is no such column. A column index works
	 * without header rows, up to the widest body row.
	 */
	function readValues(model: TableModel, column: string | number): EngineValues {
		const body = model.body();
		const c = columnOf(model, column);
		if (c === -1 || c >= gridWidth(model)) return { keys: model.keys, values: null };
		const values: string[] = [];
		for (let r = 0; r < body.rows.length; r++) {
			values.push(cellText(model, r, c));
		}
		return { keys: model.keys, values: values };
	}

	function matchRows(model: TableModel, expected: SerializedWhere[], withTexts: boolean): EngineMatchResult {
		const unknown = unknownHeaders(model, expected);
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
		// The texts are only needed to describe a mismatch, and only once: on request, and never for a match.
		const rows = pass || !withTexts ? [] : readTexts(model, false).rows;
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

	/**
	 * For each set of conditions in `expected`, the indexes of the body rows that match it. With `assign`,
	 * instead the body row each set gets in {@link assignRows}.
	 */
	function matrixRows(model: TableModel, expected: SerializedWhere[], assign: boolean): EngineMatrixResult {
		const count = model.body().rows.length;
		if (assign) {
			return {
				keys: model.keys,
				count: count,
				matches: [],
				assigned: assignRows(
					model,
					expected.map(function (where) {
						return whereColumns(model, where);
					})
				),
				unknown: unknownHeaders(model, expected),
				errors: predicateErrors ?? [],
			};
		}
		const matches = expected.map(function (where) {
			const conditions = whereColumns(model, where);
			const found: number[] = [];
			if (conditions === null) return found;
			for (let r = 0; r < count; r++) {
				if (rowMatches(model, r, conditions)) found.push(r);
			}
			return found;
		});
		return {
			keys: model.keys,
			count: count,
			matches: matches,
			unknown: unknownHeaders(model, expected),
			errors: predicateErrors ?? [],
		};
	}

	/**
	 * Gives each entry a different body row it matches, as many as possible (a maximum bipartite matching),
	 * so overlapping entries such as `{ Status: "Active" }` and `{ Name: "John" }` don't take each other's
	 * rows. Returns the body row of every entry, or -1 for the ones left without (and for an entry with an
	 * unknown header, `null` in `entries`).
	 *
	 * Rows are tested only when needed, so thousands of entries don't test every row: a greedy pass gives
	 * each entry the first free row it matches, and only the entries left without one search for a chain
	 * of rows to swap (an augmenting path), with a stack instead of recursion.
	 */
	function assignRows(model: TableModel, entries: (ColumnCondition[] | null)[]): number[] {
		const count = model.body().rows.length;
		const assigned: number[] = [];
		const owner = new Map<number, number>();
		entries.forEach(function (conditions, entry) {
			assigned.push(-1);
			if (conditions === null) return;
			for (let r = 0; r < count; r++) {
				if (!owner.has(r) && rowMatches(model, r, conditions)) {
					owner.set(r, entry);
					assigned[entry] = r;
					return;
				}
			}
		});
		entries.forEach(function (conditions, entry) {
			if (conditions !== null && assigned[entry] === -1) augment(model, entries, entry, owner, assigned);
		});
		return assigned;
	}

	/**
	 * Gives entry `start` a row: a free one it matches, or one whose owner moves to another row it matches,
	 * and so on (searched depth first). Updates `owner` and `assigned`.
	 */
	function augment(
		model: TableModel,
		entries: (ColumnCondition[] | null)[],
		start: number,
		owner: Map<number, number>,
		assigned: number[]
	): void {
		const count = model.body().rows.length;
		const seen = new Set<number>();
		// The entries on the path, with the next row each one tries, and the row each one takes
		const path: { entry: number; next: number }[] = [{ entry: start, next: 0 }];
		const taken: number[] = [];
		while (path.length > 0) {
			const level = path.length - 1;
			const step = path[level] as { entry: number; next: number };
			const conditions = entries[step.entry];
			if (step.next >= count || conditions === null || conditions === undefined) {
				path.pop();
				continue;
			}
			const r = step.next++;
			if (seen.has(r) || !rowMatches(model, r, conditions)) continue;
			seen.add(r);
			taken[level] = r;
			const current = owner.get(r);
			if (current !== undefined) {
				path.push({ entry: current, next: 0 });
				continue;
			}
			// A free row: every entry on the path takes its row, and the owner of that row moves on.
			for (let i = 0; i < path.length; i++) {
				const entry = (path[i] as { entry: number }).entry;
				const row = taken[i] as number;
				owner.set(row, entry);
				assigned[entry] = row;
			}
			return;
		}
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
				case "footer":
					return queryFooter(root, query);
				default:
					return [];
			}
		} catch {
			return [];
		}
	}

	/** Answers a request that reads the table. */
	function read(
		model: TableModel | null,
		request:
			| EngineKeysRequest
			| EngineTextsRequest
			| EngineValuesRequest
			| EngineFingerprintRequest
			| EngineWindowRequest
	): string[] | EngineTexts | EngineValues | EngineFingerprint | EngineWindow {
		if (request.op === "keys") return model === null ? [] : model.keys;
		if (request.op === "texts") {
			return model === null ? { keys: [], rows: [] } : readTexts(model, request.raw === true, request.columns);
		}
		if (request.op === "values") return model === null ? { keys: [], values: null } : readValues(model, request.column);
		if (request.op === "window") return model === null ? { keys: [], rows: [] } : readWindow(model, request);
		return model === null ? { rows: 0, hash: "" } : fingerprint(model);
	}

	/** Answers a request that matches conditions, collecting the problems with `predicate` conditions. */
	function match(
		model: TableModel | null,
		request: EngineFindRequest | EngineMatchRequest | EngineMatrixRequest
	): EngineFindResult | EngineMatchResult | EngineMatrixResult {
		predicateErrors = [];
		if (request.op === "find") return model === null ? { matches: 0, errors: [] } : findRows(model, request.where);
		if (request.op === "matrix") {
			return model === null
				? { keys: [], count: 0, matches: [], unknown: [], errors: [] }
				: matrixRows(model, request.rows, request.assign === 1);
		}
		return model === null
			? { keys: [], rows: [], count: 0, matched: [], unknown: [], errors: [] }
			: matchRows(model, request.rows, request.texts === 1);
	}

	if (root !== undefined && request !== undefined) {
		const cfg = resolveConfig(request.cfg);
		if (request.op === "text") return normalizeCell(readText(root, cfg, cfg.inputs));
		if (request.op === "total") {
			const totalModel = buildModel(root, cfg);
			return totalModel === null ? { ariaRowCount: null, otherRows: 0, bodyRows: 0 } : readTotal(root, totalModel);
		}
		const model = buildModel(root, cfg);
		if (request.op === "find" || request.op === "match" || request.op === "matrix") return match(model, request);
		return read(model, request);
	}

	return {
		query: function (root: Node, body: string): Element | null {
			return queryAll(root, body)[0] ?? null;
		},
		queryAll: queryAll,
		normalizeLine: normalizeLine,
		normalizeCell: normalizeCell,
		parseNumber: parseNumber,
		defaultIgnore: DEFAULT_IGNORE.slice(),
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

/**
 * The engine function typed for its "text" mode, for use with `locator.evaluate` on a body cell.
 * Same function object as {@link tableSelectorEngine}.
 *
 * @internal
 */
export const readCellText: (root: Element, request: EngineTextRequest) => string = tableSelectorEngine;

/**
 * The engine function typed for its "fingerprint" mode, for use with `locator.evaluate`.
 * Same function object as {@link tableSelectorEngine}.
 *
 * @internal
 */
export const readTableFingerprint: (root: Element, request: EngineFingerprintRequest) => EngineFingerprint =
	tableSelectorEngine;

/**
 * The engine function typed for its "matrix" mode, for use with `locator.evaluate`.
 * Same function object as {@link tableSelectorEngine}.
 *
 * @internal
 */
export const matchTableMatrix: (root: Element, request: EngineMatrixRequest) => EngineMatrixResult =
	tableSelectorEngine;

/**
 * The engine function typed for its "window" mode, for use with `locator.evaluate`.
 * Same function object as {@link tableSelectorEngine}.
 *
 * @internal
 */
export const readTableWindow: (root: Element, request: EngineWindowRequest) => EngineWindow = tableSelectorEngine;

/**
 * The engine function typed for its "total" mode, for use with `locator.evaluate`.
 * Same function object as {@link tableSelectorEngine}.
 *
 * @internal
 */
export const readTableTotal: (root: Element, request: EngineTotalRequest) => EngineTotal = tableSelectorEngine;

const engine = tableSelectorEngine();

/**
 * Normalizes text to one line, exactly as the engine normalizes header text: icon glyphs and invisible
 * characters are removed, accents are composed (NFC), and every run of whitespace (line breaks included)
 * becomes one space. Header names passed to {@link TableLocator} are normalized with it.
 *
 * @internal
 */
export const normalizeLine: (text: string) => string = engine.normalizeLine;

/**
 * Normalizes text exactly as the engine normalizes body cell text: like {@link normalizeLine}, but line
 * breaks stay, as one `\n` between trimmed, non-empty lines.
 *
 * @internal
 */
export const normalizeCell: (text: string) => string = engine.normalizeCell;

/**
 * Parses the one number in a text exactly as numeric cell conditions do, or returns `NaN`. See
 * {@link DecimalSeparator} for the rules.
 *
 * @internal
 */
export const parseNumber: (text: string, decimal: DecimalSeparator) => number = engine.parseNumber;

/**
 * The default `ignore` option of {@link TableLocator}: CSS selectors of the elements inside a cell whose
 * text is left out. They cover screen reader only text (`.sr-only`, `.visually-hidden`), ligature icons
 * (Material Icons and Material Symbols, whose text such as `arrow_upward` is drawn as an icon) and
 * decorative content (`[aria-hidden=true]`).
 *
 * Spread it to add your own selectors: `ignore: [...DEFAULT_IGNORE, ".sort-icon"]`.
 */
export const DEFAULT_IGNORE: readonly string[] = Object.freeze(engine.defaultIgnore);
