import * as fs from 'fs/promises';
import * as path from 'path';
import type { ConcurrencyLimiter } from '../../common/concurrencyLimiter';
import type { ScanRuntimeState, SizeScanCancellationToken, TopFile } from './scanEngineTypes';
import { isPermissionDeniedError, markIncomplete, shouldStop } from './scanEngineCore';

// Keep a small shortlist of the largest direct files per directory.
// This is used to populate the UI "large files" list without re-scanning.
const TOP_FILE_CANDIDATES_PER_DIRECTORY = 20;

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

