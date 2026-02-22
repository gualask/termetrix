import { useEffect, useCallback, useReducer, useMemo } from 'preact/hooks';
import type {
	SizeBreakdownResult,
	LOCResult,
	MessageFromExtension,
	ViewData,
	ProgressData,
	ErrorData,
} from '../types';
import {
	postCalculateLOC,
	postCancelScan,
	postDeepScan,
	postOpenFile,
	postReady,
	postRefresh,
	postRevealInExplorer,
} from '../vscode';

type MetricsPanelInternalState = {
	isReady: boolean;
	viewData: ViewData;
	locResult: LOCResult | null;
	isCalculatingLOC: boolean;
	breakdown: SizeBreakdownResult | null;
	isDeepScanning: boolean;
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
	isDeepScanning: false,
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

export function metricsPanelReducer(
	state: MetricsPanelInternalState,
	action: MetricsPanelAction
): MetricsPanelInternalState {
	if (action.type === 'dismissError') return { ...state, error: null };
	if (action.type !== 'message') return state;

	const message = action.message;

	switch (message.type) {
		case 'scanStart': {
			const scanResult = state.viewData.scanResult;
			return clearProgressData({
				...state,
				isDeepScanning: false,
				viewData: {
					...state.viewData,
					isScanning: true,
					// Clear incomplete flag when starting a new scan.
					scanResult: scanResult ? { ...scanResult, incomplete: false, incompleteReason: undefined } : undefined,
				},
			});
		}
		case 'progress':
			return { ...state, progressData: message.data };
		case 'update': {
			const previousScanKey = getScanKey(state.viewData.scanResult);
			const nextViewData = message.data;
			const nextScanKey = getScanKey(nextViewData.scanResult);

			const nextStateBase = clearProgressData({
				...state,
				isReady: true,
				viewData: nextViewData,
			});

			if (!nextViewData.scanResult) {
				return { ...nextStateBase, breakdown: null, isDeepScanning: false };
			}

			const isSameScan = previousScanKey !== undefined && previousScanKey === nextScanKey;
			const hasBreakdown = nextStateBase.breakdown !== null;

			if (isSameScan && hasBreakdown) {
				return { ...nextStateBase, isDeepScanning: false };
			}

			// Request deep scan (side-effect is triggered by the hook when this flag is true).
			// Always drop stale breakdown when the scan changes.
			return { ...nextStateBase, breakdown: null, isDeepScanning: true };
		}
		case 'noRoot':
			return {
				...state,
				isReady: true,
				viewData: { isScanning: false, scanResult: undefined },
				breakdown: null,
				isDeepScanning: false,
				progressData: null,
			};
		case 'locCalculating':
			return { ...state, isCalculatingLOC: true };
		case 'locResult':
			return { ...state, locResult: message.data, isCalculatingLOC: false };
		case 'deepScanResult':
			return { ...state, breakdown: message.data, isDeepScanning: false };
		case 'error':
			return { ...state, error: message.data, isCalculatingLOC: false, isDeepScanning: false };
		default:
			return state;
	}
}

interface Actions {
	refreshOrCancelScan: () => void;
	revealInExplorer: (path: string) => void;
	calculateLOC: () => void;
	openFile: (path: string) => void;
	dismissError: () => void;
}

interface SizeSlice {
	viewData: ViewData;
	breakdown: SizeBreakdownResult | null;
	isDeepScanning: boolean;
	progressData: ProgressData | null;
	actions: Pick<Actions, 'refreshOrCancelScan' | 'revealInExplorer'>;
}

interface LocSlice {
	result: LOCResult | null;
	isCalculating: boolean;
	actions: Pick<Actions, 'calculateLOC' | 'openFile'>;
}

interface State {
	isReady: boolean;
	error: ErrorData | null;
	size: SizeSlice;
	loc: LocSlice;
	dismissError: () => void;
}

export function useMetricsPanelState(): State {
	const [state, dispatch] = useReducer(metricsPanelReducer, initialMetricsPanelState);

	useEffect(() => {
		function handleMessage(event: MessageEvent<MessageFromExtension>) {
			dispatch({ type: 'message', message: event.data });
		}

		window.addEventListener('message', handleMessage);
		postReady();

		return () => window.removeEventListener('message', handleMessage);
	}, []);

	useEffect(() => {
		if (!state.viewData.scanResult) return;
		if (!state.isDeepScanning) return;
		postDeepScan();
	}, [state.isDeepScanning, state.viewData.scanResult]);

	const refreshOrCancelScan = useCallback(() => {
		if (state.viewData.isScanning) postCancelScan();
		else postRefresh();
	}, [state.viewData.isScanning]);

	const revealInExplorer = useCallback((path: string) => {
		postRevealInExplorer(path);
	}, []);

	const calculateLOC = useCallback(() => {
		postCalculateLOC();
	}, []);

	const openFile = useCallback((path: string) => {
		postOpenFile(path);
	}, []);

	const dismissError = useCallback(() => {
		dispatch({ type: 'dismissError' });
	}, []);

	const size = useMemo<SizeSlice>(
		() => ({
			viewData: state.viewData,
			breakdown: state.breakdown,
			isDeepScanning: state.isDeepScanning,
			progressData: state.progressData,
			actions: {
				refreshOrCancelScan,
				revealInExplorer,
			},
		}),
		[state.viewData, state.breakdown, state.isDeepScanning, state.progressData, refreshOrCancelScan, revealInExplorer]
	);

	const loc = useMemo<LocSlice>(
		() => ({
			result: state.locResult,
			isCalculating: state.isCalculatingLOC,
			actions: {
				calculateLOC,
				openFile,
			},
		}),
		[state.locResult, state.isCalculatingLOC, calculateLOC, openFile]
	);

	return {
		isReady: state.isReady,
		error: state.error,
		dismissError,
		size,
		loc,
	};
}
