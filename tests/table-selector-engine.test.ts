import test, { expect } from "@playwright/test";
import { PlaywrightTable } from "src/playwright-table";
import { EngineConfig, EngineKeysRequest } from "src/table-locator.types";
import { readTableHeaderKeys, tableSelectorEngine } from "src/table-selector-engine";

import { Route } from "./demo-html/routes";

const defaultConfig: EngineConfig = {
	headerRow: "thead>tr",
	headerCell: "th",
	bodyRow: "tbody>tr",
	bodyCell: "td",
	mainHeaderRow: null,
	contentType: "innerText",
	stripIconGlyphs: false,
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
