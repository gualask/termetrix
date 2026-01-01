import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
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
	private excludePatterns: RegExp[];

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

		const gitignoreRules = await loadGitIgnoreRules(rootPath);
		await this.scanDirectory(rootPath, rootPath, result, gitignoreRules, token);

		// Sort and limit top files to 10
		result.topFiles.sort((a, b) => b.lines - a.lines);
		result.topFiles = result.topFiles.slice(0, TOP_FILES_LIMIT);

		return result;
	}

	/**
	 * Recursively scan a directory
	 */
	private async scanDirectory(
		rootPath: string,
		dirPath: string,
		result: LOCResult,
		gitignoreRules: GitIgnoreRule[],
		token?: vscode.CancellationToken
	): Promise<void> {
		if (token?.isCancellationRequested) return;

		let entries;
		try {
			entries = await fs.opendir(dirPath);
		} catch {
			return;
		}

		for await (const entry of entries) {
			if (token?.isCancellationRequested) break;

			const fullPath = path.join(dirPath, entry.name);
			const relativePath = path.relative(rootPath, fullPath);

			// Check exclusions
			if (this.isExcluded(relativePath) || isGitIgnored(relativePath, gitignoreRules)) {
				result.skippedFiles++;
				continue;
			}

			if (entry.isDirectory()) {
				await this.scanDirectory(rootPath, fullPath, result, gitignoreRules, token);
				continue;
			}

			if (entry.isFile()) {
				await this.processFile(fullPath, relativePath, result);
			}
		}
	}

	/**
	 * Check if a path matches exclusion patterns
	 */
	private isExcluded(relativePath: string): boolean {
		return this.excludePatterns.some((pattern) => pattern.test(relativePath));
	}

	/**
	 * Process a single file and count its lines
	 */
	private async processFile(fullPath: string, relativePath: string, result: LOCResult): Promise<void> {
		const ext = path.extname(fullPath);

		// Only process source files
		if (!SOURCE_EXTENSIONS.has(ext)) {
			result.skippedFiles++;
			return;
		}

		// Check file size (skip files > 2MB to avoid memory issues)
		let stat;
		try {
			stat = await fs.stat(fullPath);
		} catch {
			return;
		}

		if (stat.size === 0 || stat.size > MAX_FILE_SIZE_BYTES) {
			result.skippedFiles++;
			return;
		}

		// Read and count lines
		let content;
		try {
			content = await fs.readFile(fullPath, 'utf8');
		} catch {
			result.skippedFiles++;
			return;
		}

		const lines = countNonEmptyLines(content);

		if (lines > 0) {
			const language = LANGUAGE_MAP[ext] || ext.slice(1).toUpperCase();

			result.totalLines += lines;
			result.byLanguage[language] = (result.byLanguage[language] || 0) + lines;
			result.topFiles.push({ path: relativePath, lines, language });
			result.scannedFiles++;
		}
	}
}
