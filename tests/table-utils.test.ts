import test, { expect } from "@playwright/test";
import { TableUtils } from "src/table-utils";

test.describe("TableUtils.castContent", () => {
	for (const testcase of [
		{ input: "true", expected: true },
		{ input: " true ", expected: true },
		{ input: "false", expected: false },
		{ input: " false ", expected: false },
		{ input: "123", expected: 123 },
		{ input: " 0 ", expected: 0 },
		{ input: "-1", expected: -1 },
		{ input: "99.99", expected: 99.99 },
		{ input: "abc", expected: "abc" },
		{ input: "", expected: "" },
		{ input: "   ", expected: "" },
	]) {
		test(`castContent '${testcase.input}' should return '${testcase.expected}'`, () => {
			expect(TableUtils.castContent(testcase.input)).toBe(testcase.expected);
		});
	}
});
