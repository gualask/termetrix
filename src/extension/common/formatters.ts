/**
 * Formatting utilities for Termetrix (extension-side)
 */

// Re-export shared formatters
export { formatBytes } from '../../shared/formatters.js';

/**
 * Format duration in milliseconds to human-readable string
 * @param ms Duration in milliseconds
 * @returns Formatted string (e.g., "1.4s")
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	return `${(ms / 1000).toFixed(1)}s`;
}
