import * as path from 'path';
import type { ConcurrencyLimiter } from '../../shared/runtime/concurrencyLimiter';
import type { DirEntry, FsPort } from '../../ports/fsPort';
import { CANCELLATION_CHECK_INTERVAL } from './scanEngineConstants';
import { isPermissionDeniedError } from './scanEngineCore';
import { ScanTraversalContext } from './scanTraversalContext';
import { DirectoryDirectMetricsDelta } from '../model/directoryMetrics';

/**
 * Stats a file and returns its size (-1 on error).
 * @param runLimited - Concurrency limiter for filesystem operations.
 * @param fullPath - Absolute file path.
 * @returns File size in bytes, or -1 on error.
 */
async function statFileSize(
	runLimited: ConcurrencyLimiter,
	fs: FsPort,
	fullPath: string,
	incrementSkipped: (count?: number) => void
): Promise<number> {
	try {
		const stats = await runLimited(() => fs.stat(fullPath));
		return stats.size;
	} catch (_error) {
		// Any stat failure means we couldn't account for this file; track it as skipped.
		incrementSkipped(1);
		return -1;
	}
}

/**
 * Reads directory entries and returns undefined on error (counting permission errors as skipped).
 * @param runLimited - Concurrency limiter for filesystem operations.
 * @param currentPath - Directory path.
 * @param context - Traversal context (mutated when permissions are denied).
 * @returns Directory entries, or undefined when the directory cannot be read.
 */
async function tryReadDirEntries(
	runLimited: ConcurrencyLimiter,
	fs: FsPort,
	currentPath: string,
	context: Pick<ScanTraversalContext, 'incrementSkipped'>
): Promise<ReadonlyArray<DirEntry> | undefined> {
	try {
		return await runLimited(() => fs.readDir(currentPath));
	} catch (error) {
		if (isPermissionDeniedError(error)) context.incrementSkipped();
		return undefined;
	}
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
	fs: FsPort,
	paths: ReadonlyArray<string>,
	incrementSkipped: (count?: number) => void,
	chunkSize: number,
	shouldStop: () => boolean
): Promise<number> {
	// Summary-only: only total bytes (no per-directory metadata).
	let totalBytesDelta = 0;
	const limit = Math.max(1, chunkSize);
	for (let start = 0; start < paths.length; start += limit) {
		// Important: allow cancellation/time limits to interrupt large batches (otherwise we could
		// schedule a lot of work after a stop condition has already been reached).
		if (shouldStop()) break;
		const end = Math.min(paths.length, start + limit);
		const chunkPromises: Array<Promise<number>> = new Array(end - start);
		for (let i = start; i < end; i++) {
			chunkPromises[i - start] = statFileSize(runLimited, fs, paths[i], incrementSkipped);
		}
		const sizes = await Promise.all(chunkPromises);
		for (const size of sizes) {
			if (size > 0) totalBytesDelta += size;
		}
	}
	return totalBytesDelta;
}

// HOT PATH: runs for every stat batch in UI mode; keep it tight and allocation-light.
/**
 * Computes bytes and metadata for a batch of file paths in full (UI) mode.
 * @param runLimited - Concurrency limiter for filesystem operations.
 * @param paths - File paths to stat.
 * @returns Batch deltas for total bytes and direct per-directory metadata.
 */
async function sumFileBatchFullInto(
	runLimited: ConcurrencyLimiter,
	fs: FsPort,
	paths: ReadonlyArray<string>,
	directoryDelta: DirectoryDirectMetricsDelta,
	incrementSkipped: (count?: number) => void,
	chunkSize: number,
	shouldStop: () => boolean
): Promise<number> {
	// Full: also compute metadata (counts/max/top files) for the UI.
	let totalBytesDelta = 0;
	const limit = Math.max(1, chunkSize);
	for (let start = 0; start < paths.length; start += limit) {
		// Same reasoning as summary mode: check stop between chunks to keep cancel latency bounded.
		if (shouldStop()) break;
		const end = Math.min(paths.length, start + limit);
		const chunkPromises: Array<Promise<number>> = new Array(end - start);
		for (let i = start; i < end; i++) {
			chunkPromises[i - start] = statFileSize(runLimited, fs, paths[i], incrementSkipped);
		}
		const sizes = await Promise.all(chunkPromises);
		for (let i = start; i < end; i++) {
			const size = sizes[i - start];
			if (size > 0) totalBytesDelta += size;
			// Only pass valid sizes into the metrics accumulator; stat failures are accounted via `skippedCount`.
			if (size >= 0) directoryDelta.addFile(paths[i], size);
		}
	}
	return totalBytesDelta;
}

// HOT PATH: per-directory traversal loop; changes here directly impact scan performance and cancellation responsiveness.
/**
 * Scans directory entries, updating the directory queue and producing direct metrics for the directory.
 * @param params - Scan parameters.
 * @returns Direct metrics for the directory (bytes/count/max/top files).
 */
async function scanDirectoryEntries(params: {
	entries: ReadonlyArray<DirEntry>;
	currentPath: string;
	context: ScanTraversalContext;
}): Promise<DirectoryDirectMetricsDelta> {
	const { entries, currentPath, context } = params;
	const { runLimited, fs, statBatchSize, isSummaryOnly, maxFsConcurrency } = context;
	const incrementSkipped = (count?: number) => context.incrementSkipped(count);
	const directoryDelta = new DirectoryDirectMetricsDelta();
	let fileBatch: string[] = [];
	const basePath =
		currentPath.endsWith('/') || currentPath.endsWith('\\') ? currentPath : currentPath + path.sep;
	// Chunk stat scheduling to limit peak Promise/microtask pressure in huge directories.
	// We still allow up to `maxFsConcurrency` in-flight operations overall via `runLimited`.
	const statChunkSize = Math.max(1, maxFsConcurrency);

	/**
	 * Flushes the current file stat batch and updates totals/metadata.
	 * @returns Promise resolving once the batch is processed.
	 */
	const flushBatch = async (): Promise<void> => {
		// Nothing to flush
		if (fileBatch.length === 0) return;
		const paths = fileBatch;
		fileBatch = [];
		// If we already hit a stop condition, drop the batch rather than doing more IO.
		if (context.shouldStop()) return;

		if (isSummaryOnly) {
			// Status bar / summary mode: update only the total
			const totalBytesDelta = await sumFileBatchSummary(
				runLimited,
				fs,
				paths,
				incrementSkipped,
				statChunkSize,
				() => context.shouldStop()
			);
			context.addTotalBytes(totalBytesDelta);
			return;
		}

		// UI mode: update total + direct bytes/count/max/top files
		const totalBytesDelta = await sumFileBatchFullInto(
			runLimited,
			fs,
			paths,
			directoryDelta,
			incrementSkipped,
			statChunkSize,
			() => context.shouldStop()
		);
		context.addTotalBytes(totalBytesDelta);
	};

	let entryCounter = 0;
	for (const entry of entries) {
		if (context.isStopScheduled()) break;

		// Stop checks (time/dir/cancel) are amortized to avoid `Date.now()` on every entry.
		if (++entryCounter % CANCELLATION_CHECK_INTERVAL === 0 && context.shouldStop()) {
			break;
		}

		// Do not follow symlinks (avoids cycles and double counting)
		const isSymlink = entry.isSymbolicLink();
		const isDirectory = !isSymlink && entry.isDirectory();
		const isFile = !isSymlink && !isDirectory && entry.isFile();

		if (isSymlink) continue;

		const fullPath = basePath + entry.name;

		if (isDirectory) {
			// Directory: enqueue for later scan
			context.enqueueDirectory(fullPath);
			continue;
		}

		// Other (socket, fifo, ...): ignore
		if (!isFile) continue;

		// File: batch up, then stat in parallel groups
		fileBatch.push(fullPath);
		if (fileBatch.length >= statBatchSize) await flushBatch();
	}

	await flushBatch();
	return directoryDelta;
}

// HOT PATH (per-directory): keep it focused, avoid extra IO and expensive path operations.
/**
 * Processes a single directory: reads entries, queues subdirectories, and records direct metrics.
 * @param currentPath - Directory being processed.
 * @param context - Shared traversal context.
 * @returns Promise resolving once the directory is processed.
 */
export async function processDirectory(currentPath: string, context: ScanTraversalContext): Promise<void> {
	const {
		runLimited,
		fs,
		isSummaryOnly,
		directoryMetricsStore,
	} =
		context;

	if (context.shouldStop()) return;

	const entries = await tryReadDirEntries(runLimited, fs, currentPath, context);
	if (!entries) return;

	// Note: these are *direct bytes* (only direct files under `currentPath`, not recursive).
	const directoryDelta = await scanDirectoryEntries({
		entries,
		currentPath,
		context,
	});

	if (isSummaryOnly || !directoryDelta.hasDirectMetrics()) return;

	directoryMetricsStore?.record(currentPath, directoryDelta);
}
