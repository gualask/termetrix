import type { SizeScanConfig } from './scanEngineTypes';
import {
	ConcurrencyLimit,
	DurationMs,
	PositiveInt,
} from '../../shared/numericValueObjects';
import { SIZE_SCAN_DEFAULTS } from '../../../shared/contracts/sizeScanDefaults';

export interface ScanLimitsPolicy {
	maxDurationMs: DurationMs;
	maxDirectories: PositiveInt;
	maxFsConcurrency: PositiveInt;
	statBatchSize: PositiveInt;
	maxDirectoryConcurrency: ConcurrencyLimit;
}

/**
 * Resolves raw size-scan config into normalized runtime limits.
 */
export function resolveScanLimitsPolicy(input: SizeScanConfig): ScanLimitsPolicy {
	const maxDurationMs = DurationMs.fromSeconds(
		input.maxDurationSeconds,
		SIZE_SCAN_DEFAULTS.maxDurationSeconds
	);
	const maxDirectories = PositiveInt.from(input.maxDirectories, SIZE_SCAN_DEFAULTS.maxDirectories);
	const rawFsConcurrency = PositiveInt.from(input.fsConcurrency, SIZE_SCAN_DEFAULTS.fsConcurrency);
	const maxFsConcurrency = PositiveInt.from(Math.min(rawFsConcurrency.value, 128), SIZE_SCAN_DEFAULTS.fsConcurrency);
	const statBatchSize = PositiveInt.from(Math.max(32, Math.min(1024, maxFsConcurrency.value * 8)), 32);
	const maxDirectoryConcurrency = ConcurrencyLimit.bounded(Math.ceil(maxFsConcurrency.value / 4), 1, 1, 16);

	return {
		maxDurationMs,
		maxDirectories,
		maxFsConcurrency,
		statBatchSize,
		maxDirectoryConcurrency,
	};
}
