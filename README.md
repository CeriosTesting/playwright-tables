# 🎭 Playwright Tables | By Cerios

## Introduction

Testing HTML tables can be challenging due to their structure. This package simplifies the process by parsing HTML tables into JSON objects based on headers and rows, making it easier to assert table data in your tests.

---

## Installation

First, install and familiarize yourself with the Playwright testing library:  
[Playwright Documentation](https://github.com/microsoft/playwright/blob/main/README.md)

Then, install this package:

```bash
npm i @cerios/playwright-table
```

Or as Dev dependency

```bash
npm i -D @cerios/playwright-table
```

---

## Usage

### Basic Setup

To use the package, create a new `PlaywrightTable` instance by passing a locator for the table element:

```ts
const table = new PlaywrightTable(page.locator("table"));
```

By default, the following selectors are used:

- Header rows: `thead > tr`
- Header cells: `th`
- Body rows: `tbody > tr`
- Body cells: `td`

---

## Methods and Examples

### 1. `getHeaderRows`

Retrieves all header rows of the table. Works with colspan and rowspan. Every extra colspan of the same cell gets a counting postfix \_\_C

#### Example:

HTML Table:

<table>
  <thead>
    <tr>
      <th rowspan="2">Awesome</th>
      <th>First Name</th>
      <th>Last Name</th>
    </tr>
    <tr>
    <th colspan="2" style="text-align: center;">Full Name</th>
    </tr>
  </thead>
</table>

Code:

```ts
const headers = await table.getHeaderRows();
console.log(headers);
```

Output:

```json
[
	["Awesome", "First Name", "Last Name"],
	["Awesome", "Full Name", "Full Name__C1"]
]
```

---

### 2. `getMainHeaderRow`

Retrieves the main header row (default is the last row).

#### Example:

HTML Table:

<table>
  <thead>
    <tr>
      <th colspan="2">Full Name</th>
    </tr>
    <tr>
      <th>First Name</th>
      <th>Last Name</th>
    </tr>
  </thead>
</table>

Code:

```ts
const mainHeader = await table.getMainHeaderRow();
console.log(mainHeader);
// Output: ["First Name", "Last Name"]
```

---

### 3. `getBodyRows`

Retrieves all body rows of the table.

#### Example:

HTML Table:

<table>
  <tbody>
    <tr>
      <td>Ronald</td>
      <td>Veth</td>
    </tr>
    <tr>
      <td>Logan</td>
      <td>Deacon</td>
    </tr>
  </tbody>
</table>

Code:

```ts
const rows = await table.getBodyRows();
console.log(rows);
// Output: [["Ronald", "Veth"], ["Logan", "Deacon"]]
```

---

### 4. `getBodyCellLocator`

Retrieves a specific cell locator in the body of the table.

#### Example:

HTML Table:

<table>
  <tbody>
    <tr>
      <td>Ronald</td>
      <td>Veth</td>
    </tr>
    <tr>
      <td>Principal</td>
      <td>Cerios</td>
    </tr>
  </tbody>
</table>

Code:

```ts
const cellLocator = table.getBodyCellLocator(1, 1);
await expect(cellLocator).toHaveText("Cerios");
```

---

### 5. `getBodyCellLocatorByRowConditions`

Retrieves a cell locator in the body of the table based on row conditions and a target header.

#### Example:

HTML Table:

<table>
  <thead>
    <tr>
      <th>First Name</th>
      <th>Last Name</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Ronald</td>
      <td>Veth</td>
    </tr>
    <tr>
      <td>Principal</td>
      <td>Cerios</td>
    </tr>
  </tbody>
</table>

Code:

```ts
const cellLocator = await table.getBodyCellLocatorByRowConditions({ "First Name": "Principal" }, "Last Name");
await expect(cellLocator).toHaveText("Cerios");
```

---

### 6. `getAllBodyCellLocatorsByHeaderName`

Retrieves all cell locators in the body of the table for a specific header name.

#### Example:

HTML Table:

<table>
  <thead>
    <tr>
      <th>First Name</th>
      <th>Last Name</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Ronald</td>
      <td>Veth</td>
    </tr>
    <tr>
      <td>Principal</td>
      <td>Cerios</td>
    </tr>
  </tbody>
</table>

Code:

```ts
const locators = await table.getAllBodyCellLocatorsByHeaderName("Last Name");
for (const locator of locators) {
	console.log(await locator.textContent());
	// Output: ["Veth", "Cerios"]
}
```

---

### 7. `getAllBodyCellLocatorsByHeaderIndex`

Retrieves all cell locators in the body of the table for a specific header index.

#### Example:

HTML Table:

<table>
  <thead>
    <tr>
      <th>First Name</th>
      <th>Last Name</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Ronald</td>
      <td>Veth</td>
    </tr>
    <tr>
      <td>Principal</td>
      <td>Cerios</td>
    </tr>
  </tbody>
</table>

Code:

```ts
const locators = await table.getAllBodyCellLocatorsByHeaderIndex(1);
for (const locator of locators) {
	console.log(await locator.textContent());
	// Output: ["Veth", "Cerios"]
}
```

---

### 8. `getJson`

Converts the table data into a JSON object.

#### Example:

HTML Table **SIMPLE**:

<table>
  <thead>
    <tr>
      <th>id</th>
      <th>name</th>
      <th>yearOfBirth</th>
    </tr>
  </thead>
  <tbody>
    <tr>
        <td>1</td>
        <td>Ronald</td>
        <td>1987</td>
    </tr>
    <tr>
        <td>2</td>
        <td>Cerios</td>
        <td>2022</td>
    </tr>
  </tbody>
</table>

Code:

```ts
const json = await table.getJson();
console.log(json);
```

Output:

```json
[
	{
		"id": 1,
		"name": "Ronald",
		"yearOfBirth": 1987
	},
	{
		"id": 2,
		"name": "Cerios",
		"yearOfBirth": 2022
	}
]
```

#### Example:

HTML Table **COMPLEX**:

<table>
  <thead>
    <tr>
      <th rowspan="2">Awesome Rowspan</th>
      <th>Very Duplicate</th>
      <th colspan="3">Mega colspan</th>
      <th></th>
      <th></th>
      <th>Very Duplicate</th>
    </tr>
  </thead>
  <tbody>
    <tr>
        <td></td>
        <td>Ronald</td>
        <td>Veth</td>
        <td>Test</td>
        <td>Automator</td>
        <td>At</td>
        <td>Cerios</td>
        <td>!</td>
    </tr>
  </tbody>
</table>

Code:

```ts
const json = await table.getJson();
console.log(json);
```

Output:

```json
[
	{
		"Awesome Rowspan": "",
		"Very Duplicate": "Ronald",
		"Mega colspan": "Veth",
		"Mega colspan__C1": "Test",
		"Mega colspan__C2": "Automator",
		"{{Empty}}": "At",
		"{{Empty}}__D1": "Cerios",
		"Very Duplicate__D1": "!"
	}
]
```

---

### 9. `waitForHeaderRows`

Waits for the header rows to be loaded.

#### Example:

```ts
await table.waitForHeaderRows({ timeout: 5000 });
```

---

### 10. `waitForBodyRows`

Waits for the body rows to be loaded.

#### Example:

```ts
await table.waitForBodyRows({ timeout: 5000 });
```

---

## Advanced Options

You can customize the behavior of the table parsing by passing options to the `PlaywrightTable` constructor. For example:

```ts
const table = new PlaywrightTable(page.locator("table"), {
	header: {
		rowSelector: ".custom-header-row",
		columnSelector: ".custom-header-cell",
	},
	row: {
		rowSelector: ".custom-body-row",
		columnSelector: ".custom-body-cell",
	},
});
```

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
