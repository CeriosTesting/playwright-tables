/**
 * Represents a single cell value within a table row.
 *
 * @remarks
 * A `Cell` is a string that holds the textual content of a table cell,
 * whether in the header or body of the table.
 */
export type Cell = string;

/**
 * Represents a row in the table body, defined as an array of `Cell` objects.
 *
 * @remarks
 * Each `BodyRow` corresponds to a single row in the table's body section.
 *
 * @see Cell
 */
export type BodyRow = Cell[];

/**
 * Represents a row in the table header, defined as an array of `Cell` objects.
 *
 * @remarks
 * Each `HeaderRow` corresponds to a single row in the table's header section.
 *
 * @see Cell
 */
export type HeaderRow = Cell[];
