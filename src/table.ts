import { Locator } from "@playwright/test";
import { HeaderIndexer } from "./header-indexer";

export class Table {
  private _headers: string[];
  private _rows: {
    columns: string[];
  }[];

  constructor(
    private readonly _headersLocator: Locator,
    private readonly _rowsLocator: Locator,
    private readonly _columnsSelector: string
  ) {}

  async getHeaders(): Promise<string[]> {
    await this.load();
    return this._headers;
  }

  async getRows(): Promise<{ columns: string[] }[]> {
    await this.load();
    return this._rows;
  }

  async getJson(): Promise<any> {
    await this.load();
    return this._rows.map((row) => {
      const rowObj: Record<string, string> = {};
      this._headers.forEach((header, index) => {
        rowObj[header] = row.columns[index] || "";
      });
      return rowObj;
    });
  }

  private async load(options?: { timeout?: number }): Promise<void> {
    await Promise.all([
      this._headersLocator.last().waitFor({ state: "visible", ...options }),
      this._rowsLocator
        .locator(this._columnsSelector)
        .last()
        .waitFor({ state: "visible", ...options }),
    ]);

    this._headers =
      await HeaderIndexer.HeadersIncludingColspanAndDuplicateAsync(
        this._headersLocator
      );

    this._rows = await this._rowsLocator.evaluateAll(
      (rows, columnsSelector) => {
        return rows.map((row) => {
          const columns = Array.from(row.querySelectorAll(columnsSelector)).map(
            (col) => col.textContent?.trim() || ""
          );
          return { columns };
        });
      },
      this._columnsSelector
    );
  }
}
