import test, { expect } from "@playwright/test";
import { TestHtmlProvider, TestHtml } from "./demo-html/test-html-provider";
import { Table } from "../src/table";

test.describe("Table Tests", () => {
  test("getHeaders returns headers", async ({ page }) => {
    await page.goto(TestHtmlProvider.getHtmlFilePath(TestHtml.SimpleTable));

    const table = new Table(
      page.locator("table>thead>tr>th"),
      page.locator("table>tbody>tr"),
      "td"
    );
    await table.load();

    const headers = table.getHeaders();
    expect(headers).toEqual(["First name", "Last name", "Date of birth"]);
  });

  test("getRows returns rows", async ({ page }) => {
    await page.goto(TestHtmlProvider.getHtmlFilePath(TestHtml.SimpleTable));

    const table = new Table(
      page.locator("table>thead>tr>th"),
      page.locator("table>tbody>tr"),
      "td"
    );
    await table.load();

    const rows = table.getRows();
    expect(rows).toEqual([
      { columns: ["Ronald", "Veth", "22-12-1987"] },
      { columns: ["Logan", "Deacon", "01-10-2002"] },
    ]);
  });

  test("getJson returns json", async ({ page }) => {
    await page.goto(TestHtmlProvider.getHtmlFilePath(TestHtml.SimpleTable));

    const table = new Table(
      page.locator("table>thead>tr>th"),
      page.locator("table>tbody>tr"),
      "td"
    );
    await table.load();

    const json = table.getJson();
    expect(json).toEqual([
      {
        "First name": "Ronald",
        "Last name": "Veth",
        "Date of birth": "22-12-1987",
      },
      {
        "First name": "Logan",
        "Last name": "Deacon",
        "Date of birth": "01-10-2002",
      },
    ]);
  });
});
