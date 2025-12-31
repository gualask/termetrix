/**
 * Shared formatting utilities for Termetrix
 *
 * These formatters are used by both the extension and the webview UI.
 */

/**
 * Format bytes to human-readable string
 * @param bytes Number of bytes
 * @returns Formatted string (e.g., "18.2 GB")
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return '0 B';
	}

	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const k = 1024;
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	const value = bytes / Math.pow(k, i);

	return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
