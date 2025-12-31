import { useEffect, useState, useCallback } from 'preact/hooks';
import type { DirectoryInfo, LOCResult, MessageFromExtension, ViewData } from '../types';
import { postToExtension } from '../vscode';

interface Actions {
	refreshOrCancelScan: () => void;
	revealInExplorer: (path: string) => void;
	calculateLOC: () => void;
	openFile: (path: string) => void;
}

interface SizeSlice {
	viewData: ViewData;
	deepDirectories: DirectoryInfo[] | null;
	isDeepScanning: boolean;
	actions: Pick<Actions, 'refreshOrCancelScan' | 'revealInExplorer'>;
}

interface LocSlice {
	result: LOCResult | null;
	isCalculating: boolean;
	actions: Pick<Actions, 'calculateLOC' | 'openFile'>;
}

interface State {
	isReady: boolean;
	size: SizeSlice;
	loc: LocSlice;
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

	useEffect(() => {
		function handleMessage(event: MessageEvent<MessageFromExtension>) {
			const message = event.data;

			switch (message.type) {
				case 'scanStart':
					setViewData(prev => ({ ...prev, isScanning: true }));
					setDeepDirectories(null);
					setIsDeepScanning(false);
					break;
				case 'progress':
					break;
				case 'update':
					setIsReady(true);
					setViewData(message.data);
					setDeepDirectories(null);
					setIsDeepScanning(true);
					postToExtension({ command: 'deepScan' });
					break;
				case 'noRoot':
					setIsReady(true);
					setViewData({
						isScanning: false,
						scanResult: undefined
					});
					setDeepDirectories(null);
					setIsDeepScanning(false);
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

	return {
		isReady,
		size: {
			viewData,
			deepDirectories,
			isDeepScanning,
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
