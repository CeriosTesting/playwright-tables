// Runs against the built ES module bundle (`npm run build` first) to prove the selector engine
// survives bundling. Plain JS so `tsc` does not need `dist/` to exist.
import { defineTable, expect, TableLocator, tableMatchers, test } from "../../dist/index.mjs";

test("pw-table engine from dist/index.mjs (ESM) resolves rows and cells", async ({ page }) => {
	expect(typeof TableLocator).toBe("function");
	expect(Object.keys(tableMatchers)).toEqual(["toHaveRow", "toHaveRowCount", "toHaveHeaders", "toHaveCells"]);

	await page.goto("/combined-span-table");
	const table = defineTable(page.locator("table"), { headers: ["Region", "Q1", "Q2", "Q3", "Q4"] });

	await expect(table.row({ Region: "South" }).cell("Q2")).toHaveText("Combined N+S Q1-Q2");
	await expect(table.row({ Q4: { predicate: text => Number(text) > 700 } }).cell("Region")).toHaveText("East");
	await expect(table).toHaveRow({ Region: /^nor/i });
	await expect(table).toHaveHeaders(["Region", "Q4"]);
	await expect(table.row({ Region: "East" })).toHaveCells({ Q1: "500", Q2: { not: { empty: true } } });
	expect(await table.headerKeys()).toEqual(["Region", "Q1", "Q2", "Q3", "Q4"]);
});
