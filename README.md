<h1>
🎭 Playwright Tables
<picture>
  <source srcset="cerios-logo-seasalt.svg" media="(prefers-color-scheme: dark)">
  <img src="cerios-logo-spacecadet.svg" alt="cerios logo">
</picture>
</h1>

## Introduction

It is always hard to test HTML Tables. You will need multiple selectors/locators to get the data you need. This package will make it easy for you and parse it to a json based on the given headers and objects for each row of the table. Now you can assert the objects to your liking.

Given the following HTML

| id  |  name  | yearOfBirth |
| :-: | :----: | :---------: |
|  1  | Ronald |    1987     |
|  2  | Cerios |    2022     |

The result JSON will become:

```
[
    {
        id: 1,
        name: "Ronald",
        yearOfBirth: 1987
    },
    {
        id: 2,
        name: "Cerios",
        yearOfBirth: 2022
    },
]
```

## Installation

First you need to install and get firmiliar with the amazing playwright testing library:
https://github.com/microsoft/playwright/blob/main/README.md

```
npx i -D @cerios/playwright-tables
```

## Usage

There can be more tables on a webpage. So you first need to identify the unique locator that wraps you complete table element.

Create a new PlaywrightTable

```
const table = new PlaywrightTable(page.locator("table"));
```

Without extra options the defaults for header rows(thead>tr), header cells(thead), body rows(tbody/tr) and body cells(td) will be used.
Now you can call the following methods:

- getHeaderRows
- getMainHeaderRow (default last)
- getBodyRows
- getBodyCellLocator
- getBodyCellLocatorByRowConditions
- getAllBodyCellLocatorsByHeaderName
- getAllBodyCellLocatorsByHeaderIndex
- getJson
- waitForHeaderRows
- waitForBodyRows

More information will be provided soon. Check the unit tests for inspiration...
