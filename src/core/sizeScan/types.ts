import type { ScanResult } from '../../shared/contracts/scan';

export type DirectoryMetrics = {
	/** Direct size in bytes (non-recursive; files directly under this directory) */
	bytes: number;
	/** Direct file count in this directory (non-recursive) */
	fileCount: number;
	/** Max direct file size in bytes (non-recursive) */
	maxFileBytes: number;
	/** Basename of the largest direct file, if any */
	maxFileName?: string;
};

export type DirectoryMetricsSnapshot = Record<string, DirectoryMetrics>;

/**
 * Scan result with internal, memory-heavy fields used only inside the extension host.
 * Not sent to the webview.
 */
export type ExtendedScanResult = ScanResult & {
	directoryMetrics?: DirectoryMetricsSnapshot;
};
