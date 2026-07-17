import { noopLogger } from '../../ports/loggerPort';
import { createConcurrencyLimiter } from '../../shared/runtime/concurrencyLimiter';
import { DirectoryMetricsStore } from '../model/directoryMetrics';
import { completeScan, toScanResultCompletion } from '../model/scanCompletion';
import type { ExtendedScanResult } from '../types';
import { runDirectoryQueue } from './scanEngineCore';
import { processDirectory } from './scanEngineFs';
import type { ScanRuntimeState, SizeScanBudget, SizeScanParams } from './scanEngineTypes';
import { resolveScanLimitsPolicy } from './scanLimits.policy';
import { ScanTraversalContext } from './scanTraversalContext';

export type { SizeScanParams } from './scanEngineTypes';

/**
 * File-system size scan engine (no VS Code dependencies).
 * Single responsibility: compute directory sizes + metadata.
 * HOT PATH: entry point for scanning; keep overhead minimal and avoid extra IO.
 * @param params - Scan parameters.
 * @param params.rootPath - Root directory to scan.
 * @param params.config - Scan configuration (limits and concurrency).
 * @param params.cancellationToken - Cancellation token.
 * @param params.onProgress - Optional progress callback.
 * @returns Scan result with totals and per-directory metrics.
 */
export async function scanProjectSize({
	rootPath,
	config,
	fs,
	cancellationToken,
	onProgress,
	logger = noopLogger,
}: SizeScanParams): Promise<ExtendedScanResult> {
	const startTime = Date.now();
	const directoryMetricsStore = new DirectoryMetricsStore();
	const state: ScanRuntimeState = {
		totalBytes: 0,
		directoriesScanned: 0,
		skippedCount: 0,
		completion: completeScan(),
		stopScheduling: false,
	};

	const queue: string[] = [rootPath];
	const { maxDurationMs, maxDirectories, maxFsConcurrency, statBatchSize, maxDirectoryConcurrency } =
		resolveScanLimitsPolicy(config);
	const budget: SizeScanBudget = {
		startTimeMs: startTime,
		maxDurationMs,
		maxDirectories,
		cancellationToken,
	};
	const runLimited = createConcurrencyLimiter(maxFsConcurrency);
	const traversal = new ScanTraversalContext({
		rootPath,
		queue,
		state,
		budget,
		maxFsConcurrency,
		maxDirectoryConcurrency,
		runLimited,
		fs,
		statBatchSize,
		directoryMetricsStore,
	});

	await runDirectoryQueue({
		context: traversal,
		maxDirectoryConcurrency,
		onProgress,
		onDirectoryError: (err) =>
			logger.error(`Directory worker error: ${err instanceof Error ? err.message : String(err)}`),
		runOneDirectory: async (currentPath) => processDirectory(currentPath, traversal),
	});

	const endTime = Date.now();
	const { incomplete, incompleteReason } = toScanResultCompletion(state.completion);

	const result: ExtendedScanResult = {
		rootPath,
		totalBytes: state.totalBytes,
		metadata: {
			startTime,
			endTime,
			duration: endTime - startTime,
			directoriesScanned: state.directoriesScanned,
		},
		incomplete,
		incompleteReason,
		skippedCount: state.skippedCount,
		directoryMetrics: directoryMetricsStore.toSnapshot(),
	};

	logger.info(
		`Scan completed: ${state.directoriesScanned.toLocaleString()} dirs, ` +
			`${(result.totalBytes / 1024 / 1024).toFixed(1)} MB, ` +
			`${result.metadata.duration}ms, ` +
			`skipped: ${state.skippedCount.toLocaleString()} entries` +
			`, ${directoryMetricsStore.size()} dir entries`,
	);

	return result;
}
