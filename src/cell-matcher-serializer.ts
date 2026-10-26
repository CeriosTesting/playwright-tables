import { CellMatcher, RowWhere, SerializedMatcher, SerializedWhere } from "./table-locator.types";

/**
 * Converts row conditions to the wire format of the `pw-table-v1` engine. Headers without a value are skipped.
 *
 * @internal
 */
export function serializeWhere(where: RowWhere<string>): SerializedWhere {
	const conditions: SerializedWhere = [];
	const entries: [string, CellMatcher | undefined][] = Object.entries(where);
	for (const [header, matcher] of entries) {
		if (matcher !== undefined) {
			conditions.push({ h: header, m: serializeMatcher(header, matcher) });
		}
	}
	return conditions;
}

/**
 * Converts one cell matcher to the wire format of the `pw-table-v1` engine.
 *
 * @internal
 */
export function serializeMatcher(header: string, matcher: CellMatcher): SerializedMatcher {
	if (typeof matcher === "string") {
		return { t: "s", v: matcher };
	}
	if (matcher instanceof RegExp) {
		return { t: "r", s: matcher.source, f: matcher.flags };
	}
	const ignoreCase = matcher.ignoreCase === true;
	if (matcher.predicate !== undefined) {
		// Typed as a function, but JavaScript callers can pass anything.
		const predicate: unknown = matcher.predicate;
		if (typeof predicate !== "function") {
			throw new TypeError(`Condition for header "${header}": predicate must be a function.`);
		}
		const src = predicate.toString();
		// Bound and built-in functions have no source to send to the browser.
		if (src.includes("[native code]")) {
			throw new TypeError(
				`Condition for header "${header}": predicate must be a plain function, not a bound or built-in one.`
			);
		}
		return { t: "f", src };
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
	// The type says this is the last kind of condition left, but JavaScript callers can pass any object.
	const allOf: unknown = matcher.allOf;
	if (allOf !== undefined) {
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
