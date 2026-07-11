/**
 * Protocol types for Termetrix extension ↔ webview communication.
 *
 * This file is the single source of truth for:
 * - message envelopes (extension ↔ webview)
 * - transport-level DTOs (re-exported from shared contracts)
 * - small shared sentinels used by both sides (e.g. breakdown root segment)
 */

import type { LOCResult } from '../shared/contracts/loc';
import type { ProgressData } from '../shared/contracts/progress';
import type { ScanResult } from '../shared/contracts/scan';
import type { SizeBreakdownResult } from '../shared/contracts/sizeBreakdown';

export type { LOCResult } from '../shared/contracts/loc';
export type { ProgressData } from '../shared/contracts/progress';
export type { ScanIncompleteReason, ScanMetadata, ScanResult } from '../shared/contracts/scan';
export type {
	SizeBreakdownLeafDirectory,
	SizeBreakdownOthers,
	SizeBreakdownParent,
	SizeBreakdownResult,
} from '../shared/contracts/sizeBreakdown';
export { SIZE_BREAKDOWN_ROOT_SEGMENT } from '../shared/contracts/sizeBreakdown';

export interface ViewData {
	isScanning: boolean;
	scanResult?: ScanResult;
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
	| { type: 'locScanStart' }
	| { type: 'locResult'; data: LOCResult }
	| { type: 'locScanCancelled' }
	| { type: 'deepScanResult'; data: SizeBreakdownResult }
	| { type: 'error'; data: ErrorData };

export type MessageToExtension =
	| { command: 'ready' }
	/**
	 * `path` can be absolute or root-relative; it is validated to stay within the current project root.
	 * Do not send display-only paths (e.g. breakdown `leaf.path`).
	 */
	| { command: 'revealInExplorer'; path: string }
	/**
	 * `path` can be absolute or root-relative; it is validated to stay within the current project root.
	 * Do not send display-only paths (e.g. breakdown `leaf.path`).
	 */
	| { command: 'openFile'; path: string }
	| { command: 'refresh' }
	| { command: 'cancelScan'; target: 'size' | 'loc' }
	| { command: 'calculateLOC' }
	| { command: 'reset' };
