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

export function createScanStartMessage(): MessageFromExtension {
	return { type: 'scanStart' };
}

export function createProgressMessage(progress: ProgressData): MessageFromExtension {
	return { type: 'progress', data: progress };
}

export function createLocScanStartMessage(): MessageFromExtension {
	return { type: 'locScanStart' };
}

export function createLocResultMessage(result: LOCResult): MessageFromExtension {
	return { type: 'locResult', data: result };
}

export function createLocScanCancelledMessage(): MessageFromExtension {
	return { type: 'locScanCancelled' };
}

export function createErrorMessage(data: ErrorData): MessageFromExtension {
	return { type: 'error', data };
}

export function createNoRootMessage(): MessageFromExtension {
	return { type: 'noRoot' };
}

function createDeepScanResultMessage(breakdown: SizeBreakdownResult): MessageFromExtension {
	return { type: 'deepScanResult', data: breakdown };
}

export function createBreakdownMessage(rootPath: string, directoryMetrics: DirectoryMetricsSnapshot): MessageFromExtension {
	return createDeepScanResultMessage(computeSizeBreakdown({ rootPath, directoryMetrics }));
}

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
