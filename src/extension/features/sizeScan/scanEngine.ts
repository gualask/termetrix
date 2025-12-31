import * as fs from 'fs/promises';
import * as path from 'path';
import type { ExtendedScanResult } from '../../types';
import { Semaphore } from './semaphore';

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
}: SizeScanParams): Promise<ExtendedScanResult> {
	const startTime = Date.now();

	const semaphore = new Semaphore(config.concurrentOperations);
	const dirSizes = new Map<string, number>();
	let totalBytes = 0;
	let directoriesScanned = 0;
	let skippedCount = 0;
	let incomplete = false;
	let incompleteReason: 'cancelled' | 'time_limit' | 'dir_limit' | undefined;

	// BFS queue
	const queue: string[] = [rootPath];

	while (queue.length > 0) {
		// Check cancellation
		if (cancellationToken.isCancellationRequested) {
			incomplete = true;
			incompleteReason = 'cancelled';
			break;
		}

		// Check time limit
		const elapsed = Date.now() - startTime;
		if (elapsed > config.maxDurationSeconds * 1000) {
			incomplete = true;
			incompleteReason = 'time_limit';
			break;
		}

		// Check directory limit
		if (directoriesScanned >= config.maxDirectories) {
			incomplete = true;
			incompleteReason = 'dir_limit';
			break;
		}

		const currentPath = queue.shift()!;
		directoriesScanned++;

		onProgress?.({ totalBytes, directoriesScanned });

		try {
			await semaphore.execute(async () => {
				try {
					const entries = await fs.readdir(currentPath, { withFileTypes: true });

					for (const entry of entries) {
						const fullPath = path.join(currentPath, entry.name);

						if (entry.isSymbolicLink()) {
							// Ignore symlinks
							continue;
						}

						if (entry.isDirectory()) {
							queue.push(fullPath);
						} else if (entry.isFile()) {
							try {
								const stats = await fs.stat(fullPath);
								const size = stats.size;

								// Add to total
								totalBytes += size;

								// Add to THIS directory only (direct size, not cumulative)
								const currentSize = dirSizes.get(currentPath) || 0;
								dirSizes.set(currentPath, currentSize + size);
							} catch {
								// Ignore stat errors on individual files
							}
						}
					}
				} catch (readdirError) {
					if (
						(readdirError as NodeJS.ErrnoException).code === 'EACCES' ||
						(readdirError as NodeJS.ErrnoException).code === 'EPERM'
					) {
						skippedCount++;
					}
					// Continue scan despite errors
				}
			});
		} catch {
			// Semaphore error, skip this directory
			continue;
		}
	}

	const endTime = Date.now();

	// Convert to array and get top directories
	const allDirs: Array<{ path: string; absolutePath: string; bytes: number }> = [];
	const directorySizes: Record<string, number> = {};

	for (const [dirPath, bytes] of dirSizes.entries()) {
		directorySizes[dirPath] = bytes;
		if (dirPath === rootPath) continue;
		const relativePath = path.relative(rootPath, dirPath);
		allDirs.push({ path: relativePath, absolutePath: dirPath, bytes });
	}

	const topDirectories = allDirs.sort((a, b) => b.bytes - a.bytes).slice(0, 5);

	return {
		rootPath,
		totalBytes,
		directorySizes,
		topDirectories,
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

