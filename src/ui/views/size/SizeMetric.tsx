import { formatBytes } from '../../utils';
import { validateShare } from './sizeFormatters';

type SizeMetricVariant = 'total' | 'parent';

interface SizeMetricInfo {
	sizeBytes: number;
	share?: number; // 0..1
	variant: SizeMetricVariant;
	fileCount?: number;
	maxFileBytes?: number;
}

interface SizeMetricProps {
	sizeBytes: number;
	share?: number; // 0..1
	variant: SizeMetricVariant;
}

function formatPercent(value: number): string {
	if (!Number.isFinite(value)) return '—';
	const pct = value * 100;
	if (pct < 0.1 && pct > 0) return '<0.1%';
	return `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
}

export function buildSizeMetricTooltipLines(props: SizeMetricInfo): string[] {
	const { sizeBytes, share, variant, fileCount, maxFileBytes } = props;

	const lines: string[] = [];

	const { showShare, clampedShare } = validateShare(share);

	const showStats = typeof fileCount === 'number' && typeof maxFileBytes === 'number';
	const avgBytes = showStats && fileCount > 0 ? sizeBytes / fileCount : 0;
	const maxText = showStats && maxFileBytes! > 0 ? formatBytes(maxFileBytes!) : '—';

	if (showShare) {
		const label = variant === 'total' ? 'Share of total' : 'Share of parent';
		lines.push(`${label}: ${formatPercent(clampedShare)}`);
	}

	if (showStats) {
		lines.push(`Files: ${fileCount!.toLocaleString()}`);
		lines.push(`Avg: ${formatBytes(avgBytes)}`);
		lines.push(`Max: ${maxText}`);
	}

	return lines;
}

export function SizeMetric({ sizeBytes, share, variant }: SizeMetricProps) {
	const { showShare, clampedShare } = validateShare(share);

	return (
		<div class={`tmx-sizeMetric tmx-sizeMetric--${variant}`}>
			<div class="tmx-sizeMetricValue">{formatBytes(sizeBytes)}</div>
			{showShare && (
				<div class="tmx-sizeMetricVBar" aria-hidden="true">
					<div class="tmx-sizeMetricVFill" style={{ height: `${clampedShare * 100}%` }} />
				</div>
			)}
		</div>
	);
}
