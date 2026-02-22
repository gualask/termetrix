import type { ExtendedScanResult, ScanResult } from '../../../types';

/**
 * Converts an internal scan result to a transport-safe/result-safe shape.
 * Removes extension-host-only fields.
 */
export function toPublicScanResult(result: ExtendedScanResult): ScanResult {
	const { directoryMetrics: _directoryMetrics, ...slimResult } = result;
	return slimResult;
}
