export type PollingOptions = {
	timeout?: number;
	interval?: number;
};

export async function Poll(fn: () => Promise<void>, options?: PollingOptions): Promise<void> {
	if (!options) {
		options = {};
	}

	const timeout = options.timeout ?? 30_000;
	const interval = options.interval ?? 100;
	const startTime = Date.now();
	let lastError: Error | undefined;

	while (Date.now() - startTime < timeout) {
		try {
			await fn();
			return;
		} catch (err) {
			lastError = err as Error;

			await new Promise(resolve => setTimeout(resolve, interval));
		}
	}

	throw lastError || new Error("Playwright Tables: Polling timeout reached");
}
