import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { LOCResult } from '../../types';

/**
 * Source file extensions considered for LOC counting
 */
const SOURCE_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.py',
	'.pyw',
	'.go',
	'.rs',
	'.java',
	'.kt',
	'.scala',
	'.c',
	'.cpp',
	'.cc',
	'.h',
	'.hpp',
	'.cs',
	'.rb',
	'.php',
	'.swift',
	'.vue',
	'.svelte',
	'.css',
	'.scss',
	'.sass',
	'.less',
	'.html',
	'.htm',
	'.sql',
	'.sh',
	'.bash',
]);

/**
 * Map file extensions to human-readable language names
 */
const LANGUAGE_MAP: Record<string, string> = {
	'.ts': 'TypeScript',
	'.tsx': 'TypeScript',
	'.js': 'JavaScript',
	'.jsx': 'JavaScript',
	'.mjs': 'JavaScript',
	'.cjs': 'JavaScript',
	'.py': 'Python',
	'.pyw': 'Python',
	'.go': 'Go',
	'.rs': 'Rust',
	'.java': 'Java',
	'.kt': 'Kotlin',
	'.scala': 'Scala',
	'.c': 'C',
	'.cpp': 'C++',
	'.cc': 'C++',
	'.h': 'C/C++',
	'.hpp': 'C++',
	'.cs': 'C#',
	'.rb': 'Ruby',
	'.php': 'PHP',
	'.swift': 'Swift',
	'.vue': 'Vue',
	'.svelte': 'Svelte',
	'.css': 'CSS',
	'.scss': 'SCSS',
	'.sass': 'Sass',
	'.less': 'Less',
	'.html': 'HTML',
	'.htm': 'HTML',
	'.sql': 'SQL',
	'.sh': 'Shell',
	'.bash': 'Shell',
};

/**
 * Scanner for counting lines of code in source files
 */
export class LOCScanner {
	private excludePatterns: RegExp[];

	constructor() {
		// Default exclusions - matches common build/dependency directories
		const excludes = ['node_modules', '.git', 'dist', 'out', 'build', '.vscode', 'coverage'];
		this.excludePatterns = excludes.map(
			(pattern) => new RegExp(`(^|[\\/])${pattern}($|[\\/])`)
		);
	}

	private toPosixPath(value: string): string {
		return value.replace(/\\/g, '/');
	}

	private async loadGitIgnoreRules(rootPath: string): Promise<Array<{ negated: boolean; regex: RegExp }>> {
		const gitignorePath = path.join(rootPath, '.gitignore');

		let content = '';
		try {
			content = await fs.readFile(gitignorePath, 'utf8');
		} catch {
			return [];
		}

		const globToRegex = (pattern: string): string => {
			let out = '';
			for (let i = 0; i < pattern.length; i++) {
				const c = pattern[i];

				// Escape sequences
				if (c === '\\' && i + 1 < pattern.length) {
					const next = pattern[++i];
					out += next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
					continue;
				}

				if (c === '*') {
					if (pattern[i + 1] === '*') {
						// Collapse any run of ** into a single .*
						while (pattern[i + 1] === '*') i++;
						out += '.*';
					} else {
						out += '[^/]*';
					}
					continue;
				}

				if (c === '?') {
					out += '[^/]';
					continue;
				}

				// Escape regex special chars
				if (/[.*+?^${}()|[\]\\]/.test(c)) {
					out += '\\' + c;
				} else {
					out += c;
				}
			}
			return out;
		};

		const rules: Array<{ negated: boolean; regex: RegExp }> = [];

		for (const rawLine of content.split(/\r?\n/)) {
			let line = rawLine;

			// Strip trailing CR/whitespace (gitignore trims unescaped trailing spaces; keep it simple here)
			line = line.replace(/\s+$/, '');
			if (!line) continue;

			// Comments (unless escaped)
			if (line.startsWith('#')) continue;
			if (line.startsWith('\\#')) line = line.slice(1);
			if (line.startsWith('\\!')) line = line.slice(1);

			let negated = false;
			if (line.startsWith('!')) {
				negated = true;
				line = line.slice(1);
			}

			if (!line) continue;

			let directoryOnly = false;
			if (line.endsWith('/')) {
				directoryOnly = true;
				line = line.slice(0, -1);
			}

			const anchored = line.startsWith('/');
			if (anchored) {
				line = line.slice(1);
			}

			const hasSlash = line.includes('/');

			const prefix = anchored
				? '^'
				: hasSlash
					? '(^|.*/)'
					: '(^|.*/)'; // basename patterns still match in any directory

			const suffix = directoryOnly ? '(/.*)?$' : '$';

			const body = globToRegex(line);
			const regex = new RegExp(prefix + body + suffix);

			rules.push({ negated, regex });
		}

		return rules;
	}

	private isGitIgnored(relativePath: string, rules: Array<{ negated: boolean; regex: RegExp }>): boolean {
		if (rules.length === 0) return false;
		const posix = this.toPosixPath(relativePath);

		let ignored = false;
		for (const rule of rules) {
			if (rule.regex.test(posix)) {
				ignored = !rule.negated;
			}
		}
		return ignored;
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

		const gitignoreRules = await this.loadGitIgnoreRules(rootPath);
		await this.scanDirectory(rootPath, rootPath, result, gitignoreRules, token);

		// Sort and limit top files to 10
		result.topFiles.sort((a, b) => b.lines - a.lines);
		result.topFiles = result.topFiles.slice(0, 10);

		return result;
	}

	/**
	 * Recursively scan a directory
	 */
	private async scanDirectory(
		rootPath: string,
		dirPath: string,
		result: LOCResult,
		gitignoreRules: Array<{ negated: boolean; regex: RegExp }>,
		token?: vscode.CancellationToken
	): Promise<void> {
		if (token?.isCancellationRequested) {
			return;
		}

		let entries;
		try {
			entries = await fs.opendir(dirPath);
		} catch {
			return;
		}

		for await (const entry of entries) {
			if (token?.isCancellationRequested) {
				break;
			}

			const fullPath = path.join(dirPath, entry.name);
			const relativePath = path.relative(rootPath, fullPath);

			// Check exclusions
			if (this.isExcluded(relativePath) || this.isGitIgnored(relativePath, gitignoreRules)) {
				result.skippedFiles++;
				continue;
			}

			if (entry.isDirectory()) {
				await this.scanDirectory(rootPath, fullPath, result, gitignoreRules, token);
			} else if (entry.isFile()) {
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
	private async processFile(
		fullPath: string,
		relativePath: string,
		result: LOCResult
	): Promise<void> {
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

		if (stat.size === 0 || stat.size > 2 * 1024 * 1024) {
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

		const lines = this.countNonEmptyLines(content);

		if (lines > 0) {
			const language = LANGUAGE_MAP[ext] || ext.slice(1).toUpperCase();

			result.totalLines += lines;
			result.byLanguage[language] = (result.byLanguage[language] || 0) + lines;
			result.topFiles.push({ path: relativePath, lines, language });
			result.scannedFiles++;
		}
	}

	/**
	 * Count non-empty lines in file content
	 * Uses character code comparison for performance
	 */
	private countNonEmptyLines(content: string): number {
		let count = 0;
		let start = 0;
		const NEWLINE = 10;
		const SPACE = 32;
		const TAB = 9;
		const CR = 13;

		for (let i = 0; i <= content.length; i++) {
			const code = i < content.length ? content.charCodeAt(i) : NEWLINE;

			if (code === NEWLINE || i === content.length) {
				// Check if line has non-whitespace content
				for (let j = start; j < i; j++) {
					const c = content.charCodeAt(j);
					if (c !== SPACE && c !== TAB && c !== CR) {
						count++;
						break;
					}
				}
				start = i + 1;
			}
		}

		return count;
	}
}
