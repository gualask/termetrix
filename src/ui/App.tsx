import { useState } from 'preact/hooks';
import { Loader2 } from 'lucide-preact';
import { TabBar, type Tab } from './components/TabBar';
import { LocView } from './components/LocView';
import { SizeView } from './components/SizeView';
import { EmptyState } from './components/EmptyState';
import { useScanPanelState } from './hooks/useScanPanelState';

export function App() {
	const { isReady, size, loc } = useScanPanelState();

	const [activeTab, setActiveTab] = useState<Tab>('size');

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

			{activeTab === 'size' ? (
				<SizeView
					viewData={size.viewData}
					deepDirectories={size.deepDirectories}
					isDeepScanning={size.isDeepScanning}
					onRefreshOrCancelScan={size.actions.refreshOrCancelScan}
					onRevealInExplorer={size.actions.revealInExplorer}
				/>
				) : (
					<LocView
						locResult={loc.result}
						isCalculating={loc.isCalculating}
						onCalculate={loc.actions.calculateLOC}
						onOpenFile={loc.actions.openFile}
					/>
				)}
			</div>
	);
}
