import * as path from 'path';

function ensureTrailingSeparator(value: string): string {
	return value.endsWith(path.sep) ? value : value + path.sep;
}

function normalizeKey(resolvedPath: string): string {
	return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
}

/**
 * Canonical path value object used for root-safe path comparisons.
 */
export class CanonicalPath {
	private constructor(
		readonly raw: string,
		readonly key: string
	) {}

	/**
	 * Creates a `CanonicalPath` by resolving and platform-normalising the given string.
	 * @param value - Absolute or relative path.
	 */
	static from(value: string): CanonicalPath {
		const resolved = path.resolve(value);
		return new CanonicalPath(resolved, normalizeKey(resolved));
	}

	/**
	 * Returns `true` when this path is equal to `other` (platform-aware comparison).
	 * @param other - Path to compare against.
	 */
	equals(other: CanonicalPath): boolean {
		return this.key === other.key;
	}

	/**
	 * Returns `true` when this path is equal to `root` or is a descendant of it.
	 * Uses a trailing-separator check to prevent false positives on shared prefixes.
	 * @param root - Candidate root path.
	 */
	isWithin(root: CanonicalPath): boolean {
		if (this.equals(root)) return true;
		return this.key.startsWith(ensureTrailingSeparator(root.key));
	}

	/**
	 * Returns the path relative to `root`, or `undefined` when outside `root`.
	 * Returns `''` when this path equals `root`.
	 * @param root - Root to compute the relative path against.
	 */
	relativeTo(root: CanonicalPath): string | undefined {
		if (!this.isWithin(root)) return undefined;
		if (this.equals(root)) return '';

		const relativePath = path.relative(root.raw, this.raw);
		if (!relativePath || relativePath.startsWith('..')) return undefined;
		return relativePath;
	}
}
