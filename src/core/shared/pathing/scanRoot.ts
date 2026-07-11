import * as path from 'node:path';
import { CanonicalPath } from './canonicalPath';

/**
 * Canonical root identity used across scan workflows.
 * Encapsulates normalization and root-constrained path resolution.
 */
export class ScanRoot {
	private constructor(private readonly canonical: CanonicalPath) {}

	get path(): string {
		return this.canonical.raw;
	}

	get key(): string {
		return this.canonical.key;
	}

	/**
	 * Creates a `ScanRoot` from a path string. Returns `undefined` for empty or null input.
	 * @param rootPath - Absolute path of the workspace root.
	 */
	static fromPath(rootPath: string | undefined | null): ScanRoot | undefined {
		if (!rootPath) return undefined;
		return new ScanRoot(CanonicalPath.from(rootPath));
	}

	/**
	 * Returns `true` when `other` represents the same root (platform-aware comparison).
	 * @param other - Root to compare against.
	 */
	equals(other: ScanRoot | undefined | null): boolean {
		if (!other) return false;
		return this.key === other.key;
	}

	/**
	 * Resolves `inputPath` (absolute or root-relative) and returns its absolute form
	 * only when it falls within this root. Returns `undefined` for paths outside the root.
	 * @param inputPath - Absolute or relative path to resolve.
	 */
	resolvePathIfWithinRoot(inputPath: string): string | undefined {
		const target = path.isAbsolute(inputPath)
			? CanonicalPath.from(inputPath)
			: CanonicalPath.from(path.resolve(this.path, inputPath));
		return target.isWithin(this.canonical) ? target.raw : undefined;
	}
}
