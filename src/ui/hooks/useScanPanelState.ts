import { useEffect, useState, useCallback } from 'preact/hooks';
import type { DirectoryInfo, LOCResult, MessageFromExtension, ViewData, ProgressData, ErrorData } from '../types';
import { postToExtension } from '../vscode';

interface Actions {
	refreshOrCancelScan: () => void;
	revealInExplorer: (path: string) => void;
	calculateLOC: () => void;
	openFile: (path: string) => void;
	dismissError: () => void;
}

interface SizeSlice {
	viewData: ViewData;
	deepDirectories: DirectoryInfo[] | null;
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

export function useScanPanelState(): State {
	const [viewData, setViewData] = useState<ViewData>({
		isScanning: false,
		scanResult: undefined
	});

	const [locResult, setLocResult] = useState<LOCResult | null>(null);
	const [isCalculatingLOC, setIsCalculatingLOC] = useState(false);
	const [isReady, setIsReady] = useState(false);
	const [deepDirectories, setDeepDirectories] = useState<DirectoryInfo[] | null>(null);
	const [isDeepScanning, setIsDeepScanning] = useState(false);
	const [progressData, setProgressData] = useState<ProgressData | null>(null);
	const [error, setError] = useState<ErrorData | null>(null);

	const clearSizeDerivedData = (): void => {
		setDeepDirectories(null);
		setProgressData(null);
	};

	const resetSizeDerivedState = (): void => {
		clearSizeDerivedData();
		setIsDeepScanning(false);
	};

	useEffect(() => {
		const handleScanStart = (): void => {
			setViewData((prev) => ({
				...prev,
				isScanning: true,
				// Clear incomplete flag when starting a new scan
				scanResult: prev.scanResult ? { ...prev.scanResult, incomplete: false } : undefined,
			}));
			resetSizeDerivedState();
		};

		const handleUpdate = (next: ViewData): void => {
			setIsReady(true);
			setViewData(next);
			clearSizeDerivedData();

			if (!next.scanResult) {
				setIsDeepScanning(false);
				return;
			}

			setIsDeepScanning(true);
			postToExtension({ command: 'deepScan' });
		};

		const handleNoRoot = (): void => {
			setIsReady(true);
			setViewData({
				isScanning: false,
				scanResult: undefined,
			});
			resetSizeDerivedState();
		};

		function handleMessage(event: MessageEvent<MessageFromExtension>) {
			const message = event.data;

			switch (message.type) {
				case 'scanStart':
					handleScanStart();
					break;
				case 'progress':
					setProgressData(message.data);
					break;
				case 'update':
					handleUpdate(message.data);
					break;
				case 'noRoot':
					handleNoRoot();
					break;
				case 'locCalculating':
					setIsCalculatingLOC(true);
					break;
				case 'locResult':
					setLocResult(message.data);
					setIsCalculatingLOC(false);
					break;
				case 'deepScanResult':
					setDeepDirectories(message.data);
					setIsDeepScanning(false);
					break;
				case 'error':
					setError(message.data);
					setIsCalculatingLOC(false);
					break;
			}
		}

		window.addEventListener('message', handleMessage);
		postToExtension({ command: 'ready' });

		return () => window.removeEventListener('message', handleMessage);
	}, []);

	const refreshOrCancelScan = useCallback(() => {
		postToExtension({ command: viewData.isScanning ? 'cancelScan' : 'refresh' });
	}, [viewData.isScanning]);

	const revealInExplorer = useCallback((path: string) => {
		postToExtension({ command: 'revealInExplorer', path });
	}, []);

	const calculateLOC = useCallback(() => {
		postToExtension({ command: 'calculateLOC' });
	}, []);

	const openFile = useCallback((path: string) => {
		postToExtension({ command: 'openFile', path });
	}, []);

	const dismissError = useCallback(() => {
		setError(null);
	}, []);

	return {
		isReady,
		error,
		dismissError,
		size: {
			viewData,
			deepDirectories,
			isDeepScanning,
			progressData,
			actions: {
				refreshOrCancelScan,
				revealInExplorer
			}
		},
		loc: {
			result: locResult,
			isCalculating: isCalculatingLOC,
			actions: {
				calculateLOC,
				openFile
			}
		}
	};
}
