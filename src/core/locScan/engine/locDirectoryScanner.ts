import * as path from 'node:path';
import type { DirEntry } from '../../ports/fsPort';
import { type GitIgnoreRule, loadNestedGitIgnoreRules } from '../filtering/gitignore';
import { LOC_FILE_BATCH_SIZE, SOURCE_EXTENSIONS } from '../locConfig';
import { type PendingLocFile, processFileBatch } from './locFileCounter';
import type { LocTraversalContext } from './locTraversalContext';

/** A pending directory together with the gitignore rules in effect at that point in the tree. */
export type DirItem = { dirPath: string; rules: GitIgnoreRule[] };

/**
 * Scans a single directory: filters entries, counts lines in source files, and
 * returns subdirectories with their effective gitignore rules for further traversal.
 * @param context - Shared traversal state.
 * @param dirPath - Absolute path of the directory to scan.
 * @param parentRules - Gitignore rules inherited from the parent directory.
 * @returns Subdirectory items to enqueue, each carrying the effective rules for that subtree.
 */
export async function scanDirectory(
	context: LocTraversalContext,
	dirPath: string,
	parentRules: GitIgnoreRule[],
): Promise<DirItem[]> {
	// HOT PATH: walks many directories/files; keep changes minimal and avoid extra allocations.
	if (context.isCancelled()) return [];

	const entries = await tryReadDirectory(context, dirPath);
	if (!entries) return [];

	const relativeDir = getRelativeDirectory(context.rootPath, dirPath);
	if (relativeDir === undefined) {
		context.incrementSkipped();
		return [];
	}

	const effectiveRules = await getEffectiveGitIgnoreRules(context, dirPath, relativeDir, entries, parentRules);
	return scanDirectoryEntries(context, dirPath, relativeDir, entries, effectiveRules);
}

async function tryReadDirectory(
	context: LocTraversalContext,
	dirPath: string,
): Promise<ReadonlyArray<DirEntry> | undefined> {
	try {
		return await context.fs.readDir(dirPath);
	} catch {
		return undefined;
	}
}

function getRelativeDirectory(rootPath: string, dirPath: string): string | undefined {
	const relativeDir = dirPath === rootPath ? '' : path.relative(rootPath, dirPath);
	if (relativeDir.startsWith('..') || path.isAbsolute(relativeDir)) return undefined;
	return relativeDir;
}

async function getEffectiveGitIgnoreRules(
	context: LocTraversalContext,
	dirPath: string,
	relativeDir: string,
	entries: ReadonlyArray<DirEntry>,
	parentRules: GitIgnoreRule[],
): Promise<GitIgnoreRule[]> {
	// The root rules are already present. Probe nested files only when the directory listing proves one exists.
	if (relativeDir === '' || !hasOwnGitIgnore(entries)) return parentRules;

	const nestedRules = await loadNestedGitIgnoreRules(dirPath, relativeDir, context.fs);
	return nestedRules.length > 0 ? [...parentRules, ...nestedRules] : parentRules;
}

async function scanDirectoryEntries(
	context: LocTraversalContext,
	dirPath: string,
	relativeDir: string,
	entries: ReadonlyArray<DirEntry>,
	effectiveRules: GitIgnoreRule[],
): Promise<DirItem[]> {
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
