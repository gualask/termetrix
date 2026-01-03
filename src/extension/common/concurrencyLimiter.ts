export type ConcurrencyLimiter = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Creates a simple concurrency limiter for async operations.
 * @param maxConcurrency - Maximum number of concurrent operations allowed.
 * @returns A function that runs the provided async work respecting the concurrency limit.
 */
export function createConcurrencyLimiter(maxConcurrency: number): ConcurrencyLimiter {
	let active = 0;
	const queue: Array<() => void> = [];

	const acquire = async (): Promise<void> => {
		// Fast path: there is available concurrency budget.
		if (active < maxConcurrency) {
			active++;
			return;
		}

		// Backpressure: wait until a previous task releases its slot.
		await new Promise<void>((resolve) => {
			queue.push(() => {
				active++;
				resolve();
			});
		});
	};

	const release = (): void => {
		// Release and wake the next waiter (FIFO) if present.
		active--;
		const next = queue.shift();
		if (next) next();
	};

	return async function runLimited<T>(fn: () => Promise<T>): Promise<T> {
		await acquire();
		try {
			// The actual work runs outside the limiter logic.
			return await fn();
		} finally {
			release();
		}
	};
}
