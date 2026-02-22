export interface ConcurrentQueueDriver<T> {
	shouldStop(): boolean;
	isStopScheduled(): boolean;
	hasQueuedItems(): boolean;
	popQueuedItem(): T | undefined;
	clearQueue(): void;
}

export interface RunConcurrentQueueParams<T> {
	driver: ConcurrentQueueDriver<T>;
	maxConcurrency: number;
	onItemStart?: (item: T) => void;
	runOne: (item: T) => Promise<void>;
}

export interface LifoArrayQueueDriverParams<T> {
	queue: T[];
	shouldStop: () => boolean;
	isStopScheduled: () => boolean;
}

/**
 * Creates a queue driver backed by a mutable array using LIFO semantics.
 * Useful to avoid repeating boilerplate adapter code at call sites.
 */
export function createLifoArrayQueueDriver<T>(
	params: LifoArrayQueueDriverParams<T>
): ConcurrentQueueDriver<T> {
	const { queue, shouldStop, isStopScheduled } = params;
	return {
		shouldStop,
		isStopScheduled,
		hasQueuedItems: () => queue.length > 0,
		popQueuedItem: () => queue.pop(),
		clearQueue: () => {
			queue.length = 0;
		},
	};
}

/**
 * Runs a concurrent work queue until depleted or stopped.
 * Queue items can be appended by workers through shared mutable state owned by the caller.
 */
export async function runConcurrentQueue<T>(params: RunConcurrentQueueParams<T>): Promise<void> {
	const { driver, maxConcurrency, onItemStart, runOne } = params;

	let inFlight = 0;
	let resolveDone: (() => void) | undefined;

	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});

	const maybeFinish = (): void => {
		if (!resolveDone) return;
		if (inFlight !== 0) return;
		if (driver.isStopScheduled() || !driver.hasQueuedItems()) {
			resolveDone();
			resolveDone = undefined;
		}
	};

	const schedule = (): void => {
		if (driver.isStopScheduled()) driver.clearQueue();

		while (!driver.isStopScheduled() && inFlight < maxConcurrency && driver.hasQueuedItems()) {
			if (driver.shouldStop()) break;
			const item = driver.popQueuedItem();
			if (!item) break;
			onItemStart?.(item);

			inFlight++;
			void runOne(item).finally(() => {
				inFlight--;
				schedule();
				maybeFinish();
			});
		}

		maybeFinish();
	};

	schedule();
	await done;
}
