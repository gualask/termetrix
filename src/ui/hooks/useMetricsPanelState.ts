import { useEffect, useCallback, useReducer, useMemo, useState } from 'preact/hooks';
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
	progressData: ProgressData | null;
	error: ErrorData | null;
};

type MetricsPanelAction =
	| { type: 'message'; message: MessageFromExtension }
	| { type: 'dismissError' };

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
				return { ...nextStateBase, breakdown: null };
			}

			const isSameScan = previousScanKey !== undefined && previousScanKey === nextScanKey;

			if (isSameScan) {
				// Same scan key: scan was cancelled; keep existing breakdown if present.
				return nextStateBase;
			}

			// New scan: drop stale breakdown (backend re-sends it immediately after update).
			return { ...nextStateBase, breakdown: null };
		}
		case 'noRoot':
			return {
				...state,
				isReady: true,
				viewData: { isScanning: false, scanResult: undefined },
				breakdown: null,
				progressData: null,
				isCalculatingLOC: false,
			};
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

interface SizeSlice {
	viewData: ViewData;
	breakdown: SizeBreakdownResult | null;
	progressData: ProgressData | null;
	isCollapsed: boolean;
	actions: {
		refreshOrCancelScan: () => void;
		revealInExplorer: (path: string) => void;
		toggleCollapse: () => void;
	};
}

interface LocSlice {
	result: LOCResult | null;
	isCalculating: boolean;
	isCollapsed: boolean;
	showAllFiles: boolean;
	showAllLanguages: boolean;
	actions: {
		cancelOrRecalculate: () => void;
		openFile: (path: string) => void;
		toggleCollapse: () => void;
		toggleShowAllFiles: () => void;
		toggleShowAllLanguages: () => void;
	};
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

	// UI-only state (collapse, show-more)
	const [isLocCollapsed, setIsLocCollapsed] = useState(false);
	const [locShowAllFiles, setLocShowAllFiles] = useState(false);
	const [locShowAllLanguages, setLocShowAllLanguages] = useState(false);
	const [isSizeCollapsed, setIsSizeCollapsed] = useState(false);

	useEffect(() => {
		function handleMessage(event: MessageEvent<MessageFromExtension>) {
			dispatch({ type: 'message', message: event.data });
		}

		window.addEventListener('message', handleMessage);
		postReady();

		return () => window.removeEventListener('message', handleMessage);
	}, []);

	const refreshOrCancelScan = useCallback(() => {
		if (state.viewData.isScanning) postCancelScan();
		else postRefresh();
	}, [state.viewData.isScanning]);

	const cancelOrRecalculateLoc = useCallback(() => {
		if (state.isCalculatingLOC) postCancelScan();
		else postCalculateLOC();
	}, [state.isCalculatingLOC]);

	const dismissError = useCallback(() => {
		dispatch({ type: 'dismissError' });
	}, []);

	const toggleLocCollapse = useCallback(() => setIsLocCollapsed(v => !v), []);
	const toggleLocShowAllFiles = useCallback(() => setLocShowAllFiles(v => !v), []);
	const toggleLocShowAllLanguages = useCallback(() => setLocShowAllLanguages(v => !v), []);
	const toggleSizeCollapse = useCallback(() => setIsSizeCollapsed(v => !v), []);

	const size = useMemo<SizeSlice>(
		() => ({
			viewData: state.viewData,
			breakdown: state.breakdown,
			progressData: state.progressData,
			isCollapsed: isSizeCollapsed,
			actions: {
				refreshOrCancelScan,
				revealInExplorer: postRevealInExplorer,
				toggleCollapse: toggleSizeCollapse,
			},
		}),
		[
			state.viewData,
			state.breakdown,
			state.progressData,
			isSizeCollapsed,
			refreshOrCancelScan,
			toggleSizeCollapse,
		]
	);

	const loc = useMemo<LocSlice>(
		() => ({
			result: state.locResult,
			isCalculating: state.isCalculatingLOC,
			isCollapsed: isLocCollapsed,
			showAllFiles: locShowAllFiles,
			showAllLanguages: locShowAllLanguages,
			actions: {
				cancelOrRecalculate: cancelOrRecalculateLoc,
				openFile: postOpenFile,
				toggleCollapse: toggleLocCollapse,
				toggleShowAllFiles: toggleLocShowAllFiles,
				toggleShowAllLanguages: toggleLocShowAllLanguages,
			},
		}),
		[
			state.locResult,
			state.isCalculatingLOC,
			isLocCollapsed,
			locShowAllFiles,
			locShowAllLanguages,
			cancelOrRecalculateLoc,
			toggleLocCollapse,
			toggleLocShowAllFiles,
			toggleLocShowAllLanguages,
		]
	);

	return {
		isReady: state.isReady,
		error: state.error,
		dismissError,
		size,
		loc,
	};
}
