import { Loader2 } from 'lucide-preact';
import { EmptyState } from './components/EmptyState';
import { ErrorBanner } from './components/ErrorBanner';
import { useMetricsPanelState } from './hooks/useMetricsPanelState';
import { LocView } from './views/loc/LocView';
import { SizeView } from './views/size/SizeView';

export function App() {
	const { isReady, error, dismissError, size, loc } = useMetricsPanelState();

	if (!isReady) {
		return (
			<div class="app">
				<div class="content">
					<EmptyState variant="page" message="Loading…" leading={<Loader2 size={32} class="spinner" />} />
				</div>
			</div>
		);
	}

	return (
		<div class="app">
			{error && <ErrorBanner error={error} onDismiss={dismissError} />}

			<div class="content">
				<LocView
					locResult={loc.result}
					isCalculating={loc.isCalculating}
					hasRoot={Boolean(size.viewData.scanResult) || size.viewData.isScanning}
					onRefreshOrCancel={loc.actions.cancelOrRecalculate}
					onOpenFile={loc.actions.openFile}
					isCollapsed={loc.isCollapsed}
					onToggleCollapse={loc.actions.toggleCollapse}
					showAllFiles={loc.showAllFiles}
					onToggleShowAllFiles={loc.actions.toggleShowAllFiles}
					showAllLanguages={loc.showAllLanguages}
					onToggleShowAllLanguages={loc.actions.toggleShowAllLanguages}
				/>

				<SizeView
					viewData={size.viewData}
					breakdown={size.breakdown}
					progressData={size.progressData}
					isCollapsed={size.isCollapsed}
					onRefreshOrCancelScan={size.actions.refreshOrCancelScan}
					onRevealInExplorer={size.actions.revealInExplorer}
					onToggleCollapse={size.actions.toggleCollapse}
				/>
			</div>
		</div>
	);
}
