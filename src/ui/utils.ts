/**
 * Utility functions for webview UI
 *
 * Re-exports shared formatters from the single source of truth.
 */

import { formatBytes, formatIncompleteReason } from '../shared/formatters';
import { SIZE_BREAKDOWN_ROOT_SEGMENT } from '../protocol/types';

export { formatBytes, formatIncompleteReason };

/**
 * Validates and clamps a share value (0..1).
 * Returns whether the share should be shown and the clamped value.
 */
export function validateShare(share?: number): { showShare: boolean; clampedShare: number } {
	const showShare = typeof share === 'number' && Number.isFinite(share);
	const clampedShare = showShare ? Math.max(0, Math.min(1, share!)) : 0;
	return { showShare, clampedShare };
}

export function formatBreakdownParentPath(value: string): string {
	return value === SIZE_BREAKDOWN_ROOT_SEGMENT ? 'Project root' : value;
}
