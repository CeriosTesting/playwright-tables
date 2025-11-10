import { test, expect } from "@playwright/test";
import { toPassWithErrorContext } from "../src/polling";

test.describe("toPassWithErrorContext", () => {
	test("should strip Playwright's generic timeout error and preserve custom error message", async () => {
		const errorMessage = "Cell not found in table at row 5";

		try {
			await toPassWithErrorContext(
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
			await toPassWithErrorContext(
				async () => {
					throw new Error(errorMessage);
				},
				{ timeout: 500 }
			);
		}).rejects.toThrow(errorMessage);
	});

	test("should add context prefix when provided", async () => {
		const errorMessage = "Header not found";
		const context = "Validating table structure";

		try {
			await toPassWithErrorContext(
				async () => {
					throw new Error(errorMessage);
				},
				{ timeout: 500, context }
			);
			expect(true).toBe(false);
		} catch (error) {
			const err = error as Error;
			expect(err.message).toContain(`[Context: ${context}]`);
			expect(err.message).toContain(errorMessage);
		}
	});

	test("should not add context prefix when not provided", async () => {
		try {
			await toPassWithErrorContext(
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
		await toPassWithErrorContext(async () => {
			// Success
		});
	});

	test("should retry until success", async () => {
		let attempts = 0;

		await toPassWithErrorContext(
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

	test("should respect custom timeout and intervals", async () => {
		let attempts = 0;
		const startTime = Date.now();

		try {
			await toPassWithErrorContext(
				async () => {
					attempts++;
					throw new Error("Always fails");
				},
				{ timeout: 1000, intervals: [100, 200] }
			);
			expect(true).toBe(false);
		} catch {
			const elapsed = Date.now() - startTime;
			expect(elapsed).toBeGreaterThanOrEqual(850);
			expect(elapsed).toBeLessThan(1500);
			expect(attempts).toBeGreaterThan(1);
		}
	});
});
