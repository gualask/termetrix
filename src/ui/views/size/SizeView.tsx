import { Folder, HardDrive, RefreshCw, Square, Timer } from 'lucide-preact';
import type { DirectoryInfo, ViewData } from '../../types';
import { formatBytes } from '../../utils';
import { SizeChart } from './SizeChart';
import { IconButton } from '../../components/IconButton';
import { PanelOverlay } from '../../components/PanelOverlay';
import { EmptyState } from '../../components/EmptyState';
import { ViewLayout } from '../../components/ViewLayout';
import { MetricsHeader } from '../../components/MetricsHeader';

interface Props {
	viewData: ViewData;
	deepDirectories: DirectoryInfo[] | null;
	isDeepScanning: boolean;
	onRefreshOrCancelScan: () => void;
	onRevealInExplorer: (path: string) => void;
}

export function SizeView({
	viewData,
	deepDirectories,
	isDeepScanning,
	onRefreshOrCancelScan,
	onRevealInExplorer,
}: Props) {
	const header = (
		<MetricsHeader
			ariaLabel="Workspace size"
			metricsAriaLabel="Scan summary"
			primary={{
				title: 'Total size',
				icon: <HardDrive size={22} class="tmx-metric-primaryIcon" aria-hidden="true" />,
				value: viewData.scanResult ? formatBytes(viewData.scanResult.totalBytes) : '—'
			}}
			secondary={[
				{
					title: 'Directories scanned',
					icon: <Folder size={14} aria-hidden="true" />,
					content: viewData.scanResult
						? viewData.scanResult.metadata.directoriesScanned.toLocaleString()
						: '—'
				},
				{
					title: 'Scan duration',
					icon: <Timer size={14} aria-hidden="true" />,
					content: viewData.scanResult
						? `${(viewData.scanResult.metadata.duration / 1000).toFixed(1)}s`
						: '—'
				}
			]}
			actions={
				<IconButton
					onClick={onRefreshOrCancelScan}
					title={viewData.isScanning ? 'Cancel scan' : 'Refresh scan'}
					ariaLabel={viewData.isScanning ? 'Cancel scan' : 'Refresh scan'}
				>
					{viewData.isScanning ? <Square size={16} /> : <RefreshCw size={16} />}
				</IconButton>
			}
			caption={`Click a row to reveal in Explorer${viewData.isScanning ? ' (scanning…)' : ''}.`}
			captionAriaLive="polite"
		/>
	);

	const isLoading = viewData.isScanning || isDeepScanning;

	return (
		<ViewLayout
			viewClass="size-view"
			header={header}
			panelVariant="fixed"
			panelAriaLabel="Directory breakdown"
		>
				{viewData.scanResult?.incomplete && (
					<div class="warning-banner">⚠ Scan incomplete ({viewData.scanResult.incompleteReason})</div>
				)}

				{deepDirectories ? (
					<SizeChart
						directories={deepDirectories}
						totalBytes={viewData.scanResult?.totalBytes ?? 0}
						onReveal={onRevealInExplorer}
						isLoading={isLoading}
					/>
				) : (
					!isLoading && (
						<EmptyState
							variant="panel"
							message="No data yet."
							hint="Use the refresh button in the header to scan your workspace."
						/>
					)
				)}

				{isLoading && <PanelOverlay label={viewData.isScanning ? 'Scanning…' : 'Preparing…'} />}
		</ViewLayout>
	);
}
