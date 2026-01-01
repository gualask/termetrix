import { useMemo } from 'preact/hooks';
import { Folder, HardDrive, RefreshCw, Square, Timer } from 'lucide-preact';
import type { DirectoryInfo, ViewData, ProgressData } from '../../types';
import { formatBytes } from '../../utils';
import { SizeChart } from './SizeChart';
import { IconButton } from '../../components/IconButton';
import { PanelOverlay } from '../../components/PanelOverlay';
import { EmptyState } from '../../components/EmptyState';
import { ViewLayout } from '../../components/ViewLayout';
import { MetricsHeader } from '../../components/MetricsHeader';

function getLoadingLabel(viewData: ViewData, progressData: ProgressData | null, isDeepScanning: boolean): string {
	if (viewData.isScanning) {
		if (!progressData) return 'Scanning…';
		return `Scanning… ${formatBytes(progressData.currentBytes)} (${progressData.directoriesScanned.toLocaleString()} directories)`;
	}

	if (isDeepScanning) return 'Analyzing directory structure…';
	return 'Preparing…';
}

function getScanSummaryValue(scanResult: ViewData['scanResult'], key: 'directoriesScanned' | 'duration'): string {
	if (!scanResult) return '—';

	if (key === 'directoriesScanned') return scanResult.metadata.directoriesScanned.toLocaleString();
	return `${(scanResult.metadata.duration / 1000).toFixed(1)}s`;
}

function SizeHeader(props: { viewData: ViewData; onRefreshOrCancelScan: () => void }) {
	const { viewData, onRefreshOrCancelScan } = props;
	const scanResult = viewData.scanResult;

	return (
		<MetricsHeader
			ariaLabel="Project size"
			metricsAriaLabel="Scan summary"
			primary={{
				title: 'Total size',
				icon: <HardDrive size={22} class="tmx-metric-primaryIcon" aria-hidden="true" />,
				value: scanResult ? formatBytes(scanResult.totalBytes) : '—'
			}}
			secondary={[
				{
					title: 'Directories scanned',
					icon: <Folder size={14} aria-hidden="true" />,
					content: getScanSummaryValue(scanResult, 'directoriesScanned')
				},
				{
					title: 'Scan duration',
					icon: <Timer size={14} aria-hidden="true" />,
					content: getScanSummaryValue(scanResult, 'duration')
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
}

function SizePanelBody(props: {
	scanResult: ViewData['scanResult'];
	isScanning: boolean;
	deepDirectories: DirectoryInfo[] | null;
	isLoading: boolean;
	loadingLabel: string;
	onRevealInExplorer: (path: string) => void;
}) {
	const { scanResult, isScanning, deepDirectories, isLoading, loadingLabel, onRevealInExplorer } = props;

	const showIncompleteWarning = Boolean(scanResult?.incomplete && !isScanning);

	if (!deepDirectories) {
		if (!isLoading) {
			return (
				<EmptyState
					variant="panel"
					message="No data yet."
					hint="Use the refresh button in the header to scan your project."
				/>
			);
		}

		return <PanelOverlay label={loadingLabel} />;
	}

	return (
		<>
			{showIncompleteWarning && (
				<div class="warning-banner">⚠ Scan incomplete ({scanResult?.incompleteReason})</div>
			)}

			<SizeChart
				directories={deepDirectories}
				totalBytes={scanResult?.totalBytes ?? 0}
				onReveal={onRevealInExplorer}
				isLoading={isLoading}
			/>

			{isLoading && <PanelOverlay label={loadingLabel} />}
		</>
	);
}

interface Props {
	viewData: ViewData;
	deepDirectories: DirectoryInfo[] | null;
	isDeepScanning: boolean;
	progressData: ProgressData | null;
	onRefreshOrCancelScan: () => void;
	onRevealInExplorer: (path: string) => void;
}

export function SizeView({
	viewData,
	deepDirectories,
	isDeepScanning,
	progressData,
	onRefreshOrCancelScan,
	onRevealInExplorer,
}: Props) {
	const isLoading = viewData.isScanning || isDeepScanning;

	const loadingLabel = useMemo(() => {
		return getLoadingLabel(viewData, progressData, isDeepScanning);
	}, [viewData.isScanning, progressData, isDeepScanning]);

	return (
		<ViewLayout
			viewClass="size-view"
			header={<SizeHeader viewData={viewData} onRefreshOrCancelScan={onRefreshOrCancelScan} />}
			panelVariant="fixed"
			panelAriaLabel="Directory breakdown"
		>
			<SizePanelBody
				scanResult={viewData.scanResult}
				isScanning={viewData.isScanning}
				deepDirectories={deepDirectories}
				isLoading={isLoading}
				loadingLabel={loadingLabel}
				onRevealInExplorer={onRevealInExplorer}
			/>
		</ViewLayout>
	);
}
