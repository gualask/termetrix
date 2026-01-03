import type { ScanRuntimeState, SizeScanCancellationToken, SizeScanConfig, SizeScanProgress } from './scanEngineTypes';

/**
 * Computes scan limits derived from configuration.
 * @param config - Scan configuration.
 * @returns Derived limits for duration, concurrency, and stat batching.
 */
export function computeScanLimits(config: SizeScanConfig): {
	maxDurationMs: number;
	maxFsConcurrency: number;
	statBatchSize: number;
	maxDirectoryConcurrency: number;
} {
	const maxDurationMs = config.maxDurationSeconds * 1000;
	const maxFsConcurrency = Math.max(1, Math.floor(config.concurrentOperations));
	const statBatchSize = Math.max(32, Math.min(1024, maxFsConcurrency * 8));
	const maxDirectoryConcurrency = Math.max(1, Math.min(16, Math.ceil(maxFsConcurrency / 4)));

	return { maxDurationMs, maxFsConcurrency, statBatchSize, maxDirectoryConcurrency };
}

/**
 * Returns true if an error is a permission-denied filesystem error.
 * @param error - Unknown error value.
 * @returns True when the error is an EACCES/EPERM error.
 */
export function isPermissionDeniedError(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | null)?.code;
	return code === 'EACCES' || code === 'EPERM';
}

/**
 * Marks a scan as incomplete and stops further scheduling.
 * @param state - Runtime scan state (mutated).
 * @param reason - Reason for incompleteness.
 * @returns void
 */
export function markIncomplete(state: ScanRuntimeState, reason: 'cancelled' | 'time_limit' | 'dir_limit'): void {
	if (state.incomplete) return;
	state.incomplete = true;
	state.incompleteReason = reason;
	state.stopScheduling = true;
}

/**
 * Returns true when the scan should stop due to cancellation or limits.
 * @param state - Runtime scan state (mutated).
 * @param startTime - Scan start time (epoch ms).
 * @param maxDurationMs - Maximum duration in milliseconds.
 * @param maxDirectories - Maximum directory count.
 * @param cancellationToken - Cancellation token.
 * @returns True when the scan should stop.
 */
export function shouldStop(
	state: ScanRuntimeState,
	startTime: number,
	maxDurationMs: number,
	maxDirectories: number,
	cancellationToken: SizeScanCancellationToken
): boolean {
	if (state.stopScheduling) return true;

	if (cancellationToken.isCancellationRequested) {
		markIncomplete(state, 'cancelled');
		return true;
	}

	if (Date.now() - startTime > maxDurationMs) {
		markIncomplete(state, 'time_limit');
		return true;
	}

	if (state.directoriesScanned >= maxDirectories) {
		markIncomplete(state, 'dir_limit');
		return true;
	}

	return false;
}

// HOT PATH (per-directory scheduling): affects scan throughput and stop/cancel latency.
/**
 * Runs a concurrent directory-processing queue until depleted or stopped.
 * @param params - Queue parameters.
 * @param params.queue - Directory queue (mutated by workers).
 * @param params.state - Runtime scan state (mutated).
 * @param params.startTime - Scan start time (epoch ms).
 * @param params.maxDurationMs - Maximum duration in milliseconds.
 * @param params.maxDirectories - Maximum directory count.
 * @param params.cancellationToken - Cancellation token.
 * @param params.maxDirectoryConcurrency - Maximum number of in-flight directory workers.
 * @param params.onProgress - Optional progress callback.
 * @param params.runOneDirectory - Worker function for a single directory.
 * @returns Promise resolving when scanning completes or stops.
 */
export async function runDirectoryQueue(params: {
	queue: string[];
	state: ScanRuntimeState;
	startTime: number;
	maxDurationMs: number;
	maxDirectories: number;
	cancellationToken: SizeScanCancellationToken;
	maxDirectoryConcurrency: number;
	onProgress?: (progress: SizeScanProgress) => void;
	runOneDirectory: (currentPath: string) => Promise<void>;
}): Promise<void> {
	const {
		queue,
		state,
		startTime,
		maxDurationMs,
		maxDirectories,
		cancellationToken,
		maxDirectoryConcurrency,
		onProgress,
		runOneDirectory,
	} = params;

	let inFlight = 0;
	let resolveDone: (() => void) | undefined;

	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
		});

		/**
		 * Resolves the completion promise when all workers are finished and no more work remains.
		 * @returns void
		 */
		const maybeFinish = (): void => {
			// Finish when no work is in-flight and nothing is left to schedule.
			if (!resolveDone) return;
			if (inFlight !== 0) return;
		if (state.stopScheduling || queue.length === 0) {
			resolveDone();
			resolveDone = undefined;
			}
		};

		/**
		 * Schedules directory workers up to the concurrency limit.
		 * @returns void
		 */
		const schedule = (): void => {
			// Best-effort: avoid holding a big queue once we know we should stop.
			if (state.stopScheduling) queue.length = 0;

		// Drain the queue while we have concurrency budget.
		while (!state.stopScheduling && inFlight < maxDirectoryConcurrency && queue.length > 0) {
			if (shouldStop(state, startTime, maxDurationMs, maxDirectories, cancellationToken)) break;

			const currentPath = queue.pop()!;
			state.directoriesScanned++;
			onProgress?.({ totalBytes: state.totalBytes, directoriesScanned: state.directoriesScanned });

			inFlight++;
			// Worker will push newly discovered subdirectories back into `queue`.
			void runOneDirectory(currentPath).finally(() => {
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
