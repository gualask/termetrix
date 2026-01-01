export type ConcurrencyLimiter = <T>(fn: () => Promise<T>) => Promise<T>;

export function createConcurrencyLimiter(maxConcurrency: number): ConcurrencyLimiter {
	let active = 0;
	const queue: Array<() => void> = [];

	const acquire = async (): Promise<void> => {
		if (active < maxConcurrency) {
			active++;
			return;
		}

		await new Promise<void>((resolve) => {
			queue.push(() => {
				active++;
				resolve();
			});
		});
	};

	const release = (): void => {
		active--;
		const next = queue.shift();
		if (next) next();
	};

	return async function runLimited<T>(fn: () => Promise<T>): Promise<T> {
		await acquire();
		try {
			return await fn();
		} finally {
			release();
		}
	};
}
