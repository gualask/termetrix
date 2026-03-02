import { formatBytes } from '../../utils';
import { SIZE_BREAKDOWN_ROOT_SEGMENT } from '../../../protocol/types';

export function validateShare(share?: number): { showShare: boolean; clampedShare: number } {
	const showShare = typeof share === 'number' && Number.isFinite(share);
	const clampedShare = showShare ? Math.max(0, Math.min(1, share!)) : 0;
	return { showShare, clampedShare };
}

export function formatBreakdownParentPath(value: string): string {
	return value === SIZE_BREAKDOWN_ROOT_SEGMENT ? 'Project root' : value;
}

export function formatLoadingLabel(isScanning: boolean, progressData: { bytesScanned: number; directoriesScanned: number } | null): string {
	if (isScanning) {
		if (!progressData) return 'Scanning…';
		return `Scanning… ${formatBytes(progressData.bytesScanned)} (${progressData.directoriesScanned.toLocaleString()} directories)`;
	}
	return 'Preparing…';
}

export function formatScanSummaryValue(metadata: { directoriesScanned: number; duration: number } | undefined, key: 'directoriesScanned' | 'duration'): string {
	if (!metadata) return '—';
	if (key === 'directoriesScanned') return metadata.directoriesScanned.toLocaleString();
	return `${(metadata.duration / 1000).toFixed(1)}s`;
}
