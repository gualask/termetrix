/**
 * Shared types for Termetrix extension
 *
 * These types are used by both the extension and the webview UI.
 * This file is the single source of truth for shared type definitions.
 */

// ============================================================================
// Directory & Scan Types
// ============================================================================

export interface DirectoryInfo {
	/** Relative path from root */
	path: string;
	/** Absolute path */
	absolutePath: string;
	/** Size in bytes */
	bytes: number;
}

export interface ScanMetadata {
	/** Timestamp when scan started */
	startTime: number;
	/** Timestamp when scan completed */
	endTime: number;
	/** Duration in milliseconds */
	duration: number;
	/** Number of directories scanned */
	directoriesScanned: number;
}

export interface ScanResult {
	/** Root path that was scanned */
	rootPath: string;
	/** Total size in bytes */
	totalBytes: number;
	/** Top N directories */
	topDirectories: DirectoryInfo[];
	/** Scan metadata */
	metadata: ScanMetadata;
	/** Whether scan was incomplete */
	incomplete: boolean;
	/** Reason for incompleteness */
	incompleteReason?: 'cancelled' | 'time_limit' | 'dir_limit';
	/** Number of directories skipped due to permission errors */
	skippedCount: number;
}

// ============================================================================
// LOC Types
// ============================================================================

export interface LOCResult {
	/** Total lines of code (non-empty lines) */
	totalLines: number;
	/** Lines of code by language */
	byLanguage: Record<string, number>;
	/** Top files by line count */
	topFiles: Array<{ path: string; lines: number; language: string }>;
	/** Number of files scanned */
	scannedFiles: number;
	/** Number of files skipped */
	skippedFiles: number;
}

// ============================================================================
// Webview Communication Types
// ============================================================================

export interface ViewData {
	isScanning: boolean;
	scanResult?: ScanResult;
}

export interface ProgressData {
	currentBytes: number;
	directoriesScanned: number;
}

export interface ErrorData {
	/** Error message to display */
	message: string;
	/** Optional error code for categorization */
	code?: string;
	/** Whether the error is recoverable */
	recoverable?: boolean;
}

export type MessageFromExtension =
	| { type: 'scanStart' }
	| { type: 'progress'; data: ProgressData }
	| { type: 'update'; data: ViewData }
	| { type: 'noRoot' }
	| { type: 'locCalculating' }
	| { type: 'locResult'; data: LOCResult }
	| { type: 'deepScanResult'; data: DirectoryInfo[] }
	| { type: 'error'; data: ErrorData };

export type MessageToExtension =
	| { command: 'ready' }
	| { command: 'revealInExplorer'; path: string }
	| { command: 'openFile'; path: string }
	| { command: 'refresh' }
	| { command: 'cancelScan' }
	| { command: 'calculateLOC' }
	| { command: 'deepScan' }
	| { command: 'reset' };
