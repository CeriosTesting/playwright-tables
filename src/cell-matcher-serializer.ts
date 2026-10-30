import {
	CellCondition,
	CellMatcher,
	DecimalSeparator,
	ElementSelector,
	RowWhere,
	SerializedMatcher,
	SerializedSelector,
	SerializedText,
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

const DESCRIPTOR_KEYS = ["css", "role", "hasText", "hasNotText"];

/**
 * Converts an {@link ElementSelector} to the wire format of the `pw-table-v1` engine. A CSS selector stays
 * as it is. `option` names the option in errors, such as `"row.rowSelector"`.
 *
 * @internal
 */
export function serializeSelector(option: string, selector: ElementSelector): SerializedSelector {
	if (typeof selector === "string") return selector;
	checkDescriptor(option, selector);
	const serialized: Exclude<SerializedSelector, string> = {};
	if (selector.css !== undefined) serialized.c = serializeCss(option, selector.css);
	if (selector.role !== undefined) serialized.r = serializeRoles(option, selector.role);
	if (selector.hasText !== undefined) serialized.t = serializeText(option, "hasText", selector.hasText);
	if (selector.hasNotText !== undefined) serialized.n = serializeText(option, "hasNotText", selector.hasNotText);
	if (Object.keys(serialized).length === 0) {
		throw new TypeError(`${option} is an empty descriptor: give it css, role, hasText or hasNotText.`);
	}
	return serialized;
}

/** @throws TypeError if `selector` is not a plain object with only descriptor keys, such as a Locator. */
function checkDescriptor(option: string, selector: unknown): void {
	// Typed as a descriptor, but JavaScript callers can pass anything.
	if (selector === null || typeof selector !== "object" || Array.isArray(selector) || selector instanceof RegExp) {
		throw new TypeError(
			`${option} must be a CSS selector or a descriptor such as { role: "row" }, not ${String(selector)}.`
		);
	}
	const unknown = Object.keys(selector).filter(key => !DESCRIPTOR_KEYS.includes(key));
	if (unknown.length > 0) {
		throw new TypeError(
			`${option} has unknown keys (${unknown.join(", ")}): a descriptor has css, role, hasText and hasNotText. ` +
				`A Playwright Locator can't be used here, because the table is read in the browser.`
		);
	}
}

function serializeCss(option: string, css: unknown): string {
	if (typeof css !== "string" || css.trim() === "") {
		throw new TypeError(`${option}: css must be a non-empty CSS selector.`);
	}
	return css;
}

function serializeRoles(option: string, role: unknown): string[] {
	const roles: unknown = typeof role === "string" ? [role] : role;
	if (!Array.isArray(roles) || roles.length === 0 || !roles.every(item => typeof item === "string" && item !== "")) {
		throw new TypeError(`${option}: role must be a role, such as "row", or a non-empty list of roles.`);
	}
	return roles as string[];
}

function serializeText(option: string, key: string, text: string | RegExp): SerializedText {
	if (typeof text === "string") return { s: text };
	if (text instanceof RegExp) return { r: text.source, f: text.flags };
	throw new TypeError(`${option}: ${key} must be a string or a RegExp.`);
}
