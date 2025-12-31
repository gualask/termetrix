import type { ScanResult } from '../../types';
import { formatBytes, formatDuration } from '../../common/formatters';

interface TooltipOptions {
	maxDirectories?: number;
}

/**
 * Builds tooltip content for project metrics
 * Single responsibility: formatting scan results into readable tooltip
 */
export function buildMetricsTooltip(
	_rootPath: string,
	scanResult: ScanResult,
	_cache: unknown,
	options: TooltipOptions = {}
): string {
	const { maxDirectories = 3 } = options;

	const lines: string[] = [];

	// Size summary
	lines.push(`Project size: ${formatBytes(scanResult.totalBytes)}`);
	lines.push('');

	// Top directories
	if (scanResult.topDirectories?.length) {
		lines.push('Top folders:');
		const topN = scanResult.topDirectories.slice(0, maxDirectories);
		for (const dir of topN) {
			lines.push(`- ${dir.path} → ${formatBytes(dir.bytes)}`);
		}
		lines.push('');
	}

	// Scan metadata
	lines.push(
		`Last scan: ${formatDuration(scanResult.metadata.duration)}`
	);

	// Warnings
	if (scanResult.incomplete) {
		lines.push(`\n⚠ Scan incomplete (${scanResult.incompleteReason})`);
	}

	if (scanResult.skippedCount > 0) {
		lines.push(`⚠ ${scanResult.skippedCount} directories skipped (permission denied)`);
	}

	return lines.join('\n');
}

/**
 * Gets tooltip options from configuration
 */
export function getTooltipOptionsFromConfig(): TooltipOptions {
	return {};
}
