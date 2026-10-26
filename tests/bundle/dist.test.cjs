// Runs against the built CommonJS bundle (`npm run build` first) to prove the selector engine
// survives bundling. Plain JS so `tsc` does not need `dist/` to exist.
const { defineTable, expect, TableLocator, tableMatchers, test } = require("../../dist/index.js");

test("pw-table engine from dist/index.js (CJS) resolves rows and cells", async ({ page }) => {
	expect(typeof TableLocator).toBe("function");
	expect(Object.keys(tableMatchers)).toEqual([
		"toHaveRow",
		"toHaveRowCount",
		"toHaveRows",
		"toHaveHeaders",
		"toHaveCells",
		"toBeSortedBy",
	]);

	await page.goto("/combined-span-table");
	const table = defineTable(page.locator("table"), { headers: ["Region", "Q1", "Q2", "Q3", "Q4"] });

	await expect(table.row({ Region: "South" }).cell("Q2")).toHaveText("Combined N+S Q1-Q2");
	await expect(table.row({ Q4: { predicate: text => Number(text) > 700 } }).cell("Region")).toHaveText("East");
	await expect(table).toHaveRow({ Region: /^nor/i });
	await expect(table).toHaveHeaders(["Region", "Q4"]);
	await expect(table.row({ Region: "East" })).toHaveCells({ Q1: "500", Q2: { not: { empty: true } } });
	expect(await table.headerKeys()).toEqual(["Region", "Q1", "Q2", "Q3", "Q4"]);
	await expect(table).toHaveRows([{ Region: "North" }, { Region: "South", Q3: "350" }, { Region: "East" }]);
	await expect(table.row({ Region: "South" }).cell(3)).toHaveText("350");
	await expect(table.rows.last().cell("Q4")).toHaveText("800");
	expect((await table.toJson())[1]).toEqual({
		Region: "South",
		Q1: "Combined N+S Q1-Q2",
		Q2: "Combined N+S Q1-Q2",
		Q3: "350",
		Q4: "450",
	});

	await page.goto("/aria-grid-table");
	const grid = defineTable(page.locator("#Grid"), { aria: true });
	await expect(grid.row({ Id: "2" }).cell("Name")).toHaveText("Jane");
	await expect(grid.column("Id")).toHaveText(["1", "2", "3"]);

	await page.goto("/row-header-table");
	await expect(defineTable(page.locator("#RowHeaderTable"))).toHaveRowCount(2);

	await page.goto("/sortable-table");
	const sortable = defineTable(page.locator("#SortableTable"));
	await sortable.header("Salary").click();
	await expect(sortable).toBeSortedBy("Salary", { type: "number", ariaSort: true });
});
