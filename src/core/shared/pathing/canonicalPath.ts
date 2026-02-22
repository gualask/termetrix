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

	static from(value: string): CanonicalPath {
		const resolved = path.resolve(value);
		return new CanonicalPath(resolved, normalizeKey(resolved));
	}

	equals(other: CanonicalPath): boolean {
		return this.key === other.key;
	}

	isWithin(root: CanonicalPath): boolean {
		if (this.equals(root)) return true;
		return this.key.startsWith(ensureTrailingSeparator(root.key));
	}

	relativeTo(root: CanonicalPath): string | undefined {
		if (!this.isWithin(root)) return undefined;
		if (this.equals(root)) return '';

		const relativePath = path.relative(root.raw, this.raw);
		if (!relativePath || relativePath.startsWith('..')) return undefined;
		return relativePath;
	}
}
