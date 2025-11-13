import { test, expect } from "@playwright/test";
import { Poll } from "../src/polling";

test.describe("toPassWithErrorContext", () => {
	test("should strip Playwright's generic timeout error and preserve custom error message", async () => {
		const errorMessage = "Cell not found in table at row 5";

		try {
			await Poll(
				async () => {
					throw new Error(errorMessage);
				},
				{ timeout: 500 }
			);
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
			await Poll(
				async () => {
					throw new Error(errorMessage);
				},
				{ timeout: 500 }
			);
		}).rejects.toThrow(errorMessage);
	});

	test("should not add context prefix when not provided", async () => {
		try {
			await Poll(
				async () => {
					throw new Error("Error message");
				},
				{ timeout: 500 }
			);
			expect(true).toBe(false);
		} catch (error) {
			const err = error as Error;
			expect(err.message).not.toContain("[Context:");
		}
	});

	test("should pass when function succeeds", async () => {
		await Poll(async () => {
			// Success
		});
	});

	test("should retry until success", async () => {
		let attempts = 0;

		await Poll(
			async () => {
				attempts++;
				if (attempts < 3) {
					throw new Error("Not ready yet");
				}
			},
			{ timeout: 2000 }
		);

		expect(attempts).toBeGreaterThanOrEqual(3);
	});
});
