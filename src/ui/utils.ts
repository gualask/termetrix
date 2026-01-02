/**
 * Utility functions for webview UI
 *
 * Re-exports shared formatters from the single source of truth.
 */

import { formatBytes as formatBytesShared } from '../shared/formatters';

export const formatBytes = formatBytesShared;

export type FileStatsLike = {
	bytes: number;
	fileCount: number;
	maxFileBytes: number;
};

export function formatFileStats(stats: FileStatsLike): string {
	const avg = stats.fileCount > 0 ? stats.bytes / stats.fileCount : 0;
	const maxText = stats.maxFileBytes > 0 ? formatBytes(stats.maxFileBytes) : '—';
	return `files: ${stats.fileCount.toLocaleString()} · avg: ${formatBytes(avg)} · max: ${maxText}`;
}
