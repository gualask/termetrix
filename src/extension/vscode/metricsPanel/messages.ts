import type {
	LOCResult,
	ErrorData,
	MessageFromExtension,
	ProgressData,
	ScanResult,
	SizeBreakdownResult,
} from '../../types';
import { computeSizeBreakdown } from '../../../core/sizeScan/model/sizeBreakdown/computeSizeBreakdown';
import type { DirectoryMetricsSnapshot } from '../../../core/sizeScan/types';

/** Creates a `scanStart` message signalling that a size scan has begun. */
export function createScanStartMessage(): MessageFromExtension {
	return { type: 'scanStart' };
}

/**
 * Creates a `progress` message with current scan progress data.
 * @param progress - Bytes and directories scanned so far.
 */
export function createProgressMessage(progress: ProgressData): MessageFromExtension {
	return { type: 'progress', data: progress };
}

/** Creates a `locScanStart` message signalling that a LOC scan has begun. */
export function createLocScanStartMessage(): MessageFromExtension {
	return { type: 'locScanStart' };
}

/**
 * Creates a `locResult` message carrying the completed LOC scan result.
 * @param result - Final LOC scan result.
 */
export function createLocResultMessage(result: LOCResult): MessageFromExtension {
	return { type: 'locResult', data: result };
}

/** Creates a `locScanCancelled` message signalling that the LOC scan was cancelled. */
export function createLocScanCancelledMessage(): MessageFromExtension {
	return { type: 'locScanCancelled' };
}

/**
 * Creates a recoverable `error` message to display in the panel.
 * @param data - Error payload including message, code, and recoverability flag.
 */
export function createErrorMessage(data: ErrorData): MessageFromExtension {
	return { type: 'error', data };
}

/** Creates a `noRoot` message indicating no workspace root is currently available. */
export function createNoRootMessage(): MessageFromExtension {
	return { type: 'noRoot' };
}

function createDeepScanResultMessage(breakdown: SizeBreakdownResult): MessageFromExtension {
	return { type: 'deepScanResult', data: breakdown };
}

/**
 * Creates a `deepScanResult` message by computing the size breakdown from raw directory metrics.
 * @param rootPath - Workspace root path (used as the breakdown root).
 * @param directoryMetrics - Per-directory metrics snapshot from the completed scan.
 */
export function createBreakdownMessage(rootPath: string, directoryMetrics: DirectoryMetricsSnapshot): MessageFromExtension {
	return createDeepScanResultMessage(computeSizeBreakdown({ rootPath, directoryMetrics }));
}

/**
 * Creates an `update` message reflecting the latest scan result and scanning state.
 * @param params.scanResult - Most recent scan result (may be undefined before any scan).
 * @param params.isScanning - Whether a scan is currently in progress.
 */
export function createUpdateMessage(params: {
	scanResult: ScanResult | undefined;
	isScanning: boolean;
}): MessageFromExtension {
	return {
		type: 'update',
		data: {
			scanResult: params.scanResult,
			isScanning: params.isScanning,
		},
	};
}
