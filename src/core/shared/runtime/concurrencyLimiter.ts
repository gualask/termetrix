export type ConcurrencyLimiter = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Creates a simple concurrency limiter for async operations.
 * @param maxConcurrency - Maximum number of concurrent operations allowed.
 * @returns A function that runs the provided async work respecting the concurrency limit.
 */
export function createConcurrencyLimiter(maxConcurrency: number): ConcurrencyLimiter {
	let active = 0;
	// FIFO waiters. We intentionally avoid `queue.shift()` here because it is O(n) and can become
	// a measurable overhead in high-throughput scans where we enqueue many short-lived FS ops.
	const queue: Array<() => void> = [];
	// `queueHead` turns the array into a ring-ish buffer: consume via index, compact occasionally.
	let queueHead = 0;

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
		if (queueHead < queue.length) {
			const next = queue[queueHead++];
			next();

			// When drained, reset to keep indexes small and avoid retaining references unnecessarily.
			if (queueHead === queue.length) {
				queue.length = 0;
				queueHead = 0;
				return;
			}

			// Avoid unbounded growth of the backing array when we `shift` via a head index.
			// Compact occasionally to keep memory stable under sustained load.
			if (queueHead > 1024 && queueHead * 2 > queue.length) {
				queue.splice(0, queueHead);
				queueHead = 0;
			}
		}
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
