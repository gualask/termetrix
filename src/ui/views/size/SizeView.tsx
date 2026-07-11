import {
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	Clock,
	Folder,
	FolderX,
	HardDrive,
	Loader2,
	RefreshCw,
	Square,
	Timer,
} from 'lucide-preact';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { InfoTooltip } from '../../components/InfoTooltip';
import { MetricsHeader } from '../../components/MetricsHeader';
import { PanelOverlay } from '../../components/PanelOverlay';
import { ViewLayout } from '../../components/ViewLayout';
import { useRelativeTime } from '../../hooks/useRelativeTime';
import type { ProgressData, SizeBreakdownResult, ViewData } from '../../types';
import { formatBytes, formatIncompleteReason } from '../../utils';
import { SizeChart } from './SizeChart';
import { formatLoadingLabel, formatScanSummaryValue } from './sizeFormatters';

const SIZE_TOOLTIP_LINES = ['Top directories by disk usage', 'Only the heaviest are listed'];

interface Props {
	viewData: ViewData;
	breakdown: SizeBreakdownResult | null;
	progressData: ProgressData | null;
	isCollapsed: boolean;
	onRefreshOrCancelScan: () => void;
	onRevealInExplorer: (path: string) => void;
	onToggleCollapse: () => void;
}

export function SizeView({
	viewData,
	breakdown,
	progressData,
	isCollapsed,
	onRefreshOrCancelScan,
	onRevealInExplorer,
	onToggleCollapse,
}: Props) {
	const scanResult = viewData.scanResult;
	const hasRoot = Boolean(scanResult) || viewData.isScanning;
	const isRefreshing = viewData.isScanning;
	const showIncompleteWarning = Boolean(scanResult?.incomplete && !viewData.isScanning);
	const scannedLabel = useRelativeTime(scanResult?.metadata.endTime);
	const loadingLabel = formatLoadingLabel(viewData.isScanning, progressData);

	const CollapseIcon = isCollapsed ? ChevronRight : ChevronDown;

	const header = (
		<MetricsHeader
			ariaLabel="Project size"
			metricsAriaLabel="Scan summary"
			primary={{
				title: 'Total size',
				icon: <HardDrive size={22} class="tmx-metric-primaryIcon" aria-hidden="true" />,
				value: scanResult ? formatBytes(scanResult.totalBytes) : '—',
			}}
			secondary={[
				{
					title: 'Directories scanned',
					icon: <Folder size={14} aria-hidden="true" />,
					content: formatScanSummaryValue(scanResult?.metadata, 'directoriesScanned'),
				},
				{
					title: 'Scan duration',
					icon: <Timer size={14} aria-hidden="true" />,
					content: formatScanSummaryValue(scanResult?.metadata, 'duration'),
				},
				...(scanResult?.skippedCount && scanResult.skippedCount > 0
					? [
							{
								title: 'Skipped entries',
								icon: <FolderX size={14} aria-hidden="true" />,
								content: `${scanResult.skippedCount} skipped (unreadable)`,
							},
						]
					: []),
				...(scannedLabel && !viewData.isScanning
					? [{ title: 'Last scanned', icon: <Clock size={14} aria-hidden="true" />, content: scannedLabel }]
					: []),
			]}
			actions={
				<>
					<InfoTooltip lines={SIZE_TOOLTIP_LINES} />
					{hasRoot && (
						<IconButton
							onClick={onRefreshOrCancelScan}
							title={viewData.isScanning ? 'Cancel scan' : 'Refresh scan'}
							ariaLabel={viewData.isScanning ? 'Cancel scan' : 'Refresh scan'}
						>
							{viewData.isScanning ? <Square size={16} /> : <RefreshCw size={16} />}
						</IconButton>
					)}
					<IconButton
						onClick={onToggleCollapse}
						title={isCollapsed ? 'Expand Size section' : 'Collapse Size section'}
						ariaLabel={isCollapsed ? 'Expand Size section' : 'Collapse Size section'}
					>
						<CollapseIcon size={16} />
					</IconButton>
				</>
			}
		/>
	);

	return (
		<ViewLayout viewClass="size-view" header={header} bodyAriaLabel="Directory breakdown" isCollapsed={isCollapsed}>
			{!hasRoot ? (
				<EmptyState
					variant="panel"
					message="No workspace folder open."
					hint="Open a folder or workspace to get started."
				/>
			) : breakdown ? (
				// Breakdown data available: show chart, overlay on top during refresh
				<div class="tmx-panel-card tmx-panel-fixed">
					{showIncompleteWarning && (
						<div class="warning-banner">
							<AlertTriangle size={14} aria-hidden="true" />
							<span>Scan incomplete: {formatIncompleteReason(scanResult?.incompleteReason)}</span>
						</div>
					)}
					<SizeChart
						breakdown={breakdown}
						totalBytes={scanResult?.totalBytes ?? 0}
						onReveal={onRevealInExplorer}
						isLoading={isRefreshing}
					/>
					{isRefreshing && <PanelOverlay label={loadingLabel} />}
				</div>
			) : (
				// No breakdown yet: inline loading with its own height
				<div class="tmx-breakdown-loading" aria-live="polite">
					<Loader2 size={28} class="spinner" />
					<span>{loadingLabel}</span>
				</div>
			)}
		</ViewLayout>
	);
}
