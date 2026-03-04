import type { ScanIncompleteReason } from '../../../shared/contracts/scan';
import type { ProgressData } from '../../../shared/contracts/progress';
import type { FsPort } from '../../ports/fsPort';
import type { ConcurrencyLimiter } from '../../shared/runtime/concurrencyLimiter';
import { markIncomplete, shouldStop } from './scanEngineCore';
import type { DirectoryMetricsStore } from '../model/directoryMetrics';
import type {
	ScanRuntimeState,
	SizeScanBudget,
} from './scanEngineTypes';

export interface TraversalRuntimeContext {
	rootPath: string;
	queue: string[];
	state: ScanRuntimeState;
	budget: SizeScanBudget;
	// These are used only for traversal heuristics (e.g., chunking / pacing), not for results.
	maxFsConcurrency: number;
	maxDirectoryConcurrency: number;
	runLimited: ConcurrencyLimiter;
	fs: FsPort;
	statBatchSize: number;
}

export interface TraversalCollectionPolicy {
	isSummaryOnly: boolean;
	directoryMetricsStore: DirectoryMetricsStore | undefined;
}

/**
 * Mutable context shared across the full size-scan traversal lifecycle.
 * Co-locates traversal state, scheduling budget, and directory metric storage.
 */
export class ScanTraversalContext {
	readonly rootPath: string;
	readonly queue: string[];
	readonly state: ScanRuntimeState;
	readonly budget: SizeScanBudget;
	readonly maxFsConcurrency: number;
	readonly maxDirectoryConcurrency: number;
	readonly runLimited: ConcurrencyLimiter;
	readonly fs: FsPort;
	readonly statBatchSize: number;
	readonly isSummaryOnly: boolean;
	readonly directoryMetricsStore: DirectoryMetricsStore | undefined;

	constructor(
		runtime: TraversalRuntimeContext,
		collection: TraversalCollectionPolicy
	) {
		this.rootPath = runtime.rootPath;
		this.queue = runtime.queue;
		this.state = runtime.state;
		this.budget = runtime.budget;
		this.maxFsConcurrency = runtime.maxFsConcurrency;
		this.maxDirectoryConcurrency = runtime.maxDirectoryConcurrency;
		this.runLimited = runtime.runLimited;
		this.fs = runtime.fs;
		this.statBatchSize = runtime.statBatchSize;
		this.isSummaryOnly = collection.isSummaryOnly;
		this.directoryMetricsStore = collection.directoryMetricsStore;
	}

	/** Returns `true` when the scan should stop due to cancellation, timeout, or directory limits. */
	shouldStop(): boolean {
		return shouldStop(this.state, this.budget);
	}

	/**
	 * Marks the scan as incomplete with the given reason and halts further scheduling.
	 * @param reason - Why the scan stopped early.
	 */
	markIncomplete(reason: ScanIncompleteReason): void {
		markIncomplete(this.state, reason);
	}

	/** Returns `true` when new directories should no longer be enqueued. */
	isStopScheduled(): boolean {
		return this.state.stopScheduling;
	}

	/**
	 * Adds a directory to the traversal queue. No-op when scheduling has been halted.
	 * @param absolutePath - Absolute path of the directory to enqueue.
	 */
	enqueueDirectory(absolutePath: string): void {
		if (this.state.stopScheduling) return;
		this.queue.push(absolutePath);
	}

	/** Increments the count of directories fully scanned. */
	incrementDirectoriesScanned(): void {
		this.state.directoriesScanned++;
	}

	/**
	 * Increments the count of skipped entries (permission errors, unsupported types).
	 * @param count - Number of entries to add (default 1).
	 */
	incrementSkipped(count = 1): void {
		this.state.skippedCount += count;
	}

	/**
	 * Adds `delta` to the running total bytes. No-op for non-positive values.
	 * @param delta - Bytes to add.
	 */
	addTotalBytes(delta: number): void {
		if (delta <= 0) return;
		this.state.totalBytes += delta;
	}

	/** Returns a snapshot of the current scan progress for UI updates. */
	getProgress(): ProgressData {
		return {
			bytesScanned: this.state.totalBytes,
			directoriesScanned: this.state.directoriesScanned,
		};
	}
}
