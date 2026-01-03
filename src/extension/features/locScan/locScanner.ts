import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Stats } from 'fs';
import type { LOCResult } from '../../types';
import { isGitIgnored, loadGitIgnoreRules, type GitIgnoreRule } from './gitignore';
import {
	DEFAULT_EXCLUDES,
	LANGUAGE_MAP,
	MAX_FILE_SIZE_BYTES,
	SOURCE_EXTENSIONS,
	TOP_FILES_LIMIT,
} from './locConfig';
import { countNonEmptyLines } from './lineCounter';

/**
 * Scanner for counting lines of code in source files
 */
export class LOCScanner {
	private readonly excludePatterns: RegExp[];

	constructor() {
		// Default exclusions - matches common build/dependency directories
		this.excludePatterns = DEFAULT_EXCLUDES.map(
			(pattern) => new RegExp(`(^|[\\/])${pattern}($|[\\/])`)
		);
	}

	/**
	 * Scan a directory tree and count lines of code
	 * @param rootPath - Root directory to scan
	 * @param token - Optional cancellation token
	 */
	async scan(rootPath: string, token?: vscode.CancellationToken): Promise<LOCResult> {
		const result: LOCResult = {
			totalLines: 0,
			byLanguage: {},
			topFiles: [],
			scannedFiles: 0,
			skippedFiles: 0,
		};

		// Load ignore rules once, then reuse during traversal.
		const gitignoreRules = await loadGitIgnoreRules(rootPath);
		await this.scanDirectory({ rootPath, dirPath: rootPath, result, gitignoreRules, token });

		// Sort and limit top files
		result.topFiles.sort((a, b) => b.lines - a.lines);
		result.topFiles = result.topFiles.slice(0, TOP_FILES_LIMIT);

		return result;
	}

	/**
	 * Recursively scan a directory
	 */
	private async scanDirectory(params: {
		rootPath: string;
		dirPath: string;
		result: LOCResult;
		gitignoreRules: GitIgnoreRule[];
		token?: vscode.CancellationToken;
	}): Promise<void> {
		// HOT PATH: walks many directories/files; keep changes minimal and avoid extra allocations.
		const { rootPath, dirPath, result, gitignoreRules, token } = params;
		if (token?.isCancellationRequested) return;

		let dir;
		try {
			dir = await fs.opendir(dirPath);
		} catch {
			return;
		}

		for await (const entry of dir) {
			if (token?.isCancellationRequested) break;

			const fullPath = path.join(dirPath, entry.name);
			const relativePath = path.relative(rootPath, fullPath);

			// Exclude early to avoid unnecessary stat/read work.
			if (this.shouldSkip(relativePath, gitignoreRules, result)) continue;

			if (entry.isDirectory()) {
				await this.scanDirectory({ rootPath, dirPath: fullPath, result, gitignoreRules, token });
				continue;
			}

			if (!entry.isFile()) continue;
			await this.processFile(fullPath, relativePath, result);
		}
	}

	/**
	 * Check if a path matches exclusion patterns
	 */
	private isExcluded(relativePath: string): boolean {
		return this.excludePatterns.some((pattern) => pattern.test(relativePath));
	}

	private shouldSkip(relativePath: string, rules: GitIgnoreRule[], result: LOCResult): boolean {
		if (!this.isExcluded(relativePath) && !isGitIgnored(relativePath, rules)) return false;
		result.skippedFiles++;
		return true;
	}

	/**
	 * Process a single file and count its lines
	 */
	private async processFile(fullPath: string, relativePath: string, result: LOCResult): Promise<void> {
		// HOT PATH: called for many files; keep changes minimal and avoid expensive work for skipped files.
		const ext = path.extname(fullPath);

		// Only process source files
		if (!SOURCE_EXTENSIONS.has(ext)) {
			result.skippedFiles++;
			return;
		}

		// Check file size (skip large files to avoid memory issues)
		const stat = await this.tryStat(fullPath);
		if (!stat) return;

		if (stat.size === 0 || stat.size > MAX_FILE_SIZE_BYTES) {
			result.skippedFiles++;
			return;
		}

		const content = await this.tryReadTextFile(fullPath);
		if (content === undefined) {
			result.skippedFiles++;
			return;
		}

		const lines = countNonEmptyLines(content);
		if (lines <= 0) return;

		// Stable language key for aggregation.
		const language = LANGUAGE_MAP[ext] ?? ext.slice(1).toUpperCase();

		result.totalLines += lines;
		result.byLanguage[language] = (result.byLanguage[language] ?? 0) + lines;
		result.topFiles.push({ path: relativePath, lines, language });
		result.scannedFiles++;
	}

	private async tryStat(fullPath: string): Promise<Stats | undefined> {
		try {
			return await fs.stat(fullPath);
		} catch {
			return undefined;
		}
	}

	private async tryReadTextFile(fullPath: string): Promise<string | undefined> {
		try {
			return await fs.readFile(fullPath, 'utf8');
		} catch {
			return undefined;
		}
	}
}
