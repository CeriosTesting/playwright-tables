import {
	CellCondition,
	CellMatcher,
	DecimalSeparator,
	RowWhere,
	SerializedMatcher,
	SerializedWhere,
} from "./table-locator.types";
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

/**
 * Describes one cell matcher for messages, such as `"John"`, `/^J/` or `{ "gt": 5 }`.
 *
 * @internal
 */
export function describeMatcher(matcher: CellMatcher): string {
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
	// Typed as a matcher, but JavaScript callers can pass anything, such as `null` from a missing value.
	const value: unknown = matcher;
	if (value === null || (typeof value !== "string" && typeof value !== "object")) {
		throw new TypeError(`Condition for header "${header}" is not a supported cell matcher: ${String(value)}.`);
	}
	if (typeof matcher === "string") {
		return { t: "s", v: matcher };
	}
	if (matcher instanceof RegExp) {
		return { t: "r", s: matcher.source, f: matcher.flags };
	}
	if (matcher.predicate !== undefined) {
		return serializePredicate(header, matcher.predicate);
	}
	if (matcher.empty !== undefined) {
		return matcher.empty ? { t: "e" } : { t: "n", m: { t: "e" } };
	}
	const text = serializeTextCondition(header, matcher);
	if (text !== undefined) return text;
	const number = serializeNumberCondition(header, matcher);
	if (number !== undefined) return number;
	if (matcher.not !== undefined) {
		return { t: "n", m: serializeMatcher(header, matcher.not) };
	}
	if (matcher.anyOf !== undefined) {
		return { t: "a", m: serializeMatchers(header, "anyOf", matcher.anyOf) };
	}
	if (matcher.allOf !== undefined) {
		return { t: "l", m: serializeMatchers(header, "allOf", matcher.allOf) };
	}
	// The type covers every kind of condition, but JavaScript callers can pass any object.
	throw new TypeError(`Condition for header "${header}" is not a supported cell matcher.`);
}

function serializePredicate(header: string, predicate: unknown): SerializedMatcher {
	// Typed as a function, but JavaScript callers can pass anything.
	if (typeof predicate !== "function") {
		throw new TypeError(`Condition for header "${header}": predicate must be a function.`);
	}
	// A generator or async function returns an object, which would match every row.
	const kind = (predicate as { constructor?: { name?: string } }).constructor?.name;
	if (kind === "GeneratorFunction" || kind === "AsyncFunction" || kind === "AsyncGeneratorFunction") {
		throw new TypeError(`Condition for header "${header}": predicate must be a synchronous function, not a ${kind}.`);
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

/**
 * The wire format of a text condition (`equals`, `contains`, `startsWith`, `endsWith` or `oneOf`, each
 * with `ignoreCase`), or `undefined` if `matcher` is another kind of condition.
 */
function serializeTextCondition(header: string, matcher: CellCondition): SerializedMatcher | undefined {
	const i = matcher.ignoreCase === true;
	if (matcher.oneOf !== undefined) {
		if (matcher.oneOf.length === 0) {
			throw new TypeError(`Condition for header "${header}": oneOf needs at least one value.`);
		}
		return i ? { t: "o", v: [...matcher.oneOf], i } : { t: "o", v: [...matcher.oneOf] };
	}
	if (matcher.equals !== undefined) return { t: "c", op: "equals", v: matcher.equals, i };
	if (matcher.contains !== undefined) return { t: "c", op: "contains", v: matcher.contains, i };
	if (matcher.startsWith !== undefined) return { t: "c", op: "startsWith", v: matcher.startsWith, i };
	if (matcher.endsWith !== undefined) return { t: "c", op: "endsWith", v: matcher.endsWith, i };
	return undefined;
}

/** The wire format of a {@link NumberCondition}, or `undefined` if `matcher` is another kind of condition. */
function serializeNumberCondition(header: string, matcher: CellCondition): SerializedMatcher | undefined {
	const { decimal } = matcher;
	if (matcher.gt !== undefined) return serializeNumber(header, "gt", matcher.gt, matcher.gt, decimal);
	if (matcher.gte !== undefined) return serializeNumber(header, "gte", matcher.gte, matcher.gte, decimal);
	if (matcher.lt !== undefined) return serializeNumber(header, "lt", matcher.lt, matcher.lt, decimal);
	if (matcher.lte !== undefined) return serializeNumber(header, "lte", matcher.lte, matcher.lte, decimal);
	if (matcher.between === undefined) return undefined;
	// Typed as a pair, but JavaScript callers can pass anything.
	const range: unknown = matcher.between;
	if (!Array.isArray(range) || range.length !== 2) {
		throw new TypeError(`Condition for header "${header}": between must be a [min, max] pair.`);
	}
	const [min, max] = matcher.between;
	return serializeNumber(header, "between", min, max, decimal);
}

function serializeNumber(
	header: string,
	op: "gt" | "gte" | "lt" | "lte" | "between",
	value: number,
	upper: number,
	decimal: DecimalSeparator | undefined
): SerializedMatcher {
	// JSON turns NaN and Infinity into null, so they could never match as the caller meant.
	if (!Number.isFinite(value) || !Number.isFinite(upper)) {
		throw new TypeError(`Condition for header "${header}": ${op} needs finite numbers.`);
	}
	// Typed as a separator, but JavaScript callers can pass anything.
	const separator: unknown = decimal ?? ".";
	if (separator !== "." && separator !== ",") {
		throw new TypeError(`Condition for header "${header}": decimal must be "." or ",".`);
	}
	return { t: "g", op, v: value, w: upper, d: separator };
}

function serializeMatchers(header: string, kind: string, matchers: readonly CellMatcher[]): SerializedMatcher[] {
	if (matchers.length === 0) {
		throw new TypeError(`Condition for header "${header}": ${kind} needs at least one matcher.`);
	}
	return matchers.map(matcher => serializeMatcher(header, matcher));
}
