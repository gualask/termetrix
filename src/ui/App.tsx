import { useEffect, useState } from 'preact/hooks';
import { Loader2 } from 'lucide-preact';
import { TabBar } from './components/TabBar';
import { LocView } from './views/loc/LocView';
import { SizeView } from './views/size/SizeView';
import { EmptyState } from './components/EmptyState';
import { ErrorBanner } from './components/ErrorBanner';
import { useMetricsPanelState } from './hooks/useMetricsPanelState';
import { postTabActivated } from './vscode';
import type { MetricsTab } from './types';

export function App() {
	const { isReady, error, dismissError, size, loc } = useMetricsPanelState();

	const [activeTab, setActiveTab] = useState<MetricsTab>('size');

	useEffect(() => {
		if (!isReady) return;
		postTabActivated(activeTab);
	}, [activeTab, isReady]);

	const activeView =
		activeTab === 'size' ? (
			<SizeView
				viewData={size.viewData}
				breakdown={size.breakdown}
				isDeepScanning={size.isDeepScanning}
				progressData={size.progressData}
				onRefreshOrCancelScan={size.actions.refreshOrCancelScan}
				onRevealInExplorer={size.actions.revealInExplorer}
			/>
		) : (
			<LocView
				locResult={loc.result}
				isCalculating={loc.isCalculating}
				hasRoot={Boolean(size.viewData.scanResult)}
				onCalculate={loc.actions.calculateLOC}
				onOpenFile={loc.actions.openFile}
			/>
		);

	if (!isReady) {
		return (
			<div class="app">
				<div class="content">
					<EmptyState
						variant="page"
						message="Loading…"
						leading={<Loader2 size={32} class="spinner" />}
					/>
				</div>
			</div>
		);
	}

	return (
		<div class="app">
			<TabBar activeTab={activeTab} onTabChange={setActiveTab} />

			<div class="content">
				{error && <ErrorBanner error={error} onDismiss={dismissError} />}
				{activeView}
			</div>
		</div>
	);
}
