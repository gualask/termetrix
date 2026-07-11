import * as path from 'node:path';
import type { LOCResult, LocTopFile } from '../../../shared/contracts/loc';
import type { DirEntry } from '../../ports/fsPort';
import { ConcurrencyLimit } from '../../shared/numericValueObjects';
import { createLifoArrayQueueDriver, runConcurrentQueue } from '../../shared/runtime/workQueue';
import { type GitIgnoreRule, loadGitIgnoreRules, loadNestedGitIgnoreRules } from '../filtering/gitignore';
import { LocPathFilter } from '../filtering/locPathFilter';
import {
	DEFAULT_LOC_CONCURRENCY,
	LANGUAGE_MAP,
	LOC_FILE_BATCH_SIZE,
	MAX_FILE_SIZE_BYTES,
	MAX_LOC_CONCURRENCY,
	SOURCE_EXTENSIONS,
} from '../locConfig';
import type { LocScanRequest } from '../locScanRequest';
import { countCodeLines, countNonEmptyLines } from '../metrics/lineCounter';
import { LocAccumulator } from '../metrics/locAccumulator';
import { createLocTopFile } from '../metrics/locTopFile';
import { LocTraversalContext } from './locTraversalContext';

/**
 * File-system LOC scan engine (no VS Code dependencies).
 * Single responsibility: traverse the filesystem and compute LOCResult.
 */
export async function scanLOC(params: LocScanRequest): Promise<LOCResult> {
	const { rootPath, fs, cancellationToken, maxConcurrency } = params;
	const pathFilter = params.pathFilter ?? new LocPathFilter();
	const accumulator = new LocAccumulator();
	const concurrency = ConcurrencyLimit.bounded(maxConcurrency, DEFAULT_LOC_CONCURRENCY, 1, MAX_LOC_CONCURRENCY).value;

	const rootRules = await loadGitIgnoreRules(rootPath, fs);
	const context = new LocTraversalContext({
		rootPath,
		accumulator,
		cancellationToken,
		pathFilter,
		fs,
	});
	await scanDirectoryTree(context, concurrency, rootRules);

	return accumulator.finalize();
}

/** A pending directory together with the gitignore rules in effect at that point in the tree. */
type DirItem = { dirPath: string; rules: GitIgnoreRule[] };

/**
 * Drives the concurrent directory traversal, seeding the queue with the root directory.
 * @param context - Shared traversal state.
 * @param maxConcurrency - Maximum number of concurrent directory scans.
 * @param rootRules - Compiled rules from the root `.gitignore`.
 */
async function scanDirectoryTree(
	context: LocTraversalContext,
	maxConcurrency: number,
	rootRules: GitIgnoreRule[],
): Promise<void> {
	if (context.isCancelled()) return;
	const queue: DirItem[] = [{ dirPath: context.rootPath, rules: rootRules }];
	await runConcurrentQueue<DirItem>({
		driver: createLifoArrayQueueDriver({
			queue,
			shouldStop: () => context.isCancelled(),
			isStopScheduled: () => context.isCancelled(),
		}),
		maxConcurrency,
		runOne: async (item) => {
			const subdirectories = await scanDirectory(context, item.dirPath, item.rules);
			if (context.isCancelled()) return;
			for (const sub of subdirectories) queue.push(sub);
		},
	});
}

/**
 * Scans a single directory: filters entries, counts lines in source files, and
 * returns subdirectories with their effective gitignore rules for further traversal.
 * @param context - Shared traversal state.
 * @param dirPath - Absolute path of the directory to scan.
 * @param parentRules - Gitignore rules inherited from the parent directory.
 * @returns Subdirectory items to enqueue, each carrying the effective rules for that subtree.
 */
async function scanDirectory(
	context: LocTraversalContext,
	dirPath: string,
	parentRules: GitIgnoreRule[],
): Promise<DirItem[]> {
	// HOT PATH: walks many directories/files; keep changes minimal and avoid extra allocations.
	if (context.isCancelled()) return [];

	let entries: ReadonlyArray<DirEntry>;
	try {
		entries = await context.fs.readDir(dirPath);
	} catch {
		return [];
	}

	const relativeDir = dirPath === context.rootPath ? '' : path.relative(context.rootPath, dirPath);
	if (relativeDir.startsWith('..') || path.isAbsolute(relativeDir)) {
		context.incrementSkipped();
		return [];
	}

	// Load nested .gitignore for this directory and merge with parent rules.
	// The root .gitignore is already in parentRules; only probe subdirectories,
	// and only when the entry listing shows a .gitignore actually exists
	// (avoids one failed readFile syscall for every directory without one).
	let effectiveRules = parentRules;
	if (relativeDir !== '' && hasOwnGitIgnore(entries)) {
		const nestedRules = await loadNestedGitIgnoreRules(dirPath, relativeDir, context.fs);
		if (nestedRules.length > 0) {
			effectiveRules = [...parentRules, ...nestedRules];
		}
	}

	const basePath = dirPath.endsWith('/') || dirPath.endsWith('\\') ? dirPath : dirPath + path.sep;
	const subdirectories: DirItem[] = [];
	let fileBatch: PendingLocFile[] = [];

	for (const entry of entries) {
		if (context.isCancelled()) break;

		const fullPath = basePath + entry.name;
		const relativePath = relativeDir ? relativeDir + path.sep + entry.name : entry.name;
		const isDirectory = entry.isDirectory();

		// Exclude early to avoid unnecessary stat/read work.
		if (context.shouldSkip(relativePath, effectiveRules, isDirectory)) {
			context.incrementSkipped();
			continue;
		}

		if (isDirectory) {
			subdirectories.push({ dirPath: fullPath, rules: effectiveRules });
			continue;
		}

		if (!entry.isFile()) continue;

		const ext = fastExtname(entry.name);
		if (!SOURCE_EXTENSIONS.has(ext)) {
			context.incrementSkipped();
			continue;
		}

		// Batch files so stat/read run in parallel; large flat directories would
		// otherwise degrade to one sequential stat+read per file.
		fileBatch.push({ fullPath, relativePath, ext });
		if (fileBatch.length >= LOC_FILE_BATCH_SIZE) {
			const batch = fileBatch;
			fileBatch = [];
			await processFileBatch(context, batch);
		}
	}

	await processFileBatch(context, fileBatch);
	return subdirectories;
}

/**
 * Returns true when the directory listing contains a `.gitignore` entry.
 * Symlinked `.gitignore` files count too (`isFile()` is false for symlinks).
 */
function hasOwnGitIgnore(entries: ReadonlyArray<DirEntry>): boolean {
	for (const entry of entries) {
		if (entry.name === '.gitignore' && !entry.isDirectory()) return true;
	}
	return false;
}

/** A source file queued for counting within the current directory. */
type PendingLocFile = { fullPath: string; relativePath: string; ext: string };

/**
 * Reads and counts a batch of files in parallel, then accumulates the results
 * in entry order so aggregation stays deterministic regardless of IO timing.
 * @param context - Shared traversal state.
 * @param files - Files to count (at most `LOC_FILE_BATCH_SIZE`).
 */
async function processFileBatch(context: LocTraversalContext, files: PendingLocFile[]): Promise<void> {
	if (files.length === 0 || context.isCancelled()) return;
	const counted = await Promise.all(files.map((file) => countFile(context, file)));
	for (const file of counted) {
		if (file) context.accumulator.addCountedFile(file);
	}
}

/**
 * Extracts the file extension including the leading dot (e.g. `.ts`).
 * Faster than `path.extname` by avoiding path-separator logic.
 * Returns an empty string for names without an extension.
 * @param fileName - Bare file name (no directory components).
 */
function fastExtname(fileName: string): string {
	const lastDot = fileName.lastIndexOf('.');
	if (lastDot <= 0) return '';
	if (lastDot === fileName.length - 1) return '.';
	return fileName.slice(lastDot);
}

/**
 * Reads and counts LOC for a single source file, returning the counted file.
 * Returns `undefined` (and tracks skips) for files that are empty, oversized,
 * unreadable, or produce zero non-empty lines. The caller accumulates results.
 * @param context - Shared traversal state.
 * @param file - File to count (paths and extension).
 */
async function countFile(context: LocTraversalContext, file: PendingLocFile): Promise<LocTopFile | undefined> {
	// HOT PATH: called for many files; keep changes minimal and avoid expensive work for skipped files.
	if (context.isCancelled()) return undefined;
	const { fullPath, relativePath, ext } = file;

	// Check file size (skip large files to avoid memory issues)
	const stat = await tryStat(context, fullPath);
	if (!stat) return undefined;

	if (stat.size === 0 || stat.size > MAX_FILE_SIZE_BYTES) {
		context.incrementSkipped();
		return undefined;
	}

	if (context.isCancelled()) return undefined;
	const content = await tryReadTextFile(context, fullPath);
	if (content === undefined) {
		context.incrementSkipped();
		return undefined;
	}

	const langDef = LANGUAGE_MAP[ext];
	const lines = langDef?.comments ? countCodeLines(content, langDef.comments) : countNonEmptyLines(content);
	if (lines <= 0) return undefined;

	// Stable language key for aggregation.
	const language = langDef?.name ?? ext.slice(1).toUpperCase();
	return createLocTopFile({ relativePath, lines, language });
}

/**
 * Returns the stat of `fullPath`, or `undefined` on any error (e.g. permission denied).
 * @param context - Shared traversal state providing the filesystem port.
 * @param fullPath - Absolute path to stat.
 */
async function tryStat(context: LocTraversalContext, fullPath: string): Promise<{ size: number } | undefined> {
	try {
		return await context.fs.stat(fullPath);
	} catch {
		return undefined;
	}
}

/**
 * Reads `fullPath` as UTF-8 text, or returns `undefined` on any error.
 * @param context - Shared traversal state providing the filesystem port.
 * @param fullPath - Absolute path to read.
 */
async function tryReadTextFile(context: LocTraversalContext, fullPath: string): Promise<string | undefined> {
	try {
		return await context.fs.readFile(fullPath, 'utf8');
	} catch {
		return undefined;
	}
}
