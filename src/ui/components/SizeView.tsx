import { Folder, HardDrive, RefreshCw, Square, Timer } from 'lucide-preact';
import type { DirectoryInfo, ViewData } from '../types';
import { formatBytes } from '../utils';
import { SizeChart } from './SizeChart';
import { IconButton } from './IconButton';
import { PanelOverlay } from './PanelOverlay';

interface Props {
	viewData: ViewData;
	deepDirectories: DirectoryInfo[] | null;
	onRefreshOrCancelScan: () => void;
	onRevealInExplorer: (path: string) => void;
}

export function SizeView({
	viewData,
	deepDirectories,
	onRefreshOrCancelScan,
	onRevealInExplorer,
}: Props) {
	return (
		<div class="content size-view">
			<header class="tmx-header-card" aria-label="Workspace size">
				<div class="tmx-hero">
					<div class="tmx-hero-row">
						<div class="tmx-metrics-line" aria-label="Scan summary">
							<span class="tmx-metric-primary" title="Total size">
								<HardDrive size={22} class="tmx-metric-primaryIcon" aria-hidden="true" />
								<span class="tmx-metric-primaryValue">
									{viewData.scanResult ? formatBytes(viewData.scanResult.totalBytes) : '—'}
								</span>
							</span>
							<span class="tmx-metric-sep" aria-hidden="true">
								-
							</span>
							<span class="tmx-metric-secondary" title="Directories scanned">
								<Folder size={14} aria-hidden="true" />
								<span>
									{viewData.scanResult
										? viewData.scanResult.metadata.directoriesScanned.toLocaleString()
										: '—'}
								</span>
							</span>
							<span class="tmx-metric-sep" aria-hidden="true">
								-
							</span>
							<span class="tmx-metric-secondary" title="Scan duration">
								<Timer size={14} aria-hidden="true" />
								<span>
									{viewData.scanResult
										? `${(viewData.scanResult.metadata.duration / 1000).toFixed(1)}s`
										: '—'}
								</span>
							</span>
						</div>

						<div class="tmx-metric-actions">
							<IconButton
								onClick={onRefreshOrCancelScan}
								title={viewData.isScanning ? 'Cancel scan' : 'Refresh scan'}
								ariaLabel={viewData.isScanning ? 'Cancel scan' : 'Refresh scan'}
							>
								{viewData.isScanning ? <Square size={16} /> : <RefreshCw size={16} />}
							</IconButton>
						</div>
					</div>

					<div class="tmx-caption" aria-live="polite">
						Click a row to reveal in Explorer{viewData.isScanning ? ' (scanning…)' : ''}.
					</div>
				</div>
			</header>

			<section class="tmx-panel-card tmx-panel-fixed" aria-label="Directory breakdown">
				{viewData.scanResult?.incomplete && (
					<div class="warning-banner">⚠ Scan incomplete ({viewData.scanResult.incompleteReason})</div>
				)}

				<SizeChart
					directories={deepDirectories}
					totalBytes={viewData.scanResult?.totalBytes ?? 0}
					onReveal={onRevealInExplorer}
					isLoading={viewData.isScanning}
				/>

				{viewData.isScanning && (
					<PanelOverlay label="Scanning…" />
				)}
			</section>
		</div>
	);
}
