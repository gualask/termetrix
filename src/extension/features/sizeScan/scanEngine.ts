import * as fs from 'fs/promises';
import * as path from 'path';
import type { ExtendedScanResult } from '../../types';
import { createConcurrencyLimiter, type ConcurrencyLimiter } from '../../common/concurrencyLimiter';

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
	let totalBytes = 0;
	let directoriesScanned = 0;
	let skippedCount = 0;
	let incomplete = false;
	let incompleteReason: 'cancelled' | 'time_limit' | 'dir_limit' | undefined;

	const queue: string[] = [rootPath];
	let stopScheduling = false;

	const { maxDurationMs, maxFsConcurrency, statBatchSize, maxDirectoryConcurrency } = computeScanLimits(config);
	const runLimited = createConcurrencyLimiter(maxFsConcurrency);

	const markIncomplete = (reason: 'cancelled' | 'time_limit' | 'dir_limit'): void => {
		if (incomplete) return;
		incomplete = true;
		incompleteReason = reason;
		stopScheduling = true;
	};

	const shouldStop = (): boolean => {
		if (stopScheduling) return true;
		if (cancellationToken.isCancellationRequested) {
			markIncomplete('cancelled');
			return true;
		}
		if (Date.now() - startTime > maxDurationMs) {
			markIncomplete('time_limit');
			return true;
		}
		if (directoriesScanned >= config.maxDirectories) {
			markIncomplete('dir_limit');
			return true;
		}
		return false;
	};

	const processDirectory = async (currentPath: string): Promise<void> => {
		if (shouldStop()) return;

		let directBytes = 0;
		let fileBatch: string[] = [];

		const flushBatch = async (): Promise<void> => {
			if (fileBatch.length === 0) return;
			const paths = fileBatch;
			fileBatch = [];

			const sizes = await Promise.all(paths.map((p) => statFileSize(runLimited, p)));
			for (const size of sizes) {
				if (size <= 0) continue;
				totalBytes += size;
				if (!isSummaryOnly) directBytes += size;
			}
		};

		try {
			const entries = await readDirEntries(runLimited, currentPath);

			for (const entry of entries) {
				if (stopScheduling) break;
				if (cancellationToken.isCancellationRequested) {
					markIncomplete('cancelled');
					return;
				}

				const fullPath = path.join(currentPath, entry.name);

				if (entry.isSymbolicLink()) continue;

				if (entry.isDirectory()) {
					if (!stopScheduling) queue.push(fullPath);
					continue;
				}

				if (!entry.isFile()) continue;
				if (stopScheduling || shouldStop()) break;

				fileBatch.push(fullPath);
				if (fileBatch.length >= statBatchSize) await flushBatch();
			}

			await flushBatch();
		} catch (readdirError) {
			if (isPermissionDeniedError(readdirError)) skippedCount++;
			// Continue scan despite errors
		}

		if (isSummaryOnly || directBytes <= 0) return;

		if (collectDirectorySizes && dirSizes) {
			dirSizes.set(currentPath, directBytes);
		}

			if (collectTopDirectories) {
				updateTopDirectories(topDirectories, rootPath, currentPath, directBytes, topDirectoriesLimit);
			}
		};

	let inFlight = 0;
	let resolveDone: (() => void) | undefined;

	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});

	const maybeFinish = (): void => {
		if (!resolveDone) return;
		if (inFlight !== 0) return;
		if (stopScheduling || queue.length === 0) {
			resolveDone();
			resolveDone = undefined;
		}
	};

	const schedule = (): void => {
		// Best-effort: avoid holding large queues once we know we should stop.
		if (stopScheduling) queue.length = 0;

		while (!stopScheduling && inFlight < maxDirectoryConcurrency && queue.length > 0) {
			if (shouldStop()) break;

			const currentPath = queue.pop()!;
			directoriesScanned++;
			onProgress?.({ totalBytes, directoriesScanned });

			inFlight++;
			void processDirectory(currentPath)
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
		totalBytes,
		...(directorySizes ? { directorySizes } : {}),
		topDirectories: collectTopDirectories ? topDirectories : [],
		metadata: {
			startTime,
			endTime,
			duration: endTime - startTime,
			directoriesScanned,
		},
		incomplete,
		incompleteReason,
		skippedCount,
	};
}
