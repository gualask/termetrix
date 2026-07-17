import {
	type BoundedRatio,
	type PositiveInt,
	toBoundedRatio,
	toPositiveInt,
} from '../../../shared/numericValueObjects';

interface SelectionStopInput {
	selectedCount: number;
	candidateBytes: number;
	parentBytes: number;
}

interface SelectionCoverageInput {
	parentBytes: number;
	selectedBytes: number;
}

export class BreakdownSelectionPolicy {
	constructor(
		readonly coverageTarget: BoundedRatio,
		readonly minItemPercent: BoundedRatio,
		readonly maxItems: PositiveInt,
	) {}

	/**
	 * Creates a `BreakdownSelectionPolicy` from raw option values, applying defaults where omitted.
	 * @param options - Raw breakdown options (all fields optional).
	 */
	static fromRaw(options: ComputeSizeBreakdownOptions | undefined): BreakdownSelectionPolicy {
		const coverageTarget = toBoundedRatio(options?.coverageTarget, 0.8);
		const minItemPercent = toBoundedRatio(options?.minItemPercent, 0.03);
		const maxItems = toPositiveInt(options?.maxItems, deriveDefaultMaxItems(minItemPercent));

		return new BreakdownSelectionPolicy(coverageTarget, minItemPercent, maxItems);
	}

	/**
	 * Returns the minimum byte threshold for an item to be included in the breakdown.
	 * @param parentBytes - Total bytes of the parent segment.
	 */
	minItemBytes(parentBytes: number): number {
		return parentBytes > 0 ? parentBytes * this.minItemPercent : 0;
	}

	/**
	 * Returns `true` when selection should stop before considering the next candidate.
	 * Stops when maxItems is reached or the candidate is below the minimum size threshold.
	 * @param input - Current selection state.
	 */
	shouldStopBeforeSelecting(input: SelectionStopInput): boolean {
		const { selectedCount, candidateBytes, parentBytes } = input;
		if (selectedCount >= this.maxItems) return true;
		if (selectedCount === 0) return false;
		return candidateBytes < this.minItemBytes(parentBytes);
	}

	/**
	 * Returns `true` when the selected items already cover enough of the parent's total bytes.
	 * @param input - Coverage check inputs.
	 */
	hasReachedCoverage(input: SelectionCoverageInput): boolean {
		const { parentBytes, selectedBytes } = input;
		if (parentBytes <= 0) return false;
		return selectedBytes / parentBytes >= this.coverageTarget;
	}
}

export interface ComputeSizeBreakdownOptions {
	coverageTarget?: number;
	minItemPercent?: number;
	maxItems?: number;
}

function deriveDefaultMaxItems(minItemPercent: BoundedRatio): number {
	if (minItemPercent <= 0) return 50;
	return Math.max(1, Math.floor(1 / minItemPercent));
}
