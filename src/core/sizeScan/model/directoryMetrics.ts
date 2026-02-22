import type { DirectoryMetrics, DirectoryMetricsSnapshot } from '../types';

function fastBasename(filePath: string): string {
	// Prefer a manual basename to avoid pulling in path parsing on the hot path.
	// Use both separators to stay robust if inputs contain mixed slashes.
	const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
	return idx === -1 ? filePath : filePath.slice(idx + 1);
}

/**
 * Mutable delta for direct directory metrics computed while stat'ing file batches.
 * Co-locates domain counters to avoid primitive clumps across hot-path functions.
 */
export class DirectoryDirectMetricsDelta {
	private directBytesDelta = 0;
	private fileCountDelta = 0;
	private maxFileBytesDelta = 0;
	private maxFileNameDelta: string | undefined = undefined;

	/**
	 * Records a single file's contribution to this directory's direct metrics.
	 * @param fileAbsolutePath - Absolute path of the file.
	 * @param sizeBytes - File size in bytes (must be >= 0).
	 */
	addFile(fileAbsolutePath: string, sizeBytes: number): void {
		// Defensive: sizes should be non-negative; ignore invalid values.
		if (sizeBytes < 0) return;
		this.fileCountDelta++;
		if (sizeBytes === 0) return;
		this.directBytesDelta += sizeBytes;
		if (sizeBytes > this.maxFileBytesDelta) {
			this.maxFileBytesDelta = sizeBytes;
			this.maxFileNameDelta = fastBasename(fileAbsolutePath);
		}
	}

	/**
	 * Merges another delta into this one (used when combining partial results).
	 * @param other - Delta to merge in.
	 */
	merge(other: DirectoryDirectMetricsDelta): void {
		this.directBytesDelta += other.directBytesDelta;
		this.fileCountDelta += other.fileCountDelta;
		if (other.maxFileBytesDelta > this.maxFileBytesDelta) {
			this.maxFileBytesDelta = other.maxFileBytesDelta;
			this.maxFileNameDelta = other.maxFileNameDelta;
		}
	}

	/** Returns true when this delta has any direct file data worth recording. */
	hasDirectMetrics(): boolean {
		return this.directBytesDelta > 0;
	}

	/** Converts this delta to an immutable `DirectoryMetrics` snapshot. */
	toDirectoryMetrics(): DirectoryMetrics {
		return {
			bytes: this.directBytesDelta,
			fileCount: this.fileCountDelta,
			maxFileBytes: this.maxFileBytesDelta,
			...(this.maxFileNameDelta !== undefined && { maxFileName: this.maxFileNameDelta }),
		};
	}
}

/**
 * Internal store for per-directory direct metrics.
 */
export class DirectoryMetricsStore {
	private readonly byDirectory = new Map<string, DirectoryMetrics>();

	/** Records the metrics for a directory. No-op when the delta has no direct bytes. */
	record(pathKey: string, delta: DirectoryDirectMetricsDelta): void {
		if (!delta.hasDirectMetrics()) return;
		this.byDirectory.set(pathKey, delta.toDirectoryMetrics());
	}

	/** Returns the number of directories with recorded metrics. */
	size(): number {
		return this.byDirectory.size;
	}

	/** Converts the store to a plain-object snapshot for breakdown computation. */
	toSnapshot(): DirectoryMetricsSnapshot {
		const out: DirectoryMetricsSnapshot = Object.create(null);
		for (const [dirPath, metrics] of this.byDirectory) {
			out[dirPath] = metrics;
		}
		return out;
	}
}
