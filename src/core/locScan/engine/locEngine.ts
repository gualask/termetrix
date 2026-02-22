import * as path from 'path';
import type { LOCResult } from '../../../shared/contracts/loc';
import { createLifoArrayQueueDriver, runConcurrentQueue } from '../../shared/runtime/workQueue';
import type { LocScanRequest } from '../locScanRequest';
import { createLocTopFile } from '../metrics/locTopFile';
import { type GitIgnoreRule, loadGitIgnoreRules, loadNestedGitIgnoreRules } from '../filtering/gitignore';
import {
	DEFAULT_LOC_CONCURRENCY,
	LANGUAGE_MAP,
	MAX_FILE_SIZE_BYTES,
	MAX_LOC_CONCURRENCY,
	SOURCE_EXTENSIONS,
} from '../locConfig';
import { countNonEmptyLines } from '../metrics/lineCounter';
import { LocAccumulator } from '../metrics/locAccumulator';
import { LocPathFilter } from '../filtering/locPathFilter';
import { LocTraversalContext } from './locTraversalContext';
import { ConcurrencyLimit } from '../../shared/numericValueObjects';

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
async function scanDirectoryTree(context: LocTraversalContext, maxConcurrency: number, rootRules: GitIgnoreRule[]): Promise<void> {
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
async function scanDirectory(context: LocTraversalContext, dirPath: string, parentRules: GitIgnoreRule[]): Promise<DirItem[]> {
	// HOT PATH: walks many directories/files; keep changes minimal and avoid extra allocations.
	if (context.isCancelled()) return [];

	let entries;
	try {
		entries = await context.fs.readDir(dirPath);
	} catch {
		return [];
	}

	const relativeDir =
		dirPath === context.rootPath ? '' : path.relative(context.rootPath, dirPath);
	if (relativeDir.startsWith('..') || path.isAbsolute(relativeDir)) {
		context.incrementSkipped();
		return [];
	}

	// Load nested .gitignore for this directory and merge with parent rules.
	// The root .gitignore is already in parentRules; only probe subdirectories.
	let effectiveRules = parentRules;
	if (relativeDir !== '') {
		const nestedRules = await loadNestedGitIgnoreRules(dirPath, relativeDir, context.fs);
		if (nestedRules.length > 0) {
			effectiveRules = [...parentRules, ...nestedRules];
		}
	}

	const basePath = dirPath.endsWith('/') || dirPath.endsWith('\\') ? dirPath : dirPath + path.sep;
	const subdirectories: DirItem[] = [];

	for (const entry of entries) {
		if (context.isCancelled()) break;

		const fullPath = basePath + entry.name;
		const relativePath = relativeDir ? relativeDir + path.sep + entry.name : entry.name;

		// Exclude early to avoid unnecessary stat/read work.
		if (context.shouldSkip(relativePath, effectiveRules)) {
			context.incrementSkipped();
			continue;
		}

		if (entry.isDirectory()) {
			subdirectories.push({ dirPath: fullPath, rules: effectiveRules });
			continue;
		}

		if (!entry.isFile()) continue;

		const ext = fastExtname(entry.name);
		if (!SOURCE_EXTENSIONS.has(ext)) {
			context.incrementSkipped();
			continue;
		}

		await processFile(context, fullPath, relativePath, ext);
	}

	return subdirectories;
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
 * Reads, counts, and accumulates LOC for a single source file.
 * Skips files that are empty, oversized, unreadable, or produce zero non-empty lines.
 * @param context - Shared traversal state.
 * @param fullPath - Absolute path to the file.
 * @param relativePath - Path relative to the scan root, used in results.
 * @param ext - File extension (e.g. `.ts`), used for language mapping.
 */
async function processFile(context: LocTraversalContext, fullPath: string, relativePath: string, ext: string): Promise<void> {
	// HOT PATH: called for many files; keep changes minimal and avoid expensive work for skipped files.
	if (context.isCancelled()) return;

	// Check file size (skip large files to avoid memory issues)
	const stat = await tryStat(context, fullPath);
	if (!stat) return;

	if (stat.size === 0 || stat.size > MAX_FILE_SIZE_BYTES) {
		context.incrementSkipped();
		return;
	}

	if (context.isCancelled()) return;
	const content = await tryReadTextFile(context, fullPath);
	if (content === undefined) {
		context.incrementSkipped();
		return;
	}

	const lines = countNonEmptyLines(content);
	if (lines <= 0) return;

	// Stable language key for aggregation.
	const language = LANGUAGE_MAP[ext] ?? ext.slice(1).toUpperCase();
	const countedFile = createLocTopFile({ relativePath, lines, language });
	if (!countedFile) return;
	context.accumulator.addCountedFile(countedFile);
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
