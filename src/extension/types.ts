/**
 * Extension-specific types for Termetrix
 *
 * Re-exports shared types and defines extension-only types.
 */

// Re-export all shared types
export type {
	DirectoryInfo,
	ScanMetadata,
	LOCResult,
	ViewData,
	ProgressData,
	MessageFromExtension,
	MessageToExtension,
} from '../shared/types.js';

// Import ScanResult for local use (also re-export)
import type { ScanResult as BaseScanResult } from '../shared/types.js';
export type { ScanResult } from '../shared/types.js';

// ============================================================================
// Extension-only Types
// ============================================================================

export interface ScanProgress {
	/** Root path being scanned */
	rootPath: string;
	/** Current total bytes scanned */
	currentBytes: number;
	/** Number of directories scanned so far */
	directoriesScanned: number;
	/** Whether scan is in progress */
	isScanning: boolean;
}

/**
 * Extended ScanResult with internal fields (not sent to webview)
 */
export type ExtendedScanResult = BaseScanResult & {
	/** Internal: directory sizes by absolute path (not persisted, not sent to webview) */
	directorySizes?: Record<string, number>;
};
