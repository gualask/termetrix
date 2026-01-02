import * as fs from 'fs/promises';
import * as path from 'path';
import type { ExtendedScanResult } from '../../types';
import { createConcurrencyLimiter, type ConcurrencyLimiter } from '../../common/concurrencyLimiter';

// Keep a small shortlist of the largest direct files per directory.
// This is used to populate the UI "large files" list without re-scanning.
const TOP_FILE_CANDIDATES_PER_DIRECTORY = 20;

interface ScanRuntimeState {
	totalBytes: number;
	directoriesScanned: number;
	skippedCount: number;
	incomplete: boolean;
	incompleteReason: 'cancelled' | 'time_limit' | 'dir_limit' | undefined;
	stopScheduling: boolean;
}

export interface SizeScanConfig {
	maxDurationSeconds: number;
	maxDirectories: number;
	concurrentOperations: number;
}

export interface SizeScanProgress {
	totalBytes: number;
	directoriesScanned: number;
}

export interface SizeScanCancellationToken {
	isCancellationRequested: boolean;
}

export interface SizeScanParams {
	rootPath: string;
	config: SizeScanConfig;
	cancellationToken: SizeScanCancellationToken;
	onProgress?: (progress: SizeScanProgress) => void;
	options?: {
		collectDirectorySizes?: boolean;
		collectTopDirectories?: boolean;
		topDirectoriesLimit?: number;
	};
}

function computeScanLimits(config: SizeScanConfig): {
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

function isPermissionDeniedError(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | null)?.code;
	return code === 'EACCES' || code === 'EPERM';
}

function markIncomplete(state: ScanRuntimeState, reason: 'cancelled' | 'time_limit' | 'dir_limit'): void {
	if (state.incomplete) return;
	state.incomplete = true;
	state.incompleteReason = reason;
	state.stopScheduling = true;
}

type TopFile = { absolutePath: string; name: string; bytes: number };

function pushTopFile(topFiles: TopFile[], candidate: TopFile, limit: number): void {
	if (limit <= 0) return;
	if (candidate.bytes <= 0) return;

	const last = topFiles[topFiles.length - 1];
	if (topFiles.length >= limit && last && candidate.bytes <= last.bytes) return;

	let insertAt = -1;
	for (let i = 0; i < topFiles.length; i++) {
		if (candidate.bytes > topFiles[i].bytes) {
			insertAt = i;
			break;
		}
	}

	if (insertAt === -1) {
		topFiles.push(candidate);
	} else {
		topFiles.splice(insertAt, 0, candidate);
	}

	if (topFiles.length > limit) topFiles.length = limit;
}

function shouldStop(
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

async function statFileSize(runLimited: ConcurrencyLimiter, fullPath: string): Promise<number> {
	try {
		const stats = await runLimited(() => fs.stat(fullPath));
		return stats.size;
	} catch {
		return 0;
	}
}

async function readDirEntries(
	runLimited: ConcurrencyLimiter,
	currentPath: string
): Promise<ReadonlyArray<import('fs').Dirent>> {
	return await runLimited(() => fs.readdir(currentPath, { withFileTypes: true }));
}

async function tryReadDirEntries(
	runLimited: ConcurrencyLimiter,
	currentPath: string,
	state: Pick<ScanRuntimeState, 'skippedCount'>
): Promise<ReadonlyArray<import('fs').Dirent> | undefined> {
	try {
		return await readDirEntries(runLimited, currentPath);
	} catch (error) {
		if (isPermissionDeniedError(error)) state.skippedCount++;
		return undefined;
	}
}

function updateTopDirectories(
	topDirectories: Array<{ path: string; absolutePath: string; bytes: number }>,
	rootPath: string,
	currentPath: string,
	directBytes: number,
	topDirectoriesLimit: number
): void {
	if (currentPath === rootPath) return;

	const relativePath = path.relative(rootPath, currentPath);
	topDirectories.push({ path: relativePath, absolutePath: currentPath, bytes: directBytes });
	topDirectories.sort((a, b) => b.bytes - a.bytes);
	if (topDirectories.length > topDirectoriesLimit) topDirectories.length = topDirectoriesLimit;
}

async function sumFileBatch(
	runLimited: ConcurrencyLimiter,
	paths: ReadonlyArray<string>,
	isSummaryOnly: boolean,
	topFilesLimit: number
): Promise<{
	totalBytesDelta: number;
	directBytesDelta: number;
	fileCountDelta: number;
	maxFileBytesDelta: number;
	topFilesDelta: TopFile[];
}> {
	const sizes = await Promise.all(paths.map((p) => statFileSize(runLimited, p)));

	let totalBytesDelta = 0;
	let directBytesDelta = 0;
	let fileCountDelta = 0;
	let maxFileBytesDelta = 0;
	const topFilesDelta: TopFile[] = [];

	for (let i = 0; i < sizes.length; i++) {
		const size = sizes[i];
		if (size <= 0) continue;
		totalBytesDelta += size;

		if (!isSummaryOnly) {
			directBytesDelta += size;
			fileCountDelta++;
			if (size > maxFileBytesDelta) maxFileBytesDelta = size;
			pushTopFile(topFilesDelta, { absolutePath: paths[i], name: path.basename(paths[i]), bytes: size }, topFilesLimit);
		}
	}

	return { totalBytesDelta, directBytesDelta, fileCountDelta, maxFileBytesDelta, topFilesDelta };
}

async function scanDirectoryEntries(params: {
	entries: ReadonlyArray<import('fs').Dirent>;
	currentPath: string;
	queue: string[];
	state: ScanRuntimeState;
	startTime: number;
	maxDurationMs: number;
	maxDirectories: number;
	cancellationToken: SizeScanCancellationToken;
	runLimited: ConcurrencyLimiter;
	statBatchSize: number;
	isSummaryOnly: boolean;
}): Promise<{ directBytes: number; directFileCount: number; directMaxFileBytes: number; topFiles: TopFile[] }> {
	const {
		entries,
		currentPath,
		queue,
		state,
		startTime,
		maxDurationMs,
		maxDirectories,
		cancellationToken,
		runLimited,
		statBatchSize,
		isSummaryOnly,
	} = params;

	let directBytes = 0;
	let directFileCount = 0;
	let directMaxFileBytes = 0;
	const topFiles: TopFile[] = [];
	let fileBatch: string[] = [];

	const flushBatch = async (): Promise<void> => {
		if (fileBatch.length === 0) return;
		const paths = fileBatch;
		fileBatch = [];

		const { totalBytesDelta, directBytesDelta, fileCountDelta, maxFileBytesDelta, topFilesDelta } = await sumFileBatch(
			runLimited,
			paths,
			isSummaryOnly,
			TOP_FILE_CANDIDATES_PER_DIRECTORY
		);
		state.totalBytes += totalBytesDelta;
		directBytes += directBytesDelta;
		directFileCount += fileCountDelta;
		if (maxFileBytesDelta > directMaxFileBytes) directMaxFileBytes = maxFileBytesDelta;
		for (const f of topFilesDelta) pushTopFile(topFiles, f, TOP_FILE_CANDIDATES_PER_DIRECTORY);
	};

	for (const entry of entries) {
		if (state.stopScheduling) break;

		if (cancellationToken.isCancellationRequested) {
			markIncomplete(state, 'cancelled');
			// Keep cancellation fast: don't flush pending stat work.
			return { directBytes, directFileCount, directMaxFileBytes, topFiles };
		}

		const fullPath = path.join(currentPath, entry.name);

		if (entry.isSymbolicLink()) continue;

		if (entry.isDirectory()) {
			if (!state.stopScheduling) queue.push(fullPath);
			continue;
		}

		if (!entry.isFile()) continue;
		if (shouldStop(state, startTime, maxDurationMs, maxDirectories, cancellationToken)) break;

		fileBatch.push(fullPath);
		if (fileBatch.length >= statBatchSize) await flushBatch();
	}

	await flushBatch();
	return { directBytes, directFileCount, directMaxFileBytes, topFiles };
}

interface ProcessDirectoryParams {
	currentPath: string;
	rootPath: string;
	queue: string[];
	state: ScanRuntimeState;
	startTime: number;
	maxDurationMs: number;
	maxDirectories: number;
	cancellationToken: SizeScanCancellationToken;
	runLimited: ConcurrencyLimiter;
	statBatchSize: number;
	isSummaryOnly: boolean;
	collectTopDirectories: boolean;
	topDirectoriesLimit: number;
	dirSizes: Map<string, number> | undefined;
	dirFileCounts: Map<string, number> | undefined;
	dirMaxFileBytes: Map<string, number> | undefined;
	topFilesByDirectory: Map<string, TopFile[]> | undefined;
	topDirectories: Array<{ path: string; absolutePath: string; bytes: number }>;
}

async function processDirectory(params: ProcessDirectoryParams): Promise<void> {
	const {
		currentPath,
		rootPath,
		queue,
		state,
		startTime,
		maxDurationMs,
		maxDirectories,
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
	} = params;

	if (shouldStop(state, startTime, maxDurationMs, maxDirectories, cancellationToken)) return;

	const entries = await tryReadDirEntries(runLimited, currentPath, state);
	if (!entries) return;

	const { directBytes, directFileCount, directMaxFileBytes, topFiles } = await scanDirectoryEntries({
		entries,
		currentPath,
		queue,
		state,
		startTime,
		maxDurationMs,
		maxDirectories,
		cancellationToken,
		runLimited,
		statBatchSize,
		isSummaryOnly,
	});

	if (isSummaryOnly || directBytes <= 0) return;

	dirSizes?.set(currentPath, directBytes);
	if (directFileCount > 0) dirFileCounts?.set(currentPath, directFileCount);
	if (directMaxFileBytes > 0) dirMaxFileBytes?.set(currentPath, directMaxFileBytes);
	if (topFiles.length > 0) topFilesByDirectory?.set(currentPath, topFiles);
	if (collectTopDirectories) updateTopDirectories(topDirectories, rootPath, currentPath, directBytes, topDirectoriesLimit);
}

async function runDirectoryQueue(params: {
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

	const maybeFinish = (): void => {
		if (!resolveDone) return;
		if (inFlight !== 0) return;
		if (state.stopScheduling || queue.length === 0) {
			resolveDone();
			resolveDone = undefined;
		}
	};

	const schedule = (): void => {
		// Best-effort: avoid holding large queues once we know we should stop.
		if (state.stopScheduling) queue.length = 0;

		while (!state.stopScheduling && inFlight < maxDirectoryConcurrency && queue.length > 0) {
			if (shouldStop(state, startTime, maxDurationMs, maxDirectories, cancellationToken)) break;

			const currentPath = queue.pop()!;
			state.directoriesScanned++;
			onProgress?.({ totalBytes: state.totalBytes, directoriesScanned: state.directoriesScanned });

			inFlight++;
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

/**
 * File-system size scan engine (no VS Code dependencies).
 * Single responsibility: compute directory sizes + metadata.
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

	const directorySizes: Record<string, number> | undefined = collectDirectorySizes && dirSizes
		? Object.fromEntries(dirSizes.entries())
		: undefined;

	const directoryFileCounts: Record<string, number> | undefined = collectDirectorySizes && dirFileCounts
		? Object.fromEntries(dirFileCounts.entries())
		: undefined;

	const directoryMaxFileBytes: Record<string, number> | undefined = collectDirectorySizes && dirMaxFileBytes
		? Object.fromEntries(dirMaxFileBytes.entries())
		: undefined;

	const topFilesByDirectoryResult: Record<string, TopFile[]> | undefined = collectDirectorySizes && topFilesByDirectory
		? Object.fromEntries(topFilesByDirectory.entries())
		: undefined;

	return {
		rootPath,
		totalBytes: state.totalBytes,
		...(directorySizes ? { directorySizes } : {}),
		...(directoryFileCounts ? { directoryFileCounts } : {}),
		...(directoryMaxFileBytes ? { directoryMaxFileBytes } : {}),
		...(topFilesByDirectoryResult ? { topFilesByDirectory: topFilesByDirectoryResult } : {}),
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
}
