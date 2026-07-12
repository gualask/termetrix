import type { LocTopFile } from '../../../shared/contracts/loc';
import { LANGUAGE_MAP, MAX_FILE_SIZE_BYTES } from '../locConfig';
import { countCodeLines, countNonEmptyLines } from '../metrics/lineCounter';
import { createLocTopFile } from '../metrics/locTopFile';
import type { LocTraversalContext } from './locTraversalContext';

/** A source file queued for counting within the current directory. */
export type PendingLocFile = { fullPath: string; relativePath: string; ext: string };

/**
 * Reads and counts a batch of files in parallel, then accumulates the results
 * in entry order so aggregation stays deterministic regardless of IO timing.
 * @param context - Shared traversal state.
 * @param files - Files to count (at most `LOC_FILE_BATCH_SIZE`).
 */
export async function processFileBatch(context: LocTraversalContext, files: PendingLocFile[]): Promise<void> {
	if (files.length === 0 || context.isCancelled()) return;
	const counted = await Promise.all(files.map((file) => countFile(context, file)));
	for (const file of counted) {
		if (file) context.accumulator.addCountedFile(file);
	}
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
