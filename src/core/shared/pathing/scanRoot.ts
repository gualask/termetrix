import * as path from 'path';
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

	static fromPath(rootPath: string | undefined | null): ScanRoot | undefined {
		if (!rootPath) return undefined;
		return new ScanRoot(CanonicalPath.from(rootPath));
	}

	equals(other: ScanRoot | undefined | null): boolean {
		if (!other) return false;
		return this.key === other.key;
	}

	toRelativePathWithinRoot(absolutePath: string): string | undefined {
		return CanonicalPath.from(absolutePath).relativeTo(this.canonical);
	}

	resolvePathIfWithinRoot(inputPath: string): string | undefined {
		const target = path.isAbsolute(inputPath)
			? CanonicalPath.from(inputPath)
			: CanonicalPath.from(path.resolve(this.path, inputPath));
		return target.isWithin(this.canonical) ? target.raw : undefined;
	}
}
