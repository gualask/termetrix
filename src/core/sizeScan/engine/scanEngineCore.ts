import type { ProgressData } from '../../../shared/contracts/progress';
import type { ScanIncompleteReason } from '../../../shared/contracts/scan';
import { createLifoArrayQueueDriver, runConcurrentQueue } from '../../shared/runtime/workQueue';
import { incompleteScan, isIncompleteScan } from '../model/scanCompletion';
import type { ScanRuntimeState, SizeScanBudget } from './scanEngineTypes';

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
export function markIncomplete(state: ScanRuntimeState, reason: ScanIncompleteReason): void {
	if (isIncompleteScan(state.completion)) return;
	state.completion = incompleteScan(reason);
	state.stopScheduling = true;
}

/**
 * Returns true when the scan should stop due to cancellation or limits.
 * @param state - Runtime scan state (mutated).
 * @param budget - Scan budget and cancellation context.
 * @returns True when the scan should stop.
 */
export function shouldStop(state: ScanRuntimeState, budget: SizeScanBudget): boolean {
	const { startTimeMs, maxDurationMs, maxDirectories, cancellationToken } = budget;

	if (state.stopScheduling) return true;

	if (cancellationToken.isCancellationRequested) {
		markIncomplete(state, 'cancelled');
		return true;
	}

	if (Date.now() - startTimeMs > maxDurationMs) {
		markIncomplete(state, 'time_limit');
		return true;
	}

	if (state.directoriesScanned >= maxDirectories) {
		markIncomplete(state, 'dir_limit');
		return true;
	}

	return false;
}

interface DirectoryQueueContext {
	shouldStop(): boolean;
	isStopScheduled(): boolean;
	queue: string[];
	incrementDirectoriesScanned(): void;
	getProgress(): ProgressData;
}

interface RunDirectoryQueueParams {
	context: DirectoryQueueContext;
	maxDirectoryConcurrency: number;
	onProgress?: (progress: ProgressData) => void;
	onDirectoryError?: (error: unknown) => void;
	runOneDirectory: (currentPath: string) => Promise<void>;
}

// HOT PATH (per-directory scheduling): affects scan throughput and stop/cancel latency.
/**
 * Runs a concurrent directory-processing queue until depleted or stopped.
 * @param params - Queue parameters.
 * @param params.context - Shared traversal context (queue + stop/progress behavior).
 * @param params.maxDirectoryConcurrency - Maximum number of in-flight directory workers.
 * @param params.onProgress - Optional progress callback.
 * @param params.runOneDirectory - Worker function for a single directory.
 * @returns Promise resolving when scanning completes or stops.
 */
export async function runDirectoryQueue(params: RunDirectoryQueueParams): Promise<void> {
	const { context, maxDirectoryConcurrency, onProgress, onDirectoryError, runOneDirectory } = params;
	await runConcurrentQueue<string>({
		driver: createLifoArrayQueueDriver({
			queue: context.queue,
			shouldStop: () => context.shouldStop(),
			isStopScheduled: () => context.isStopScheduled(),
		}),
		maxConcurrency: maxDirectoryConcurrency,
		onItemStart: () => {
			context.incrementDirectoriesScanned();
			onProgress?.(context.getProgress());
		},
		onItemError: onDirectoryError,
		runOne: runOneDirectory,
	});
}
