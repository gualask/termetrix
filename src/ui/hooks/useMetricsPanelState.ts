import { useCallback, useEffect, useMemo, useReducer, useState } from 'preact/hooks';
import { initialMetricsPanelState, metricsPanelReducer } from '../metricsPanelReducer';
import type { ErrorData, LOCResult, MessageFromExtension, ProgressData, SizeBreakdownResult, ViewData } from '../types';
import {
	postCalculateLOC,
	postCancelScan,
	postOpenFile,
	postReady,
	postRefresh,
	postRevealInExplorer,
} from '../vscode';

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
		if (state.viewData.isScanning) postCancelScan('size');
		else postRefresh();
	}, [state.viewData.isScanning]);

	const cancelOrRecalculateLoc = useCallback(() => {
		if (state.isCalculatingLOC) postCancelScan('loc');
		else postCalculateLOC();
	}, [state.isCalculatingLOC]);

	const dismissError = useCallback(() => {
		dispatch({ type: 'dismissError' });
	}, []);

	const toggleLocCollapse = useCallback(() => setIsLocCollapsed((v) => !v), []);
	const toggleLocShowAllFiles = useCallback(() => setLocShowAllFiles((v) => !v), []);
	const toggleLocShowAllLanguages = useCallback(() => setLocShowAllLanguages((v) => !v), []);
	const toggleSizeCollapse = useCallback(() => setIsSizeCollapsed((v) => !v), []);

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
		[state.viewData, state.breakdown, state.progressData, isSizeCollapsed, refreshOrCancelScan, toggleSizeCollapse],
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
		],
	);

	return {
		isReady: state.isReady,
		error: state.error,
		dismissError,
		size,
		loc,
	};
}
