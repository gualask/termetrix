import * as fs from 'fs/promises';
import * as path from 'path';
import type { ConcurrencyLimiter } from '../../../common/concurrencyLimiter';
import type { ScanRuntimeState, SizeScanCancellationToken, TopFile } from './scanEngineTypes';
import { isPermissionDeniedError, markIncomplete, shouldStop } from './scanEngineCore';

// Keep a small shortlist of the largest direct files per directory.
// This is used to populate the UI "large files" list without re-scanning.
const TOP_FILE_CANDIDATES_PER_DIRECTORY = 20;

// HOT PATH: called for many files during scans; keep changes minimal and avoid extra allocations/syscalls.
/**
 * Inserts a file candidate into a descending "top files" list, keeping it capped to `limit`.
 * @param topFiles - Mutable descending list of top files.
 * @param candidate - Candidate file.
 * @param limit - Maximum number of items to keep.
 * @returns void
 */
function pushTopFile(topFiles: TopFile[], candidate: TopFile, limit: number): void {
	if (limit <= 0 || candidate.bytes <= 0) return;

	// Empty array
	if (topFiles.length === 0) {
		topFiles.push(candidate);
		return;
	}

	// List is full: check if it can enter (array is sorted desc)
	if (topFiles.length >= limit) {
		const last = topFiles[topFiles.length - 1];
		if (candidate.bytes <= last.bytes) return;
		// Drop the smallest so insertion is always safe and the cap stays constant
		topFiles.pop();
	}

	// Find insertion point and insert (keep descending order)
	let insertAt = topFiles.length;
	for (let i = 0; i < topFiles.length; i++) {
		if (candidate.bytes > topFiles[i].bytes) {
			insertAt = i;
			break;
		}
	}

	if (insertAt === topFiles.length) topFiles.push(candidate);
	else topFiles.splice(insertAt, 0, candidate);

	// Safety: shouldn't be needed, but protects against future changes
	if (topFiles.length > limit) topFiles.length = limit;
}

/**
 * Stats a file and returns its size (0 on error).
 * @param runLimited - Concurrency limiter for filesystem operations.
 * @param fullPath - Absolute file path.
 * @returns File size in bytes, or 0 on error.
 */
async function statFileSize(runLimited: ConcurrencyLimiter, fullPath: string): Promise<number> {
	try {
		const stats = await runLimited(() => fs.stat(fullPath));
		return stats.size;
	} catch {
		return 0;
	}
}

/**
 * Reads directory entries using `readdir({ withFileTypes: true })`.
 * @param runLimited - Concurrency limiter for filesystem operations.
 * @param currentPath - Directory path.
 * @returns Directory entries.
 */
async function readDirEntries(
	runLimited: ConcurrencyLimiter,
	currentPath: string
): Promise<ReadonlyArray<import('fs').Dirent>> {
	return await runLimited(() => fs.readdir(currentPath, { withFileTypes: true }));
}

/**
 * Reads directory entries and returns undefined on error (counting permission errors as skipped).
 * @param runLimited - Concurrency limiter for filesystem operations.
 * @param currentPath - Directory path.
 * @param state - Runtime scan state (mutated when permissions are denied).
 * @returns Directory entries, or undefined when the directory cannot be read.
 */
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

/**
 * Updates the "top directories" list with the current directory's direct bytes.
 * @param topDirectories - Mutable list of top directories.
 * @param rootPath - Scan root.
 * @param currentPath - Current directory.
 * @param directBytes - Direct bytes under the directory (non-recursive).
 * @param topDirectoriesLimit - Max number of top directories to keep.
 * @returns void
 */
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

// HOT PATH: runs for every stat batch in summary mode; keep it tight.
/**
 * Computes bytes for a batch of file paths in summary mode.
 * @param runLimited - Concurrency limiter for filesystem operations.
 * @param paths - File paths to stat.
 * @returns Batch delta for total bytes.
 */
async function sumFileBatchSummary(
	runLimited: ConcurrencyLimiter,
	paths: ReadonlyArray<string>
): Promise<{
	totalBytesDelta: number;
}> {
	// Summary-only: only total bytes (no per-directory metadata).
	const sizes = await Promise.all(paths.map((p) => statFileSize(runLimited, p)));
	let totalBytesDelta = 0;
	for (const size of sizes) {
		if (size > 0) totalBytesDelta += size;
	}
	return { totalBytesDelta };
}

// HOT PATH: runs for every stat batch in UI mode; keep it tight and allocation-light.
/**
 * Computes bytes and metadata for a batch of file paths in full (UI) mode.
 * @param runLimited - Concurrency limiter for filesystem operations.
 * @param paths - File paths to stat.
 * @param topFilesLimit - Max number of top files to keep for this directory.
 * @returns Batch deltas for total bytes and direct per-directory metadata.
 */
async function sumFileBatchFull(
	runLimited: ConcurrencyLimiter,
	paths: ReadonlyArray<string>,
	topFilesLimit: number
): Promise<{
	totalBytesDelta: number;
	directBytesDelta: number;
	fileCountDelta: number;
	maxFileBytesDelta: number;
	topFilesDelta: TopFile[];
}> {
	// Full: also compute metadata (counts/max/top files) for the UI.
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

		directBytesDelta += size;
		fileCountDelta++;
		if (size > maxFileBytesDelta) maxFileBytesDelta = size;
		pushTopFile(topFilesDelta, { absolutePath: paths[i], name: path.basename(paths[i]), bytes: size }, topFilesLimit);
	}

	return { totalBytesDelta, directBytesDelta, fileCountDelta, maxFileBytesDelta, topFilesDelta };
}

// HOT PATH: per-directory traversal loop; changes here directly impact scan performance and cancellation responsiveness.
/**
 * Scans directory entries, updating the directory queue and producing direct metrics for the directory.
 * @param params - Scan parameters.
 * @returns Direct metrics for the directory (bytes/count/max/top files).
 */
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

	/**
	 * Flushes the current file stat batch and updates totals/metadata.
	 * @returns Promise resolving once the batch is processed.
	 */
	const flushBatch = async (): Promise<void> => {
		// Nothing to flush
		if (fileBatch.length === 0) return;
		const paths = fileBatch;
		fileBatch = [];

		if (isSummaryOnly) {
			// Status bar / summary mode: update only the total
			const { totalBytesDelta } = await sumFileBatchSummary(runLimited, paths);
			state.totalBytes += totalBytesDelta;
			return;
		}

		// UI mode: update total + direct bytes/count/max/top files
		const { totalBytesDelta, directBytesDelta, fileCountDelta, maxFileBytesDelta, topFilesDelta } = await sumFileBatchFull(
			runLimited,
			paths,
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

		// Cancellation: keep it fast (do not flush pending stat work)
		if (cancellationToken.isCancellationRequested) {
			markIncomplete(state, 'cancelled');
			return { directBytes, directFileCount, directMaxFileBytes, topFiles };
		}

		// Do not follow symlinks (avoids cycles and double counting)
		const isSymlink = entry.isSymbolicLink();
		const isDirectory = !isSymlink && entry.isDirectory();
		const isFile = !isSymlink && !isDirectory && entry.isFile();

		if (isSymlink) continue;

		const fullPath = path.join(currentPath, entry.name);

		if (isDirectory) {
			// Directory: enqueue for later scan
			if (!state.stopScheduling) queue.push(fullPath);
			continue;
		}

		// Other (socket, fifo, ...): ignore
		if (!isFile) continue;

		// Limits: check before stat'ing to avoid wasted IO
		if (shouldStop(state, startTime, maxDurationMs, maxDirectories, cancellationToken)) break;

		// File: batch up, then stat in parallel groups
		fileBatch.push(fullPath);
		if (fileBatch.length >= statBatchSize) await flushBatch();
	}

	await flushBatch();
	return { directBytes, directFileCount, directMaxFileBytes, topFiles };
}

// HOT PATH (per-directory): keep it focused, avoid extra IO and expensive path operations.
/**
 * Processes a single directory: reads entries, queues subdirectories, and records direct metrics.
 * @param params - Directory processing parameters.
 * @returns Promise resolving once the directory is processed.
 */
export async function processDirectory(params: {
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
}): Promise<void> {
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

	// Note: these are *direct bytes* (only direct files under `currentPath`, not recursive).
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
