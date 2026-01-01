import * as fs from 'fs/promises';
import * as path from 'path';
import type { ExtendedScanResult } from '../../types';

function createConcurrencyLimiter(maxConcurrency: number) {
	let active = 0;
	const queue: Array<() => void> = [];

	const acquire = async (): Promise<void> => {
		if (active < maxConcurrency) {
			active++;
			return;
		}

		await new Promise<void>((resolve) => {
			queue.push(() => {
				active++;
				resolve();
			});
		});
	};

	const release = (): void => {
		active--;
		const next = queue.shift();
		if (next) next();
	};

	return async function runLimited<T>(fn: () => Promise<T>): Promise<T> {
		await acquire();
		try {
			return await fn();
		} finally {
			release();
		}
	};
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
	const maxDurationMs = config.maxDurationSeconds * 1000;
	let stopScheduling = false;

	const maxFsConcurrency = Math.max(1, Math.floor(config.concurrentOperations));
	const runLimited = createConcurrencyLimiter(maxFsConcurrency);
	const statBatchSize = Math.max(32, Math.min(1024, maxFsConcurrency * 8));
	const maxDirectoryConcurrency = Math.max(1, Math.min(16, Math.ceil(maxFsConcurrency / 4)));

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

	const statFileSize = async (fullPath: string): Promise<number> => {
		try {
			const stats = await runLimited(() => fs.stat(fullPath));
			return stats.size;
		} catch {
			return 0;
		}
	};

	const processDirectory = async (currentPath: string): Promise<void> => {
		if (shouldStop()) return;

		let directBytes = 0;
		let fileBatch: string[] = [];

		const flushBatch = async (): Promise<void> => {
			if (fileBatch.length === 0) return;
			const paths = fileBatch;
			fileBatch = [];

			const sizes = await Promise.all(paths.map((p) => statFileSize(p)));
			for (const size of sizes) {
				if (size <= 0) continue;
				totalBytes += size;
				if (!isSummaryOnly) {
					directBytes += size;
				}
			}
		};

		try {
			const entries = await runLimited(() => fs.readdir(currentPath, { withFileTypes: true }));

				for (const entry of entries) {
					if (stopScheduling) break;
					if (cancellationToken.isCancellationRequested) {
						markIncomplete('cancelled');
						return;
					}

					const fullPath = path.join(currentPath, entry.name);

					if (entry.isSymbolicLink()) {
						continue;
					}

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
			if (
				(readdirError as NodeJS.ErrnoException).code === 'EACCES' ||
				(readdirError as NodeJS.ErrnoException).code === 'EPERM'
			) {
				skippedCount++;
			}
			// Continue scan despite errors
		}

		if (isSummaryOnly || directBytes <= 0) return;

		if (collectDirectorySizes && dirSizes) {
			dirSizes.set(currentPath, directBytes);
		}

		if (collectTopDirectories && currentPath !== rootPath) {
			const relativePath = path.relative(rootPath, currentPath);
			topDirectories.push({ path: relativePath, absolutePath: currentPath, bytes: directBytes });
			topDirectories.sort((a, b) => b.bytes - a.bytes);
			if (topDirectories.length > topDirectoriesLimit) {
				topDirectories.length = topDirectoriesLimit;
			}
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
