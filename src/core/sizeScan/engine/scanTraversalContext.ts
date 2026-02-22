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

	shouldStop(): boolean {
		return shouldStop(this.state, this.budget);
	}

	markIncomplete(reason: ScanIncompleteReason): void {
		markIncomplete(this.state, reason);
	}

	isStopScheduled(): boolean {
		return this.state.stopScheduling;
	}

	enqueueDirectory(absolutePath: string): void {
		if (this.state.stopScheduling) return;
		this.queue.push(absolutePath);
	}

	incrementDirectoriesScanned(): void {
		this.state.directoriesScanned++;
	}

	incrementSkipped(count = 1): void {
		this.state.skippedCount += count;
	}

	addTotalBytes(delta: number): void {
		if (delta <= 0) return;
		this.state.totalBytes += delta;
	}

	getProgress(): ProgressData {
		return {
			bytesScanned: this.state.totalBytes,
			directoriesScanned: this.state.directoriesScanned,
		};
	}
}
