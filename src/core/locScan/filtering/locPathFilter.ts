import { DEFAULT_EXCLUDES } from '../locConfig';
import { type GitIgnoreRule, isGitIgnored } from './gitignore';

/**
 * Evaluates whether a relative path should be excluded from LOC scanning.
 * Single responsibility: filtering rules (default excludes + gitignore).
 */
export class LocPathFilter {
	private readonly excludePatterns: RegExp[];

	constructor() {
		// Default exclusions - matches common build/dependency directories
		this.excludePatterns = DEFAULT_EXCLUDES.map((pattern) => {
			const escaped = escapeRegExp(pattern);
			return new RegExp(`(^|[\\/])${escaped}($|[\\/])`);
		});
	}

	private isExcluded(relativePath: string): boolean {
		return this.excludePatterns.some((pattern) => pattern.test(relativePath));
	}

	/**
	 * Returns `true` when `relativePath` should be excluded from the LOC scan.
	 * Default directory exclusions are checked first for a fast common-case skip, then gitignore rules.
	 * @param relativePath - Path relative to the scan root.
	 * @param gitignoreRules - Effective gitignore rules for the current directory depth.
	 * @param isDirectory - Whether `relativePath` refers to a directory (affects `dir/` rules).
	 */
	shouldSkip(relativePath: string, gitignoreRules: GitIgnoreRule[], isDirectory = true): boolean {
		// Default excludes are applied before `.gitignore` for a fast common-case skip.
		return this.isExcluded(relativePath) || isGitIgnored(relativePath, gitignoreRules, isDirectory);
	}
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
