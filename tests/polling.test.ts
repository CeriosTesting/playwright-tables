import { errors, expect, test } from "@playwright/test";

import { pollTable, pollUntil } from "../src/polling";

test.describe("toPassWithErrorContext", () => {
	test("should strip Playwright's generic timeout error and preserve custom error message", async () => {
		const errorMessage = "Cell not found in table at row 5";

		try {
			await pollTable(() => Promise.reject(new Error(errorMessage)), { timeout: 500 });
			expect(true).toBe(false);
		} catch (error) {
			const err = error as Error;
			expect(err.message).toContain(errorMessage);
			expect(err.message).not.toMatch(/Timeout \d+ms exceeded while waiting on the predicate/);
			expect(err.message).not.toContain("Call Log");
		}
	});

	test("should preserve multi-line error messages with special characters", async () => {
		const errorMessage = 'Failed to get cell\nLocator: table > tbody > tr\nValue: {"key": "value"}';

		await expect(async () => {
			await pollTable(() => Promise.reject(new Error(errorMessage)), { timeout: 500 });
		}).rejects.toThrow(errorMessage);
	});

	test("should not add context prefix when not provided", async () => {
		try {
			await pollTable(() => Promise.reject(new Error("Error message")), { timeout: 500 });
			expect(true).toBe(false);
		} catch (error) {
			const err = error as Error;
			expect(err.message).not.toContain("[Context:");
		}
	});

	test("should pass when function succeeds", async () => {
		await pollTable(() => Promise.resolve());
	});

	test("should retry until success", async () => {
		let attempts = 0;

		await pollTable(
			() => {
				attempts++;
				return attempts < 3 ? Promise.reject(new Error("Not ready yet")) : Promise.resolve();
			},
			{ timeout: 2000 }
		);

		expect(attempts).toBeGreaterThanOrEqual(3);
	});
});

test.describe("pollUntil", () => {
	test("returns the first value that is done", async () => {
		let reads = 0;
		const outcome = await pollUntil(
			() => Promise.resolve(++reads),
			value => value === 2,
			0,
			Date.now() + 2_000
		);

		expect(outcome).toEqual({ value: 2, read: true, error: undefined });
	});

	test("keeps the last value and reports the error of a failed last read", async () => {
		let reads = 0;
		const outcome = await pollUntil(
			() => (++reads === 1 ? Promise.resolve("first") : Promise.reject(new Error("gone"))),
			() => false,
			"initial",
			Date.now() + 400
		);

		expect(outcome.value).toBe("first");
		expect(outcome.read).toBe(true);
		expect((outcome.error as Error).message).toBe("gone");
	});

	test("a timeout does not hide an earlier, more specific error", async () => {
		let reads = 0;
		const outcome = await pollUntil(
			() =>
				Promise.reject(
					++reads === 1 ? new SyntaxError("'a>>>b' is not a valid selector") : new errors.TimeoutError("Timeout")
				),
			() => true,
			null,
			Date.now() + 400
		);

		expect(reads).toBeGreaterThan(1);
		expect(outcome.read).toBe(false);
		expect((outcome.error as Error).message).toContain("not a valid selector");
	});
});
