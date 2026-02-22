import { isGitIgnored, type GitIgnoreRule } from './gitignore';
import { DEFAULT_EXCLUDES } from '../locConfig';

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

	shouldSkip(relativePath: string, gitignoreRules: GitIgnoreRule[]): boolean {
		// Default excludes are applied before `.gitignore` for a fast common-case skip.
		return this.isExcluded(relativePath) || isGitIgnored(relativePath, gitignoreRules);
	}
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
