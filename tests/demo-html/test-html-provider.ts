export enum TestHtml {
  ButtonTable = "button-table.html",
  ColspanHeaderTable = "colspan-header-table.html",
  ColspanRowTable = "colspan-row-table.html",
  DivTable = "div-table.html",
  DuplicateEmptyHeadersTable = "duplicate-empty-headers-table.html",
  RowspanHeaderTable = "rowspan-header-table.html",
  RowspanRowTable = "rowspan-row-table.html",
  SimpleTable = "simple-table.html",
}

export abstract class TestHtmlProvider {
  static getHtmlFilePath(testHtml: TestHtml): string {
    const path = `${__dirname}/${testHtml}`;
    return path;
  }
}
