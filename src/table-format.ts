import type { EngineTexts } from "./table-locator.types";
import { normalizeLine } from "./table-selector-engine";

/** Longest cell text shown in a formatted table. */
const MAX_CELL_WIDTH = 30;

/** Options for {@link formatRows} and {@link formatMarkdown}. */
export type FormatOptions = {
	/** The rows to show, by index. Defaults to every row. */
	indexes?: readonly number[];
	/**
	 * The columns to show, by header key or index. Columns the table doesn't have are skipped; when none is
	 * left, every column is shown.
	 */
	columns?: readonly (string | number)[];
	/** The most rows to show. */
	maxRows: number;
};

/**
 * Body rows as an aligned text table, with the row index in front, for failure messages and logs. Line
 * breaks in a cell show as `↵`, and long cells are cut off.
 *
 * @example
 *   # | Name | Status
 *   0 | John | Active
 *
 * @internal
 */
export function formatRows(body: EngineTexts, options: FormatOptions): string {
	const indexes = options.indexes ?? body.rows.map((_row, index) => index);
	if (indexes.length === 0) return "  (none)\n";
	const columns = pickColumns(body, options.columns);
	const shown = indexes.slice(0, options.maxRows);
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

/**
 * Body rows as a Markdown table, with the row index in front, for test report attachments. Cell text is
 * not cut off.
 *
 * @internal
 */
export function formatMarkdown(body: EngineTexts, options: FormatOptions): string {
	const indexes = options.indexes ?? body.rows.map((_row, index) => index);
	const columns = pickColumns(body, options.columns);
	const cell = (text: string): string => text.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
	const shown = indexes.slice(0, options.maxRows);
	const lines = [
		`| # | ${columns.map(column => cell(body.keys[column] ?? "")).join(" | ")} |`,
		`| --- | ${columns.map(() => "---").join(" | ")} |`,
		...shown.map(
			index => `| ${index} | ${columns.map(column => cell(body.rows[index]?.[column] ?? "")).join(" | ")} |`
		),
	];
	if (indexes.length > shown.length) lines.push("", `... and ${indexes.length - shown.length} more rows`);
	return lines.join("\n") + "\n";
}

/** The grid columns of `headers` that the table has, or every column if there are none. */
function pickColumns(body: EngineTexts, headers: readonly (string | number)[] | undefined): number[] {
	const columns: number[] = [];
	for (const header of headers ?? []) {
		const column = typeof header === "number" ? header : body.keys.indexOf(normalizeLine(header));
		if (column >= 0 && column < body.keys.length && !columns.includes(column)) columns.push(column);
	}
	return columns.length > 0 ? columns : body.keys.map((_key, index) => index);
}
