import type { ExtendedScanResult } from '../../../types';
import { createConcurrencyLimiter } from '../../../common/concurrencyLimiter';
import type { ScanRuntimeState, SizeScanParams, TopFile } from './scanEngineTypes';
import { computeScanLimits, runDirectoryQueue } from './scanEngineCore';
import { processDirectory } from './scanEngineFs';

export type { SizeScanConfig, SizeScanProgress, SizeScanCancellationToken, SizeScanParams } from './scanEngineTypes';

/**
 * File-system size scan engine (no VS Code dependencies).
 * Single responsibility: compute directory sizes + metadata.
 * HOT PATH: entry point for scanning; keep overhead minimal and avoid extra IO.
 * @param params - Scan parameters.
 * @param params.rootPath - Root directory to scan.
 * @param params.config - Scan configuration (limits and concurrency).
 * @param params.cancellationToken - Cancellation token.
 * @param params.onProgress - Optional progress callback.
 * @param params.options - Optional scan behavior flags.
 * @returns Scan result with totals and optional metadata.
 */
export async function scanProjectSize({
	rootPath,
	config,
	cancellationToken,
	onProgress,
	options,
}: SizeScanParams): Promise<ExtendedScanResult> {
	const startTime = Date.now();

	const collectDirectorySizes = options?.collectDirectorySizes ?? true;
	const collectTopDirectories = options?.collectTopDirectories ?? true;
	const topDirectoriesLimit = options?.topDirectoriesLimit ?? 5;
	const isSummaryOnly = !collectDirectorySizes && !collectTopDirectories;

	const dirSizes = collectDirectorySizes ? new Map<string, number>() : undefined;
	const dirFileCounts = collectDirectorySizes ? new Map<string, number>() : undefined;
	const dirMaxFileBytes = collectDirectorySizes ? new Map<string, number>() : undefined;
	const topFilesByDirectory = collectDirectorySizes ? new Map<string, TopFile[]>() : undefined;
	const topDirectories: Array<{ path: string; absolutePath: string; bytes: number }> = [];
	const state: ScanRuntimeState = {
		totalBytes: 0,
		directoriesScanned: 0,
		skippedCount: 0,
		incomplete: false,
		incompleteReason: undefined,
		stopScheduling: false,
	};

	const queue: string[] = [rootPath];
	const { maxDurationMs, maxFsConcurrency, statBatchSize, maxDirectoryConcurrency } = computeScanLimits(config);
	const runLimited = createConcurrencyLimiter(maxFsConcurrency);

	await runDirectoryQueue({
		queue,
		state,
		startTime,
		maxDurationMs,
		maxDirectories: config.maxDirectories,
		cancellationToken,
		maxDirectoryConcurrency,
		onProgress,
		runOneDirectory: async (currentPath) =>
			processDirectory({
				currentPath,
				rootPath,
				queue,
				state,
				startTime,
				maxDurationMs,
				maxDirectories: config.maxDirectories,
				cancellationToken,
				runLimited,
				statBatchSize,
				isSummaryOnly,
				collectTopDirectories,
				topDirectoriesLimit,
				dirSizes,
				dirFileCounts,
				dirMaxFileBytes,
				topFilesByDirectory,
				topDirectories,
			}),
	});

	const endTime = Date.now();

	const result: ExtendedScanResult = {
		rootPath,
		totalBytes: state.totalBytes,
		topDirectories: collectTopDirectories ? topDirectories : [],
		metadata: {
			startTime,
			endTime,
			duration: endTime - startTime,
			directoriesScanned: state.directoriesScanned,
		},
		incomplete: state.incomplete,
		incompleteReason: state.incompleteReason,
		skippedCount: state.skippedCount,
	};

	if (dirSizes) result.directorySizes = Object.fromEntries(dirSizes.entries());
	if (dirFileCounts) result.directoryFileCounts = Object.fromEntries(dirFileCounts.entries());
	if (dirMaxFileBytes) result.directoryMaxFileBytes = Object.fromEntries(dirMaxFileBytes.entries());
	if (topFilesByDirectory) result.topFilesByDirectory = Object.fromEntries(topFilesByDirectory.entries());

	return result;
}
