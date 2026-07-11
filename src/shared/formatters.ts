/**
 * Shared formatting utilities for Termetrix.
 *
 * These formatters are used by both the extension and the webview UI.
 */

/**
 * Format bytes to human-readable string.
 * @param bytes Number of bytes.
 * @returns Formatted string (e.g., "18.2 GB").
 *
 * NOTE: Uses a readability-oriented unit switch threshold (1000) and promotes values like
 * "1000.0 MB" to "1.0 GB" to avoid awkward 4-digit outputs in intermediate units.
 */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes === 0) {
		return '0 B';
	}

	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const k = 1024;
	const unitSwitchThreshold = 1000;

	let unitIndex = 0;
	let value = Math.abs(bytes);

	while (unitIndex < units.length - 1) {
		const threshold = unitIndex === 0 ? k : unitSwitchThreshold;
		if (value < threshold) break;
		value /= k;
		unitIndex++;
	}

	const sign = bytes < 0 ? '-' : '';
	const decimals = unitIndex === 0 ? 0 : 1;
	let rounded = Number(value.toFixed(decimals));

	// Avoid edge-case "1000.0 MB" (or similar) caused by rounding near the unit boundary.
	if (unitIndex > 0 && rounded >= unitSwitchThreshold && unitIndex < units.length - 1) {
		unitIndex++;
		value /= k;
		rounded = Number(value.toFixed(1));
	}

	return `${sign}${rounded.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Maps a scan incomplete reason code to a user-friendly message.
 * @param reason - The incomplete reason code, or undefined.
 * @returns A human-readable description of why the scan was incomplete.
 */
export function formatIncompleteReason(reason: string | undefined): string {
	switch (reason) {
		case 'time_limit':
			return 'scan timed out — increase maxDurationSeconds in settings for a full scan';
		case 'dir_limit':
			return 'directory limit reached — increase maxDirectories in settings for a full scan';
		default:
			return 'scan did not complete';
	}
}
