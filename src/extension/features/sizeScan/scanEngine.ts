import * as fs from 'fs/promises';
import * as path from 'path';
import type { ExtendedScanResult } from '../../types';
import { createConcurrencyLimiter, type ConcurrencyLimiter } from '../../common/concurrencyLimiter';

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
	isSummaryOnly: boolean
): Promise<{ totalBytesDelta: number; directBytesDelta: number }> {
	const sizes = await Promise.all(paths.map((p) => statFileSize(runLimited, p)));

	let totalBytesDelta = 0;
	let directBytesDelta = 0;

	for (const size of sizes) {
		if (size <= 0) continue;
		totalBytesDelta += size;
		if (!isSummaryOnly) directBytesDelta += size;
	}

	return { totalBytesDelta, directBytesDelta };
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
	collectDirectorySizes: boolean;
	collectTopDirectories: boolean;
	topDirectoriesLimit: number;
	dirSizes: Map<string, number> | undefined;
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
		collectDirectorySizes,
		collectTopDirectories,
		topDirectoriesLimit,
		dirSizes,
		topDirectories,
	} = params;

	if (shouldStop(state, startTime, maxDurationMs, maxDirectories, cancellationToken)) return;

	let directBytes = 0;
	let fileBatch: string[] = [];

	const flushBatch = async (): Promise<void> => {
		if (fileBatch.length === 0) return;
		const paths = fileBatch;
		fileBatch = [];

		const { totalBytesDelta, directBytesDelta } = await sumFileBatch(runLimited, paths, isSummaryOnly);
		state.totalBytes += totalBytesDelta;
		directBytes += directBytesDelta;
	};

	try {
		const entries = await readDirEntries(runLimited, currentPath);

		for (const entry of entries) {
			if (state.stopScheduling) break;
			if (cancellationToken.isCancellationRequested) return markIncomplete(state, 'cancelled');

			const fullPath = path.join(currentPath, entry.name);

			if (entry.isSymbolicLink()) continue;

			if (entry.isDirectory()) {
				if (!state.stopScheduling) queue.push(fullPath);
				continue;
			}

			if (!entry.isFile()) continue;
			if (state.stopScheduling || shouldStop(state, startTime, maxDurationMs, maxDirectories, cancellationToken)) break;

			fileBatch.push(fullPath);
			if (fileBatch.length >= statBatchSize) await flushBatch();
		}

		await flushBatch();
	} catch (error) {
		if (isPermissionDeniedError(error)) state.skippedCount++;
		return;
	}

	if (isSummaryOnly || directBytes <= 0) return;
	if (collectDirectorySizes && dirSizes) dirSizes.set(currentPath, directBytes);
	if (collectTopDirectories) updateTopDirectories(topDirectories, rootPath, currentPath, directBytes, topDirectoriesLimit);
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
			if (shouldStop(state, startTime, maxDurationMs, config.maxDirectories, cancellationToken)) break;

			const currentPath = queue.pop()!;
			state.directoriesScanned++;
			onProgress?.({ totalBytes: state.totalBytes, directoriesScanned: state.directoriesScanned });

			inFlight++;
			void processDirectory({
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
				collectDirectorySizes,
				collectTopDirectories,
				topDirectoriesLimit,
				dirSizes,
				topDirectories,
			})
				.finally(() => {
					inFlight--;
					schedule();
					maybeFinish();
				});
		}

		maybeFinish();
	};

	schedule();
	await done;

	const endTime = Date.now();

	const directorySizes: Record<string, number> | undefined = collectDirectorySizes && dirSizes
		? Object.fromEntries(dirSizes.entries())
		: undefined;

	return {
		rootPath,
		totalBytes: state.totalBytes,
		...(directorySizes ? { directorySizes } : {}),
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
