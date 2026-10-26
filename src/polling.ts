export type PollingOptions = {
	timeout?: number;
	interval?: number;
};

export async function pollTable(fn: () => Promise<void>, options: PollingOptions = {}): Promise<void> {
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

	throw lastError ?? new Error("Playwright Tables: Polling timeout reached");
}

/** Minimum time a single read may take, so the last read before the deadline can still succeed. */
export const MIN_READ_TIMEOUT = 100;

/** Waits between reads, like Playwright's `expect.poll`. The last one repeats. */
const POLL_INTERVALS = [100, 250, 500, 1_000];

/** The outcome of {@link pollUntil}. */
export type PollOutcome<T> = {
	/** The value of the last read that succeeded, or the initial value if none did. */
	value: T;
	/** Whether any read succeeded. */
	read: boolean;
	/** The error of the last read, or `undefined` if it succeeded. */
	error: unknown;
};

/**
 * Reads until `done` accepts a value, or until `deadline`. A read gets the time left until the deadline
 * (at least {@link MIN_READ_TIMEOUT}) as its timeout. A read that throws keeps the last value, so a
 * table that is not attached yet is retried.
 *
 * @internal
 */
export async function pollUntil<T>(
	read: (timeout: number) => Promise<T>,
	done: (value: T) => boolean,
	initial: T,
	deadline: number
): Promise<PollOutcome<T>> {
	const outcome: PollOutcome<T> = { value: initial, read: false, error: undefined };
	for (let attempt = 0; ; attempt++) {
		try {
			outcome.value = await read(Math.max(MIN_READ_TIMEOUT, deadline - Date.now()));
			outcome.read = true;
			outcome.error = undefined;
			if (done(outcome.value)) return outcome;
		} catch (error) {
			// The last read gets little time and can time out; keep the error that says what is wrong.
			if (!isTimeout(error) || outcome.error === undefined || isTimeout(outcome.error)) outcome.error = error;
		}
		const left = deadline - Date.now();
		if (left <= 0) return outcome;
		const interval = POLL_INTERVALS[Math.min(attempt, POLL_INTERVALS.length - 1)] ?? MIN_READ_TIMEOUT;
		await new Promise(resolve => setTimeout(resolve, Math.min(interval, left)));
	}
}

function isTimeout(error: unknown): boolean {
	return error instanceof Error && error.name === "TimeoutError";
}

/** A `Last error:` line for a failure message, or `""` if there is no error. */
export function describeLastError(error: unknown): string {
	if (error === undefined) return "";
	const message = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
	return `Last error: ${message.split("\n")[0]}\n`;
}
