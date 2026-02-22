import type { ScanIncompleteReason } from '../../../shared/contracts/scan';

export type ScanCompletion =
	| { kind: 'complete' }
	| { kind: 'incomplete'; reason: ScanIncompleteReason };

/**
 * Creates a completion state for a fully completed scan.
 * @returns Complete state.
 */
export function completeScan(): ScanCompletion {
	return { kind: 'complete' };
}

/**
 * Creates a completion state for an incomplete scan with a reason.
 * @param reason - Incomplete reason.
 * @returns Incomplete state.
 */
export function incompleteScan(reason: ScanIncompleteReason): ScanCompletion {
	return { kind: 'incomplete', reason };
}

/**
 * Returns true when a scan completion state is incomplete.
 * @param completion - Completion state.
 * @returns True when incomplete.
 */
export function isIncompleteScan(completion: ScanCompletion): boolean {
	return completion.kind === 'incomplete';
}

/**
 * Converts completion state to the protocol fields used by the webview.
 * @param completion - Completion state.
 * @returns Protocol-compatible completion fields.
 */
export function toScanResultCompletion(completion: ScanCompletion): {
	incomplete: boolean;
	incompleteReason: ScanIncompleteReason | undefined;
} {
	if (completion.kind === 'incomplete') {
		return {
			incomplete: true,
			incompleteReason: completion.reason,
		};
	}

	return {
		incomplete: false,
		incompleteReason: undefined,
	};
}
