import { useEffect, useState, useCallback } from 'preact/hooks';
import type { DirectoryInfo, LOCResult, MessageFromExtension, ViewData } from '../types';
import { postToExtension } from '../vscode';

interface Actions {
	refreshOrCancelScan: () => void;
	revealInExplorer: (path: string) => void;
	calculateLOC: () => void;
	openFile: (path: string) => void;
}

interface State {
	isReady: boolean;
	viewData: ViewData;
	deepDirectories: DirectoryInfo[] | null;
	locResult: LOCResult | null;
	isCalculatingLOC: boolean;
	actions: Actions;
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

	useEffect(() => {
		function handleMessage(event: MessageEvent<MessageFromExtension>) {
			const message = event.data;

			switch (message.type) {
				case 'scanStart':
					setViewData(prev => ({ ...prev, isScanning: true }));
					setDeepDirectories(null);
					break;
				case 'progress':
					break;
				case 'update':
					setIsReady(true);
					setViewData(message.data);
					postToExtension({ command: 'deepScan' });
					break;
				case 'noRoot':
					setIsReady(true);
					setViewData({
						isScanning: false,
						scanResult: undefined
					});
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
		viewData,
		deepDirectories,
		locResult,
		isCalculatingLOC,
		actions: {
			refreshOrCancelScan,
			revealInExplorer,
			calculateLOC,
			openFile
		}
	};
}

