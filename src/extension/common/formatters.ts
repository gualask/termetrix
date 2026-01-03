/**
 * Formatting utilities for Termetrix (extension-side)
 * Keep formatting consistent between extension and webview by sharing the same implementation.
 */

/**
 * Formats a byte count into a human-friendly string.
 * Re-exported from the shared implementation used by the webview.
 */
export { formatBytes } from '../../shared/formatters.js';
