import { expect, Locator } from "@playwright/test";
import { TableBody } from "./table-body";
import { BodyRow, Cell, HeaderRow } from "./row";
import { HeaderRowsOptions, TableHeader } from "./table-header";

export class Table {
	private _headers: HeaderRow[] = [];
	private _rows: BodyRow[] = [];
	private _bodyRowLocator: Locator;
	private _bodyRowColumnSelector: string;
	private _headerRowLocator: Locator;
	private _headerColumnSelector: string;

	constructor(
		private readonly _tableLocator: Locator,
		private readonly _options?: {
			header?: {
				setMainHeaderRow?: number;
				rowSelector?: string;
				columnSelector?: string;
			};
			row?: {
				rowSelector?: string;
				columnSelector?: string;
			};
		}
	) {
		this._headerRowLocator = this._tableLocator.locator(this._options?.header?.rowSelector ?? "thead>tr");
		this._headerColumnSelector = this._options?.header?.columnSelector ?? "th";
		this._bodyRowLocator = this._tableLocator.locator(this._options?.row?.rowSelector ?? "tbody>tr");
		this._bodyRowColumnSelector = this._options?.row?.columnSelector ?? "td";
	}

	async getHeaderRows(options?: {
		timeout?: number;
		duplicateSuffix?: boolean;
		headerRowsOptions?: HeaderRowsOptions;
	}): Promise<HeaderRow[]> {
		await this.load(options);
		return this._headers;
	}

	async getMainHeaderRow(options?: {
		timeout?: number;
		duplicateSuffix?: boolean;
		headerRowsOptions?: HeaderRowsOptions;
	}): Promise<string[]> {
		const headerRows = await this.getHeaderRows(options);
		const headers = this._options?.header?.setMainHeaderRow
			? headerRows[this._options.header.setMainHeaderRow]
			: headerRows[this._headers.length - 1];
		return headers.map(header => header);
	}

	async getBodyRows(options?: { timeout?: number }): Promise<BodyRow[]> {
		await this.load({ ...options, headerRowsOptions: { colspan: { enabled: true } } });
		return this._rows;
	}

	getBodyCellLocator(rowNumber: number, headerPosition: number): Locator {
		return this._bodyRowLocator.nth(rowNumber).locator(this._bodyRowColumnSelector).nth(headerPosition);
	}

	async getBodyCellLocatorByRowConditions(
		conditions: Record<string, string>,
		targetHeader: string,
		options?: { timeout?: number; duplicateSuffix?: boolean; colspanEnabled?: boolean }
	): Promise<Locator> {
		await this.load(options);
		const headers = await this.getMainHeaderRow();

		const targetHeaderIndex = headers.indexOf(targetHeader);
		if (targetHeaderIndex === -1) {
			throw new Error(`Header "${targetHeader}" not found.`);
		}

		for (let rowIndex = 0; rowIndex < this._rows.length; rowIndex++) {
			const row = this._rows[rowIndex];
			let matches = true;

			for (const [header, value] of Object.entries(conditions)) {
				const headerIndex = headers.indexOf(header);
				if (headerIndex === -1) {
					throw new Error(`Header "${header}" not found.`);
				}
				if (row[headerIndex] !== value) {
					matches = false;
					break;
				}
			}

			if (matches) {
				return this.getBodyCellLocator(rowIndex, targetHeaderIndex);
			}
		}

		throw new Error(`No row found matching conditions: ${JSON.stringify(conditions)}`);
	}

	async getAllBodyCellLocatorsByHeaderName(header: string, options?: { timeout?: number }): Promise<Locator[]> {
		await this.load(options);
		const headers = await this.getMainHeaderRow();
		const headerIndex = headers.indexOf(header);
		if (headerIndex === -1) {
			throw new Error(`Header "${header}" not found.`);
		}
		const locators: Locator[] = [];
		for (let rowIndex = 0; rowIndex < this._rows.length; rowIndex++) {
			const cellLocator = this.getBodyCellLocator(rowIndex, headerIndex);
			locators.push(cellLocator);
		}
		return locators;
	}

	async getAllBodyCellLocatorsByHeaderIndex(headerIndex: number): Promise<Locator[]> {
		await this.load();
		const locators: Locator[] = [];
		for (let rowIndex = 0; rowIndex < this._rows.length; rowIndex++) {
			const cellLocator = this.getBodyCellLocator(rowIndex, headerIndex);
			locators.push(cellLocator);
		}
		return locators;
	}

	async getJson(options?: { timeout?: number }): Promise<any> {
		await this.load({ ...options, headerRowsOptions: { colspan: { enabled: true, suffix: true } } });
		const headers = await this.getMainHeaderRow({
			duplicateSuffix: true,
			headerRowsOptions: { colspan: { enabled: true } },
		});
		return this._rows.map(row => {
			const rowObj: Record<string, Cell> = {};
			headers.forEach((header, index) => {
				rowObj[header] = row[index] || "";
			});
			return rowObj;
		});
	}

	async waitForHeaderRows(options?: {
		timeout?: number;
		row?: {
			amount?: number;
			cell?: {
				totalCount?: number;
				contentCount?: number;
			};
		};
	}): Promise<void> {
		const checkIfAnyCellWithContent = async (): Promise<void> => {
			const headerCells = await this._headerRowLocator.locator(this._headerColumnSelector).all();
			const headerCellsWithContent = (
				await Promise.all(
					headerCells.map(async cell => {
						const content = await cell.textContent();
						return content !== null && content.trim() !== "" ? cell : null;
					})
				)
			).filter(cell => cell !== null);
			expect(headerCellsWithContent.length, "No header cells with content found").toBeGreaterThan(0);
		};

		await expect(async () => {
			const headerRows = await this._headerRowLocator.all();
			if (options?.row) {
				if (options?.row.amount) {
					expect(headerRows.length, `Expected ${options.row.amount} header rows, but found ${headerRows.length}`).toBe(
						options.row.amount
					);
				} else {
					expect(headerRows.length, "No header rows found").toBeGreaterThan(0);
				}

				if (options?.row.cell) {
					if (options.row.cell.totalCount) {
						const rowsWithAmountOfCells = (
							await Promise.all(
								headerRows.map(async row => {
									const cellCount = await row.locator(this._headerColumnSelector).count();
									return cellCount === options.row?.cell?.totalCount ? row : null;
								})
							)
						).filter(row => row !== null);
						expect(
							rowsWithAmountOfCells.length,
							`Expected amount of ${options.row.cell.totalCount} header cells for row not found`
						).toBeGreaterThan(0);
					}
					if (options.row.cell.contentCount) {
						const rowsWithAmountOfCells = (
							await Promise.all(
								headerRows.map(async row => {
									const cellCount = await row.locator(this._headerColumnSelector).count();
									return cellCount >= options.row!.cell!.contentCount! ? row : null;
								})
							)
						).filter(row => row !== null);
						const rowWithAmountOfCellsAndContent = (
							await Promise.all(
								rowsWithAmountOfCells.map(async row => {
									const cells = await row.locator(this._headerColumnSelector).all();
									const cellsContent = await Promise.all(cells.map(cell => cell.textContent()));
									const cellsWithContent = cellsContent.filter(cell => cell !== null && cell.trim() !== "");
									return cellsWithContent.length === options.row!.cell!.contentCount! ? row : null;
								})
							)
						).filter(row => row !== null);
						expect(
							rowWithAmountOfCellsAndContent.length,
							`Expected amount of ${options.row.cell.contentCount} header cells with content for row not found`
						).toBeGreaterThan(0);
					} else {
						await checkIfAnyCellWithContent();
					}
				} else {
					await checkIfAnyCellWithContent();
				}
			} else {
				await checkIfAnyCellWithContent();
			}
		}).toPass({ timeout: options?.timeout });
	}

	private async load(options?: { timeout?: number; headerRowsOptions?: HeaderRowsOptions }): Promise<void> {
		const timeout = options?.timeout ?? 30_000;

		await expect(async () => {
			const headerElements = await this._headerRowLocator.locator(this._headerColumnSelector).elementHandles();
			const headers = await Promise.all(headerElements.map(x => x.textContent()));
			expect(headers.length, "No header cells found. Please check locators").toBeGreaterThan(0);
			expect(
				headers.some(x => x !== null && x.trim() !== ""),
				"No content found for header cells"
			).toBe(true);

			const bodyElements = await this._bodyRowLocator.locator(this._bodyRowColumnSelector).elementHandles();
			const bodyCells = await Promise.all(bodyElements.map(x => x.textContent()));
			expect(bodyCells.length, "No body cells found. Please check locators").toBeGreaterThan(0);
			expect(
				bodyCells.some(x => x !== null && x.trim() !== ""),
				"No content found for body cells"
			).toBe(true);
		}).toPass({ timeout });

		this._headers = await TableHeader.getHeaderRows(
			this._headerRowLocator,
			this._headerColumnSelector,
			options?.headerRowsOptions
		);
		this._rows = await TableBody.getRows(this._bodyRowLocator, this._bodyRowColumnSelector);
	}
}
