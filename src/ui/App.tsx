import { useState, useEffect } from 'preact/hooks';
import { Folder, HardDrive, Loader2, RefreshCw, Square, Timer } from 'lucide-preact';
import type { MessageFromExtension, MessageToExtension, ViewData, LOCResult, DirectoryInfo } from './types';
import { TabBar, type Tab } from './components/TabBar';
import { SizeChart } from './components/SizeChart';
import { LocView } from './components/LocView';
import { formatBytes } from './utils';

declare function acquireVsCodeApi(): {
	postMessage(message: unknown): void;
};

const vscode = acquireVsCodeApi();

function sendMessage(message: MessageToExtension) {
	vscode.postMessage(message);
}

export function App() {
	const [viewData, setViewData] = useState<ViewData>({
		isScanning: false,
		scanResult: undefined
	});

	const [activeTab, setActiveTab] = useState<Tab>('size');
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
					setDeepDirectories(null); // Reset deep scan on new scan
					break;
				case 'progress':
					// Progress updates could be shown if needed
					break;
				case 'update':
					setIsReady(true);
					setViewData(message.data);
					// Automatically trigger deep scan after update
					sendMessage({ command: 'deepScan' });
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
		sendMessage({ command: 'ready' });

		return () => window.removeEventListener('message', handleMessage);
	}, []);

	if (!isReady) {
		return (
			<div class="app loading">
				<Loader2 size={32} class="spinner" />
				<p>Loading...</p>
			</div>
		);
	}

	return (
		<div class="app">
			<TabBar activeTab={activeTab} onTabChange={setActiveTab} />

			{activeTab === 'size' ? (
				<div class="content size-view">
					<header class="size-header" aria-label="Workspace size">
						<div class="tmx-hero">
							<div class="tmx-hero-row">
								<div class="tmx-metrics-line" aria-label="Scan summary">
									<span class="tmx-metric-primary" title="Total size">
										<HardDrive size={22} class="tmx-metric-primaryIcon" aria-hidden="true" />
										<span class="tmx-metric-primaryValue">
													{viewData.scanResult ? formatBytes(viewData.scanResult.totalBytes) : '—'}
										</span>
									</span>
									<span class="tmx-metric-sep" aria-hidden="true">-</span>
									<span class="tmx-metric-secondary" title="Directories scanned">
										<Folder size={14} aria-hidden="true" />
										<span>
											{viewData.scanResult ? viewData.scanResult.metadata.directoriesScanned.toLocaleString() : '—'}
										</span>
									</span>
									<span class="tmx-metric-sep" aria-hidden="true">-</span>
									<span class="tmx-metric-secondary" title="Scan duration">
										<Timer size={14} aria-hidden="true" />
										<span>
											{viewData.scanResult ? `${(viewData.scanResult.metadata.duration / 1000).toFixed(1)}s` : '—'}
										</span>
									</span>
								</div>

								<div class="tmx-metric-actions">
									<button
										class="tmx-icon-button"
										onClick={() => sendMessage({
											command: viewData.isScanning ? 'cancelScan' : 'refresh'
										})}
										title={viewData.isScanning ? 'Cancel scan' : 'Refresh scan'}
										aria-label={viewData.isScanning ? 'Cancel scan' : 'Refresh scan'}
									>
										{viewData.isScanning ? (
											<Square size={16} />
										) : (
											<RefreshCw size={16} />
										)}
									</button>
								</div>
							</div>

							<div class="tmx-caption" aria-live="polite">
								Click a row to reveal in Explorer{viewData.isScanning ? ' (scanning…)': ''}.
							</div>
						</div>
					</header>

					<section class="size-panel" aria-label="Directory breakdown">
						{viewData.scanResult?.incomplete && (
							<div class="warning-banner">
								⚠ Scan incomplete ({viewData.scanResult.incompleteReason})
							</div>
						)}

						<SizeChart
							directories={deepDirectories}
							totalBytes={viewData.scanResult?.totalBytes ?? 0}
							onReveal={(path) => sendMessage({ command: 'revealInExplorer', path })}
							isLoading={viewData.isScanning}
						/>

						{viewData.isScanning && (
							<div class="tmx-panel-overlay" aria-live="polite">
								<Loader2 size={28} class="spinner" />
								<span>Scanning…</span>
							</div>
						)}
					</section>
				</div>
				) : (
					<div class="content loc-view">
						<LocView
							locResult={locResult}
							isCalculating={isCalculatingLOC}
							onCalculate={() => sendMessage({ command: 'calculateLOC' })}
							onOpenFile={(path) => sendMessage({ command: 'openFile', path })}
						/>
					</div>
				)}
			</div>
	);
}
