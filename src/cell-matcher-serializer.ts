import { CellMatcher, RowWhere, SerializedMatcher, SerializedWhere } from "./table-locator.types";
import { normalizeLine } from "./table-selector-engine";

/**
 * Converts row conditions to the wire format of the `pw-table-v1` engine. Headers without a value are
 * skipped. Header names are normalized like header text, so `"First\nname"` finds `First name`.
 *
 * @internal
 */
export function serializeWhere(where: RowWhere<string>): SerializedWhere {
	const conditions: SerializedWhere = [];
	const entries: [string, CellMatcher | undefined][] = Object.entries(where);
	for (const [header, matcher] of entries) {
		if (matcher !== undefined) {
			conditions.push({ h: normalizeLine(header), m: serializeMatcher(header, matcher) });
		}
	}
	return conditions;
}

/**
 * Describes row conditions for messages and locator descriptions, such as `{ "Name": "John" }`.
 *
 * @internal
 */
export function describeWhere(where: RowWhere<string>): string {
	const entries: [string, CellMatcher | undefined][] = Object.entries(where);
	const parts = entries
		.filter((entry): entry is [string, CellMatcher] => entry[1] !== undefined)
		.map(([header, matcher]) => `${JSON.stringify(header)}: ${describeMatcher(matcher)}`);
	return `{ ${parts.join(", ")} }`;
}

function describeMatcher(matcher: CellMatcher): string {
	if (typeof matcher === "string") return JSON.stringify(matcher);
	if (matcher instanceof RegExp) return String(matcher);
	if (matcher.predicate !== undefined) return `{ predicate: ${matcher.predicate.toString()} }`;
	if (matcher.not !== undefined) return `{ not: ${describeMatcher(matcher.not)} }`;
	if (matcher.anyOf !== undefined) return `{ anyOf: [${matcher.anyOf.map(describeMatcher).join(", ")}] }`;
	if (matcher.allOf !== undefined) return `{ allOf: [${matcher.allOf.map(describeMatcher).join(", ")}] }`;
	return JSON.stringify(matcher);
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
