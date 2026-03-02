/**
 * Extension-specific types for Termetrix
 *
 * Prefer importing protocol/transport types from this file in extension-host code.
 */

// Note: under `moduleResolution: NodeNext`, type-only re-exports must use `.js` specifiers
// so the emitted JS has valid runtime paths even though the source files are `.ts`.
export type * from '../protocol/types.js';
export type { ExtendedScanResult } from '../core/sizeScan/types.js';

// ============================================================================
// Extension-only Types
// ============================================================================

export type ScanKind = 'size' | 'loc';
