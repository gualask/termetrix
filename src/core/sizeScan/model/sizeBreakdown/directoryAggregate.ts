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

	static empty(): DirectoryAggregate {
		return new DirectoryAggregate(0, 0, 0);
	}

	static fromTotals(totals: DirectoryAggregateSnapshot): DirectoryAggregate {
		return new DirectoryAggregate(
			Math.max(0, totals.bytes),
			Math.max(0, totals.fileCount),
			Math.max(0, totals.maxFileBytes)
		);
	}

	merge(other: DirectoryAggregate): DirectoryAggregate {
		return new DirectoryAggregate(
			this.bytes + other.bytes,
			this.fileCount + other.fileCount,
			Math.max(this.maxFileBytes, other.maxFileBytes)
		);
	}

	subtractSaturating(other: DirectoryAggregate): DirectoryAggregate {
		const safeBytes = Math.max(0, other.bytes);
		const safeFileCount = Math.max(0, other.fileCount);
		return new DirectoryAggregate(
			Math.max(0, this.bytes - safeBytes),
			Math.max(0, this.fileCount - safeFileCount),
			this.maxFileBytes
		);
	}

	isEmpty(): boolean {
		return this.bytes <= 0 && this.fileCount <= 0;
	}
}
