export interface DirectoryAggregateSnapshot {
	bytes: number;
	fileCount: number;
	maxFileBytes: number;
}

/**
 * Aggregate value object for directory metrics used by the size-breakdown model.
 */
export class DirectoryAggregate {
	private constructor(
		readonly bytes: number,
		readonly fileCount: number,
		readonly maxFileBytes: number
	) {}

	/** Returns an empty aggregate with all counters at zero. */
	static empty(): DirectoryAggregate {
		return new DirectoryAggregate(0, 0, 0);
	}

	/**
	 * Creates an aggregate from a raw snapshot, clamping all fields to zero.
	 * @param totals - Raw totals snapshot.
	 */
	static fromTotals(totals: DirectoryAggregateSnapshot): DirectoryAggregate {
		return new DirectoryAggregate(
			Math.max(0, totals.bytes),
			Math.max(0, totals.fileCount),
			Math.max(0, totals.maxFileBytes)
		);
	}

	/**
	 * Returns a new aggregate combining this and another (bytes/fileCount summed, maxFileBytes maximised).
	 * @param other - Aggregate to merge with.
	 */
	merge(other: DirectoryAggregate): DirectoryAggregate {
		return new DirectoryAggregate(
			this.bytes + other.bytes,
			this.fileCount + other.fileCount,
			Math.max(this.maxFileBytes, other.maxFileBytes)
		);
	}

	/**
	 * Returns a new aggregate with `other` subtracted, clamping bytes and fileCount to zero.
	 * maxFileBytes is kept from `this` (cannot be subtracted meaningfully).
	 * @param other - Aggregate to subtract.
	 */
	subtractSaturating(other: DirectoryAggregate): DirectoryAggregate {
		const safeBytes = Math.max(0, other.bytes);
		const safeFileCount = Math.max(0, other.fileCount);
		return new DirectoryAggregate(
			Math.max(0, this.bytes - safeBytes),
			Math.max(0, this.fileCount - safeFileCount),
			this.maxFileBytes
		);
	}

	/** Returns `true` when both bytes and fileCount are zero or negative. */
	isEmpty(): boolean {
		return this.bytes <= 0 && this.fileCount <= 0;
	}
}
