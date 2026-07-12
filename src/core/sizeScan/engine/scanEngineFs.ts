import * as path from 'node:path';
import type { DirEntry } from '../../ports/fsPort';
import { DirectoryDirectMetricsDelta } from '../model/directoryMetrics';
import { CANCELLATION_CHECK_INTERVAL } from './scanEngineConstants';
import { isPermissionDeniedError } from './scanEngineCore';
import type { ScanTraversalContext } from './scanTraversalContext';

/**
 * Stats a file and returns its size (-1 on error).
 * @param context - Traversal context providing filesystem access and skip accounting.
 * @param fullPath - Absolute file path.
 * @returns File size in bytes, or -1 on error.
 */
async function statFileSize(
	context: Pick<ScanTraversalContext, 'runLimited' | 'fs' | 'incrementSkipped'>,
	fullPath: string,
): Promise<number> {
	try {
		const stats = await context.runLimited(() => context.fs.stat(fullPath));
		return stats.size;
	} catch (_error) {
		// Any stat failure means we couldn't account for this file; track it as skipped.
		context.incrementSkipped(1);
		return -1;
	}
}

/**
 * Reads directory entries and returns undefined on error (counting permission errors as skipped).
 * @param currentPath - Directory path.
 * @param context - Traversal context (mutated when permissions are denied).
 * @returns Directory entries, or undefined when the directory cannot be read.
 */
async function tryReadDirEntries(
	currentPath: string,
	context: Pick<ScanTraversalContext, 'runLimited' | 'fs' | 'incrementSkipped'>,
): Promise<ReadonlyArray<DirEntry> | undefined> {
	try {
		return await context.runLimited(() => context.fs.readDir(currentPath));
	} catch (error) {
		if (isPermissionDeniedError(error)) context.incrementSkipped();
		return undefined;
	}
}

// HOT PATH: runs for every stat batch; keep it tight and allocation-light.
/**
 * Computes bytes and metadata for a batch of file paths.
 * @param context - Traversal context providing filesystem access and stop checks.
 * @param paths - File paths to stat.
 * @returns Batch deltas for total bytes and direct per-directory metadata.
 */
async function sumFileBatchIntoDirectoryMetrics(
	context: ScanTraversalContext,
	paths: ReadonlyArray<string>,
	directoryDelta: DirectoryDirectMetricsDelta,
	chunkSize: number,
): Promise<number> {
	let totalBytesDelta = 0;
	const limit = Math.max(1, chunkSize);
	for (let start = 0; start < paths.length; start += limit) {
		// Check stop between chunks to keep cancel latency bounded.
		if (context.shouldStop()) break;
		const end = Math.min(paths.length, start + limit);
		const chunkPromises: Array<Promise<number>> = new Array(end - start);
		for (let i = start; i < end; i++) {
			chunkPromises[i - start] = statFileSize(context, paths[i]);
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

async function flushFileBatch(
	context: ScanTraversalContext,
	paths: ReadonlyArray<string>,
	directoryDelta: DirectoryDirectMetricsDelta,
	chunkSize: number,
): Promise<void> {
	if (paths.length === 0 || context.shouldStop()) return;
	const totalBytesDelta = await sumFileBatchIntoDirectoryMetrics(context, paths, directoryDelta, chunkSize);
	context.addTotalBytes(totalBytesDelta);
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
	const { statBatchSize, maxFsConcurrency } = context;
	const directoryDelta = new DirectoryDirectMetricsDelta();
	let fileBatch: string[] = [];
	const basePath = currentPath.endsWith('/') || currentPath.endsWith('\\') ? currentPath : currentPath + path.sep;
	// Chunk stat scheduling to limit peak Promise/microtask pressure in huge directories.
	// We still allow up to `maxFsConcurrency` in-flight operations overall via `runLimited`.
	const statChunkSize = Math.max(1, maxFsConcurrency);

	let entryCounter = 0;
	for (const entry of entries) {
		if (context.isStopScheduled()) break;

		// Stop checks (time/dir/cancel) are amortized to avoid `Date.now()` on every entry.
		if (++entryCounter % CANCELLATION_CHECK_INTERVAL === 0 && context.shouldStop()) {
			break;
		}

		// Do not follow symlinks (avoids cycles and double counting).
		if (entry.isSymbolicLink()) continue;

		const fullPath = basePath + entry.name;

		if (entry.isDirectory()) {
			// Directory: enqueue for later scan
			context.enqueueDirectory(fullPath);
			continue;
		}

		// Other (socket, fifo, ...): ignore
		if (!entry.isFile()) continue;

		// File: batch up, then stat in parallel groups
		fileBatch.push(fullPath);
		if (fileBatch.length >= statBatchSize) {
			const paths = fileBatch;
			fileBatch = [];
			await flushFileBatch(context, paths, directoryDelta, statChunkSize);
		}
	}

	await flushFileBatch(context, fileBatch, directoryDelta, statChunkSize);
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
	const { directoryMetricsStore } = context;

	if (context.shouldStop()) return;

	const entries = await tryReadDirEntries(currentPath, context);
	if (!entries) return;

	// Note: these are *direct bytes* (only direct files under `currentPath`, not recursive).
	const directoryDelta = await scanDirectoryEntries({
		entries,
		currentPath,
		context,
	});

	if (!directoryDelta.hasDirectMetrics()) return;

	directoryMetricsStore.record(currentPath, directoryDelta);
}
