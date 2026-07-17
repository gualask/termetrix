import { SIZE_SCAN_DEFAULTS } from '../../../shared/contracts/sizeScanDefaults';
import {
	type ConcurrencyLimit,
	type DurationMs,
	type PositiveInt,
	secondsToDurationMs,
	toConcurrencyLimit,
	toPositiveInt,
} from '../../shared/numericValueObjects';
import type { SizeScanConfig } from './scanEngineTypes';

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
	const maxDurationMs = secondsToDurationMs(input.maxDurationSeconds, SIZE_SCAN_DEFAULTS.maxDurationSeconds);
	const maxDirectories = toPositiveInt(input.maxDirectories, SIZE_SCAN_DEFAULTS.maxDirectories);
	const rawFsConcurrency = toPositiveInt(input.fsConcurrency, SIZE_SCAN_DEFAULTS.fsConcurrency);
	const maxFsConcurrency = toPositiveInt(Math.min(rawFsConcurrency, 128), SIZE_SCAN_DEFAULTS.fsConcurrency);
	const statBatchSize = toPositiveInt(Math.max(32, Math.min(1024, maxFsConcurrency * 8)), 32);
	const maxDirectoryConcurrency = toConcurrencyLimit(Math.ceil(maxFsConcurrency / 4), 1, 1, 16);

	return {
		maxDurationMs,
		maxDirectories,
		maxFsConcurrency,
		statBatchSize,
		maxDirectoryConcurrency,
	};
}
