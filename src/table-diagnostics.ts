import { describeLastError, pollUntil } from "./polling";
import type { CellMatcher, RowWhere } from "./table-locator.types";
import { normalizeLine } from "./table-selector-engine";

/** A table whose header keys can be read, such as a `TableLocator`. */
type HeaderSource = { headerKeys(options?: { timeout?: number }): Promise<string[]> };

/**
 * Waits until the table has every header in `headers`, up to `deadline`. Returns the diagnostics for the
 * headers that are still unknown at the deadline, or `""` once they are all known.
 *
 * @internal
 */
export async function waitForHeaders(
	table: HeaderSource,
	headers: readonly string[],
	deadline: number
): Promise<string> {
	if (headers.length === 0) return "";
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

/**
 * A `Header "…" not found.` line per unknown header (or `Column … does not exist.` per column index), and the
 * available headers.
 *
 * @internal
 */
export function describeUnknown(unknown: readonly (string | number)[], available: readonly string[]): string {
	return (
		unknown
			.map(header =>
				typeof header === "number" ? `Column ${header} does not exist.\n` : `Header "${header}" not found.\n`
			)
			.join("") + `Available headers: [${available.join(", ")}]\n`
	);
}

/**
 * The headers that have a condition.
 *
 * @internal
 */
export function conditionHeaders(where: RowWhere<string>): string[] {
	const entries: [string, CellMatcher | undefined][] = Object.entries(where);
	return entries.filter(entry => entry[1] !== undefined).map(entry => entry[0]);
}
