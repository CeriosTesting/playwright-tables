import test, { expect } from "@playwright/test";
import { PlaywrightTable } from "src/playwright-table";
import { EngineConfig, EngineKeysRequest } from "src/table-locator.types";
import { normalizeCell, normalizeLine, readTableHeaderKeys, tableSelectorEngine } from "src/table-selector-engine";

import { Route } from "./demo-html/routes";

const defaultConfig: EngineConfig = {
	headerRow: "thead>tr",
	headerCell: "th",
	bodyRow: "tbody>tr",
	bodyCell: "td",
};

function keysRequest(cfg: EngineConfig): EngineKeysRequest {
	return { op: "keys", cfg };
}

test.describe("pw-table selector engine", () => {
	test("engine source contains no bundler-injected helpers", () => {
		const source = tableSelectorEngine.toString();
		for (const helper of ["__name", "__publicField", "__spreadValues", "_defineProperty", "require("]) {
			expect(source, `engine source must not reference ${helper}`).not.toContain(helper);
		}
	});

	test("engine factory returns a selector engine when called without arguments", () => {
		const engine = tableSelectorEngine();
		expect(typeof engine.query).toBe("function");
		expect(typeof engine.queryAll).toBe("function");
	});

	test("Node and the browser normalize text the same way", async ({ page }) => {
		const samples = [
			"  First \r\n\t name  ",
			"Street 1  \r\n\r\n  Amsterdam ",
			"a\u00A0b\u2028c\u2029d\u000be",
			"Verzeke\u00ADrings\u200Bnummer\u2060",
			"\u200EAmount\u200F \u202AX\u202C \u2066Y\u2069\uFEFF",
			"Cafe\u0301",
			"Sort \uE5CF \u{f0001}",
			"\u{1f468}\u200D\u{1f469}\u200D\u{1f467} € °C ✓ \u2764\uFE0F",
			"",
		];
		const inBrowser = await page.evaluate(
			({ source, texts }) => {
				// oxlint-disable-next-line typescript/no-implied-eval -- runs the engine source like Playwright does
				const factory = new Function("return (" + source + ")")() as () => {
					normalizeLine(text: string): string;
					normalizeCell(text: string): string;
				};
				const browserEngine = factory();
				return texts.map(text => [browserEngine.normalizeLine(text), browserEngine.normalizeCell(text)]);
			},
			{ source: tableSelectorEngine.toString(), texts: samples }
		);
		expect(inBrowser).toEqual(samples.map(text => [normalizeLine(text), normalizeCell(text)]));
		expect(normalizeLine(samples[0] ?? "")).toBe("First name");
		expect(normalizeCell(samples[1] ?? "")).toBe("Street 1\nAmsterdam");
		expect(normalizeCell(samples[2] ?? "")).toBe("a b\nc\nd e");
		expect(normalizeLine(samples[3] ?? "")).toBe("Verzekeringsnummer");
		expect(normalizeLine(samples[4] ?? "")).toBe("Amount X Y");
		expect(normalizeLine(samples[5] ?? "")).toBe("Caf\u00E9");
		expect(normalizeLine(samples[6] ?? "")).toBe("Sort");
		expect(normalizeLine(samples[7] ?? "")).toBe(samples[7]);
	});

	const parityRoutes = [
		Route.SimpleTable,
		Route.ButtonTable,
		Route.ColspanHeaderTable,
		Route.ColspanRowTable,
		Route.CombinedSpanTable,
		Route.DuplicateEmptyHeadersTable,
		Route.EmptyHeaderRowsTable,
		Route.InnerTextTable,
		Route.PrimitivesTable,
		Route.RowspanHeaderTable,
		Route.RowspanRowTable,
	];

	for (const route of parityRoutes) {
		test(`header keys match getJson() keys for ${route}`, async ({ page }) => {
			await page.goto(route);
			const json = await new PlaywrightTable(page.locator("table")).getJson();
			const keys = await page.locator("table").evaluate(readTableHeaderKeys, keysRequest(defaultConfig));
			expect(keys).toEqual(Object.keys(json[0] ?? {}));
		});
	}

	test("header keys match getJson() keys for a div table with custom selectors", async ({ page }) => {
		await page.goto(Route.DivTable);
		const selectors = {
			header: { rowSelector: ".divTableHeading > .divTableRow", columnSelector: ".divTableHead" },
			row: { rowSelector: ".divTableBody > .divTableRow", columnSelector: ".divTableCell" },
		};
		const json = await new PlaywrightTable(page.locator(".divTable"), selectors).getJson();
		const keys = await page.locator(".divTable").evaluate(
			readTableHeaderKeys,
			keysRequest({
				...defaultConfig,
				headerRow: selectors.header.rowSelector,
				headerCell: selectors.header.columnSelector,
				bodyRow: selectors.row.rowSelector,
				bodyCell: selectors.row.columnSelector,
			})
		);
		expect(keys).toEqual(Object.keys(json[0] ?? {}));
	});

	test("keys mode returns an empty list when the table has no header rows", async ({ page }) => {
		await page.setContent("<table><tbody><tr><td>x</td></tr></tbody></table>");
		const keys = await page.locator("table").evaluate(readTableHeaderKeys, keysRequest(defaultConfig));
		expect(keys).toEqual([]);
	});
});
