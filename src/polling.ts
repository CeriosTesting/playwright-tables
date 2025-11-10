import { expect } from "@playwright/test";

type ToPassOptions = {
	timeout?: number;
	intervals?: number[];
	context?: string;
};

export async function toPassWithErrorContext(fn: () => Promise<void>, options?: ToPassOptions): Promise<void> {
	if (!options) {
		options = {};
	}

	if (!options.timeout) {
		options.timeout = 30_000;
	}

	try {
		await expect(async () => {
			try {
				await fn();
			} catch (err) {
				const e = err as Error;

				const prefix = options.context ? `\n[Context: ${options.context}]\n` : "\n";

				throw new Error(prefix + e.message);
			}
		}).toPass({ timeout: options.timeout, intervals: options.intervals });
	} catch (err) {
		const e = err as Error;

		// Extract the actual error message from the toPass timeout wrapper
		// The error message contains our custom error before "Call Log:"
		const callLogIndex = e.message.indexOf("\n\nCall Log:");
		if (callLogIndex > 0) {
			// Extract just the custom error message, removing the Playwright timeout wrapper
			throw new Error(e.message.substring(0, callLogIndex));
		}

		// If the error doesn't match expected format, rethrow as-is
		throw e;
	}
}
