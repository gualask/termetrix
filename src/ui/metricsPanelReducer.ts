import type { ErrorData, LOCResult, MessageFromExtension, ProgressData, SizeBreakdownResult, ViewData } from './types';

type MetricsPanelInternalState = {
	isReady: boolean;
	viewData: ViewData;
	locResult: LOCResult | null;
	isCalculatingLOC: boolean;
	breakdown: SizeBreakdownResult | null;
	progressData: ProgressData | null;
	error: ErrorData | null;
};

type MetricsPanelAction = { type: 'message'; message: MessageFromExtension } | { type: 'dismissError' };

export const initialMetricsPanelState: MetricsPanelInternalState = {
	isReady: false,
	viewData: { isScanning: false, scanResult: undefined },
	locResult: null,
	isCalculatingLOC: false,
	breakdown: null,
	progressData: null,
	error: null,
};

function getScanKey(scanResult: ViewData['scanResult']): string | undefined {
	if (!scanResult) return undefined;
	return `${scanResult.rootPath}:${scanResult.metadata.endTime}`;
}

function clearProgressData(state: MetricsPanelInternalState): MetricsPanelInternalState {
	return { ...state, progressData: null };
}

function beginSizeScan(state: MetricsPanelInternalState): MetricsPanelInternalState {
	const scanResult = state.viewData.scanResult;
	return clearProgressData({
		...state,
		viewData: {
			...state.viewData,
			isScanning: true,
			// Clear incomplete state while preserving the last completed result and breakdown.
			scanResult: scanResult ? { ...scanResult, incomplete: false, incompleteReason: undefined } : undefined,
		},
	});
}

function applySizeScanUpdate(state: MetricsPanelInternalState, nextViewData: ViewData): MetricsPanelInternalState {
	const nextState = clearProgressData({
		...state,
		isReady: true,
		viewData: nextViewData,
	});

	if (!nextViewData.scanResult) return { ...nextState, breakdown: null };

	const previousScanKey = getScanKey(state.viewData.scanResult);
	const nextScanKey = getScanKey(nextViewData.scanResult);
	// A matching key means cancellation restored the last result, so its breakdown stays valid.
	if (previousScanKey !== undefined && previousScanKey === nextScanKey) return nextState;

	// A new scan invalidates the old breakdown; the backend sends the replacement immediately after this update.
	return { ...nextState, breakdown: null };
}

function clearWorkspaceMetrics(state: MetricsPanelInternalState): MetricsPanelInternalState {
	return {
		...state,
		isReady: true,
		viewData: { isScanning: false, scanResult: undefined },
		breakdown: null,
		progressData: null,
		isCalculatingLOC: false,
		locResult: null,
	};
}

function reducePanelMessage(
	state: MetricsPanelInternalState,
	message: MessageFromExtension,
): MetricsPanelInternalState {
	switch (message.type) {
		case 'scanStart':
			return beginSizeScan(state);
		case 'progress':
			return { ...state, progressData: message.data };
		case 'update':
			return applySizeScanUpdate(state, message.data);
		case 'noRoot':
			return clearWorkspaceMetrics(state);
		case 'locScanStart':
			return { ...state, isCalculatingLOC: true };
		case 'locResult':
			return { ...state, locResult: message.data, isCalculatingLOC: false };
		case 'locScanCancelled':
			return { ...state, isCalculatingLOC: false };
		case 'deepScanResult':
			return { ...state, breakdown: message.data };
		case 'error':
			return { ...state, error: message.data, isCalculatingLOC: false };
		default:
			return state;
	}
}

export function metricsPanelReducer(
	state: MetricsPanelInternalState,
	action: MetricsPanelAction,
): MetricsPanelInternalState {
	if (action.type === 'dismissError') return { ...state, error: null };
	if (action.type !== 'message') return state;
	return reducePanelMessage(state, action.message);
}
