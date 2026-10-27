import { Page } from "@playwright/test";
import { defineTable, expect, test } from "src";

async function errorMessage(action: () => Promise<unknown>): Promise<string> {
	try {
		await action();
	} catch (error) {
		// Strip ANSI colors from matcher messages
		const ansiColor = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
		return (error instanceof Error ? error.message : String(error)).replace(ansiColor, "");
	}
	throw new Error("Expected the action to fail");
}

const usersTable = `
	<table id="users">
		<thead><tr><th>Name</th><th>Status</th></tr></thead>
		<tbody>
			<tr><td>John</td><td>Active</td></tr>
			<tr><td>Jane</td><td>Inactive</td></tr>
		</tbody>
	</table>
`;

/**
 * A table paged by a script: `pages` are the rows per page, each row its cells. The pager is shown above
 * and below the table, Bootstrap style: on the last page, `li.disabled` wraps the link. With `delay`, a
 * page loads that many milliseconds after a click, and the first page too, behind a spinner.
 */
async function openPaged(
	page: Page,
	pages: string[][][],
	options: { header?: string[]; delay?: number; rowAttributes?: (page: number, row: number) => string } = {}
): Promise<void> {
	const pager = `<ul class="pagination"><li class="page-item"><a href="#" class="page-link next">Next</a></li></ul>`;
	await page.setContent(`
		${pager}
		<div id="spinner" hidden>Loading…</div>
		<table id="paged">
			${options.header === undefined ? "" : `<thead><tr>${options.header.map(h => `<th>${h}</th>`).join("")}</tr></thead>`}
			<tbody></tbody>
		</table>
		${pager}
		<script>
			// In a function: setContent keeps the global scope, so the page can be opened again
			(() => {
			const pages = ${JSON.stringify(pages)};
			const attributes = ${JSON.stringify(pages.map((rows, p) => rows.map((_row, r) => options.rowAttributes?.(p, r) ?? "")))};
			const delay = ${options.delay ?? 0};
			let current = 0;
			function render() {
				document.querySelector("tbody").innerHTML = pages[current]
					.map((cells, r) => "<tr " + attributes[current][r] + ">" + cells.map(c => "<td>" + c + "</td>").join("") + "</tr>")
					.join("");
				for (const item of document.querySelectorAll(".page-item")) {
					item.classList.toggle("disabled", current === pages.length - 1);
				}
			}
			function load(page) {
				const spinner = document.getElementById("spinner");
				if (delay === 0) { current = page; render(); return; }
				spinner.hidden = false;
				document.querySelector("tbody").innerHTML = "";
				setTimeout(() => { current = page; render(); spinner.hidden = true; }, delay);
			}
			for (const link of document.querySelectorAll(".next")) {
				link.addEventListener("click", event => {
					event.preventDefault();
					if (current < pages.length - 1) load(current + 1);
				});
			}
			load(0);
			})();
		</script>
	`);
}

test.describe("reading every row", () => {
	test("identical rows are all read, on one page and across pages", async ({ page }) => {
		const pages = [
			[
				["Widget", "1"],
				["Widget", "1"],
				["Gadget", "2"],
			],
			[
				["Widget", "1"],
				["Bolt", "3"],
			],
		];
		await openPaged(page, pages, { header: ["Item", "Qty"] });
		const items = defineTable(page.locator("#paged"), { paginate: { next: page.locator(".next") } });

		const rows = await items.toJson({ allRows: true });
		expect(rows.map(row => row.Item)).toEqual(["Widget", "Widget", "Gadget", "Widget", "Bolt"]);
		// Without `paginate.first`, reading starts at the page in view, and the table was left on the last page
		expect(await items.totalRowCount()).toBe(2);
		await openPaged(page, pages, { header: ["Item", "Qty"] });
		expect(await items.totalRowCount()).toBe(5);
	});

	test("rows keep the order they are shown in when their key is an id", async ({ page }) => {
		await openPaged(page, [[["Zed"], ["Amy"], ["Max"]]], {
			header: ["Name"],
			rowAttributes: (_page, row) => `data-id="${[1042, 17, 803][row]}"`,
		});
		const users = defineTable(page.locator("#paged"), { paginate: { next: page.locator(".next") } });

		const rows = await users.toJson({ allRows: true });
		expect(rows.map(row => row.Name)).toEqual(["Zed", "Amy", "Max"]);
	});

	test("a table without header rows changes pages and counts every row", async ({ page }) => {
		await openPaged(page, [
			[["a1"], ["a2"]],
			[["b1"], ["b2"]],
			[["c1"], ["c2"]],
		]);
		const plain = defineTable(page.locator("#paged"), { paginate: { next: page.locator(".next") } });

		expect(await plain.totalRowCount()).toBe(6);
		expect(await plain.format()).toBe("  # | 0\n  0 | c1\n  1 | c2\n");
	});

	test("waits for a slow first page, and skips the empty table while the next page loads", async ({ page }) => {
		await openPaged(
			page,
			[
				[["1"], ["2"]],
				[["3"], ["4"]],
			],
			{ header: ["Id"], delay: 400 }
		);
		const slow = defineTable(page.locator("#paged"), {
			paginate: { next: page.locator(".next") },
			loading: page.locator("#spinner"),
		});

		const row = await slow.findRow({ Id: "4" }, { timeout: 10_000 });
		await expect(row.locator).toHaveText("4");
	});

	test("reads every row of a paged table without a loading indicator", async ({ page }) => {
		await openPaged(page, [[["1"], ["2"]], [["3"], ["4"]], [["5"]]], { header: ["Id"], delay: 300 });
		const slow = defineTable(page.locator("#paged"), { paginate: { next: page.locator(".next") } });
		await expect(slow).toHaveRow({ Id: "1" });

		const rows = await slow.toJson({ allRows: true, timeout: 10_000 });
		expect(rows.map(row => row.Id)).toEqual(["1", "2", "3", "4", "5"]);
	});

	test("scrolls a grid with smooth scrolling to the bottom", async ({ page }) => {
		await page.setContent(`
			<style>
				#viewport { height: 200px; overflow: auto; scroll-behavior: smooth; }
				#spacer { position: relative; height: 2000px; }
				tr { position: absolute; height: 20px; }
			</style>
			<table id="grid">
				<thead><tr style="position: static"><th>Id</th></tr></thead>
			</table>
			<div id="viewport"><div id="spacer"><table><tbody id="rows"></tbody></table></div></div>
			<script>
				const viewport = document.getElementById("viewport");
				function render() {
					const first = Math.floor(viewport.scrollTop / 20);
					let html = "";
					for (let i = first; i < Math.min(100, first + 11); i++) {
						html += '<tr data-index="' + i + '" style="top: ' + i * 20 + 'px"><td>' + (i + 1) + "</td></tr>";
					}
					document.getElementById("rows").innerHTML = html;
				}
				viewport.addEventListener("scroll", render);
				render();
			</script>
		`);
		const grid = defineTable(page.locator("body"), {
			header: { rowSelector: "#grid thead tr" },
			row: { rowSelector: "#rows tr" },
			scroll: { container: page.locator("#viewport") },
		});

		const rows = await grid.toJson({ allRows: true });
		expect(rows.map(row => row.Id)).toEqual(Array.from({ length: 100 }, (_value, i) => String(i + 1)));
	});
});

test.describe("row interactions", () => {
	const selectionTable = `
		<table id="people">
			<thead><tr><th><input type="checkbox" aria-label="Select all" /></th><th>Name</th><th>Active</th></tr></thead>
			<tbody>
				<tr><td><input type="checkbox" aria-label="Select John" /></td><td>John</td><td><input type="checkbox" aria-label="Active" checked /></td></tr>
				<tr><td><input type="checkbox" aria-label="Select Jane" /></td><td>Jane</td><td><input type="checkbox" aria-label="Active" /></td></tr>
			</tbody>
		</table>
	`;

	test("select uses the checkbox of the selection column, not a data checkbox", async ({ page }) => {
		await page.setContent(selectionTable);
		const people = defineTable(page.locator("#people"), { headers: ["Name", "Active"] });
		const john = people.row({ Name: "John" });

		// "Active" is checked, but it is data: John is not selected
		expect(await john.isSelected()).toBe(false);
		await expect(john).not.toBeSelected();
		await people.row({ Name: "Jane" }).select();
		await expect(page.getByLabel("Select Jane")).toBeChecked();
		await expect(people.row({ Name: "Jane" }).cell("Active").getByRole("checkbox")).not.toBeChecked();
		await john.select();
		await john.deselect();
		await expect(page.getByLabel("Select John")).not.toBeChecked();
		await expect(john.cell("Active").getByRole("checkbox")).toBeChecked();
	});

	test("a row that is selected by clicking it ignores its data checkbox", async ({ page }) => {
		await page.setContent(`
			<div role="grid" id="tasks">
				<div role="row"><span role="columnheader">Task</span><span role="columnheader">Done</span></div>
				<div role="row" aria-selected="false" onclick="this.setAttribute('aria-selected', String(this.getAttribute('aria-selected') !== 'true'))">
					<span role="gridcell">Write</span>
					<span role="gridcell"><input type="checkbox" aria-label="Done" checked onclick="event.stopPropagation()" /></span>
				</div>
			</div>
		`);
		const tasks = defineTable(page.locator("#tasks"), { aria: true });
		const write = tasks.row({ Task: "Write" });

		expect(await write.isSelected()).toBe(false);
		await write.select();
		await expect(write).toBeSelected();
		await expect(page.getByLabel("Done")).toBeChecked();
		await write.deselect();
		await expect(write).not.toBeSelected();
		await expect(page.getByLabel("Done")).toBeChecked();
	});

	test("the select option sets the control that selects a row", async ({ page }) => {
		await page.setContent(selectionTable);
		const people = defineTable(page.locator("#people"), {
			headers: ["Name", "Active"],
			select: row => row.getByRole("checkbox", { name: /^Select/ }),
		});

		await people.row({ Name: "John" }).select();
		await expect(people.row({ Name: "John" })).toBeSelected();
		await expect(page.getByLabel("Select John")).toBeChecked();
	});

	test("expand never clicks other buttons in the row, and ignores menu buttons", async ({ page }) => {
		await page.setContent(`
			<div role="treegrid" id="files">
				<div role="row"><span role="columnheader">Name</span><span role="columnheader">Actions</span></div>
				<div role="row" aria-expanded="false" tabindex="-1" id="src">
					<span role="gridcell">src</span>
					<span role="gridcell">
						<button aria-haspopup="menu" aria-expanded="false" onclick="this.setAttribute('aria-expanded', 'true')">More</button>
						<button onclick="this.closest('[role=row]').remove()">Delete</button>
					</span>
				</div>
			</div>
			<script>
				document.getElementById("src").addEventListener("keydown", event => {
					if (event.key === "ArrowRight") event.currentTarget.setAttribute("aria-expanded", "true");
					if (event.key === "ArrowLeft") event.currentTarget.setAttribute("aria-expanded", "false");
				});
			</script>
		`);
		const files = defineTable(page.locator("#files"), { aria: true });
		const src = files.row({ Name: "src" });

		await src.expand({ timeout: 2_000 });
		await expect(src).toBeExpanded();
		await expect(page.getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "false");
		await src.collapse({ timeout: 2_000 });
		await expect(src).not.toBeExpanded();
	});

	test("a toggle that is not found is an error, not a key press", async ({ page }) => {
		await page.setContent(`
			<div role="treegrid" id="files">
				<div role="row"><span role="columnheader">Name</span></div>
				<div role="row" aria-expanded="false" tabindex="-1"><span role="gridcell">src</span></div>
			</div>
		`);
		const files = defineTable(page.locator("#files"), { aria: true });

		const message = await errorMessage(() =>
			files.row({ Name: "src" }).expand({ toggle: row => row.getByRole("button", { name: "Open" }), timeout: 500 })
		);
		expect(message).toContain("TableRow: the toggle of the row was not found.");
	});
});

test.describe("large tables", () => {
	test("unordered matching of thousands of overlapping entries", async ({ page }) => {
		const count = 3_000;
		await page.setContent(`
			<table id="big"><thead><tr><th>Id</th><th>Status</th></tr></thead><tbody></tbody></table>
			<script>
				let html = "";
				for (let i = 0; i < ${count}; i++) html += "<tr><td>" + i + "</td><td>Active</td></tr>";
				document.querySelector("tbody").innerHTML = html;
			</script>
		`);
		const big = defineTable(page.locator("#big"), { headers: ["Id", "Status"] });

		// Every entry matches every row, except the last, which needs row 0: the greedy pass gives row 0
		// away, so the search has to move an entry to another row.
		const entries = [...Array.from({ length: count - 1 }, () => ({ Status: "Active" })), { Id: "0" }];
		await expect(big).toContainRows(entries, { timeout: 10_000 });
		await expect(big).toHaveRows(entries, { anyOrder: true, timeout: 10_000 });
		await expect(big).not.toContainRows([...entries, { Status: "Active" }], { timeout: 2_000 });
	});
});

test.describe("reading text", () => {
	test("header keys have the text-transform of the header, also while the table is hidden", async ({ page }) => {
		await page.setContent(`
			<div id="tab">
				<table id="t"><thead><tr><th style="text-transform: uppercase">Name</th></tr></thead>
				<tbody><tr><td>John</td></tr></tbody></table>
			</div>
		`);
		const table = defineTable(page.locator("#t"));

		expect(await table.headerKeys()).toEqual(["NAME"]);
		await page.locator("#tab").evaluate(tab => (tab.style.display = "none"));
		expect(await table.headerKeys()).toEqual(["NAME"]);
	});
});

test.describe("negated matchers", () => {
	test("a predicate that throws makes .not fail instead of pass", async ({ page }) => {
		await page.setContent(usersTable);
		const users = defineTable(page.locator("#users"), { headers: ["Name", "Status"] });
		const minLength = 3;
		// Uses a variable from the test, which does not exist in the browser.
		const broken = { predicate: (text: string) => text.length > minLength };
		const options = { timeout: 500 };

		const row = await errorMessage(() => expect(users).not.toHaveRow({ Name: broken }, options));
		expect(row).toContain("Received: a table that cannot be checked");
		expect(row).toContain('Predicate for "Name" threw ReferenceError');

		const cells = await errorMessage(() => expect(users.rowAt(0)).not.toHaveCells({ Name: broken }, options));
		expect(cells).toContain("Received: a table that cannot be checked");

		const rows = await errorMessage(() => expect(users).not.toHaveRows([{ Name: broken }, {}], options));
		expect(rows).toContain("Received: a table that cannot be checked");

		const contain = await errorMessage(() => expect(users).not.toContainRows([{ Name: broken }], options));
		expect(contain).toContain("Received: a table that cannot be checked");

		const every = await errorMessage(() => expect(users).not.toHaveEveryRow({ Name: broken }, options));
		expect(every).toContain("Received: a table that cannot be checked");

		const values = await errorMessage(() => expect(users).not.toHaveColumnValues("Name", [broken, broken], options));
		expect(values).toContain("Received: a table that cannot be checked");
	});

	test("not.toHaveHeaders and not.toHaveRowCount fail on a table that is not there", async ({ page }) => {
		await page.setContent(usersTable);
		const missing = defineTable(page.locator("#missing"));

		const headers = await errorMessage(() => expect(missing).not.toHaveHeaders(["Id"], { timeout: 300 }));
		expect(headers).toContain("Received: the table could not be read");
		const count = await errorMessage(() => expect(missing).not.toHaveRowCount(3, { timeout: 300 }));
		expect(count).toContain("Received: the table is not attached");
		const users = defineTable(page.locator("#users"));
		await expect(users).not.toHaveRowCount(3);
	});
});

test.describe("timeouts and arguments", () => {
	test("timeout 0 reads once, and an invalid timeout is an error", async ({ page }) => {
		await page.setContent(usersTable);
		const users = defineTable(page.locator("#users"));

		await expect(users).toHaveRowCount(2, { timeout: 0 });
		const started = Date.now();
		await errorMessage(() => expect(users).toHaveRowCount(3, { timeout: 0 }));
		// Not "no timeout", which would wait for the test timeout
		expect(Date.now() - started).toBeLessThan(8_000);
		await expect(users.waitForStable({ timeout: NaN })).rejects.toThrow(
			"timeout must be a non-negative number of milliseconds, got: NaN"
		);
		await expect(users.toJson({ minRows: 1, timeout: -1 })).rejects.toThrow("timeout must be a non-negative number");
		await expect(expect(users).toHaveRowCount(-1)).rejects.toThrow(
			"toHaveRowCount() expects a non-negative integer count, got: -1"
		);
	});

	test("a failure on a table that is not there is reported soon after the timeout", async ({ page }) => {
		await page.setContent(usersTable);
		const missing = defineTable(page.locator("#missing"));
		const started = Date.now();

		const message = await errorMessage(() => expect(missing).toHaveRow({ Name: "John" }, { timeout: 500 }));
		expect(message).toContain("Expected: a row matching");
		// The timeout, plus at most the short reads that describe the failure (no 5s read for the attachment)
		expect(Date.now() - started).toBeLessThan(5_500);
	});

	test("toBeSortedBy fails at once when compare throws", async ({ page }) => {
		await page.setContent(usersTable);
		const users = defineTable(page.locator("#users"));
		const started = Date.now();

		const message = await errorMessage(() =>
			expect(users).toBeSortedBy("Name", {
				compare: () => {
					throw new Error("bad compare");
				},
				timeout: 5_000,
			})
		);
		expect(message).toContain("Received: compare threw Error: bad compare");
		expect(Date.now() - started).toBeLessThan(4_000);
	});

	test("findRow fails at once on an unknown header", async ({ page }) => {
		await page.setContent(usersTable);
		const users = defineTable(page.locator("#users"));
		const started = Date.now();

		const message = await errorMessage(() => users.findRow({ Nme: "John" }, { timeout: 1_000 }));
		expect(message).toContain('TableLocator.findRow() cannot match { "Nme": "John" }.');
		expect(message).toContain('Header "Nme" not found.');
		expect(message).toContain("Available headers: [Name, Status]");
		expect(Date.now() - started).toBeLessThan(3_000);
	});

	test("toJson waits within one timeout for minRows and stable", async ({ page }) => {
		await page.setContent(`
			${usersTable}
			<script>
				// Changes for ever, so it never becomes stable
				setInterval(() => { document.querySelector("td").textContent = String(Math.random()); }, 50);
			</script>
		`);
		const users = defineTable(page.locator("#users"));
		const started = Date.now();

		await expect(users.toJson({ minRows: 1, stable: { timeout: 5_000 }, timeout: 1_000 })).rejects.toThrow(
			"waitForStable() timed out"
		);
		expect(Date.now() - started).toBeLessThan(2_500);
	});
});
