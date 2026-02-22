import type {
	LOCResult,
	ErrorData,
	MessageFromExtension,
	ProgressData,
	ScanResult,
	SizeBreakdownResult,
} from '../../types';

export function createScanStartMessage(): MessageFromExtension {
	return { type: 'scanStart' };
}

export function createProgressMessage(progress: ProgressData): MessageFromExtension {
	return { type: 'progress', data: progress };
}

export function createLocCalculatingMessage(): MessageFromExtension {
	return { type: 'locCalculating' };
}

export function createLocResultMessage(result: LOCResult): MessageFromExtension {
	return { type: 'locResult', data: result };
}

export function createErrorMessage(data: ErrorData): MessageFromExtension {
	return { type: 'error', data };
}

export function createNoRootMessage(): MessageFromExtension {
	return { type: 'noRoot' };
}

export function createDeepScanResultMessage(breakdown: SizeBreakdownResult): MessageFromExtension {
	return { type: 'deepScanResult', data: breakdown };
}

export function createEmptyDeepScanResultMessage(rootPath = ''): MessageFromExtension {
	return createDeepScanResultMessage({ rootPath, parents: [] });
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
