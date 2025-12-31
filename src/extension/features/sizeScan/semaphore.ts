/**
 * Semaphore for controlling concurrent operations
 */
export class Semaphore {
	private running = 0;
	private queue: Array<() => void> = [];

	constructor(private max: number) {}

	/**
	 * Acquire a permit
	 */
	async acquire(): Promise<void> {
		if (this.running < this.max) {
			this.running++;
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			this.queue.push(resolve);
		});
	}

	/**
	 * Release a permit
	 */
	release(): void {
		this.running--;
		if (this.queue.length > 0) {
			const resolve = this.queue.shift()!;
			this.running++;
			resolve();
		}
	}

	/**
	 * Execute a function with semaphore
	 */
	async execute<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await fn();
		} finally {
			this.release();
		}
	}
}
