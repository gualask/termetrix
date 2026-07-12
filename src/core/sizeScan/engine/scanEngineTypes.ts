import type { ProgressData } from '../../../shared/contracts/progress';
import type { FsPort } from '../../ports/fsPort';
import type { LoggerPort } from '../../ports/loggerPort';
import type { DurationMs, PositiveInt } from '../../shared/numericValueObjects';
import type { CancellationToken } from '../../shared/runtime/cancellationToken';
import type { ScanCompletion } from '../model/scanCompletion';

/**
 * Mutable scan counters used on the hot path.
 * Kept as primitives for performance; invariants are enforced by the mutating code.
 */
export interface ScanRuntimeState {
	totalBytes: number;
	directoriesScanned: number;
	skippedCount: number;
	completion: ScanCompletion;
	stopScheduling: boolean;
}

export interface SizeScanConfig {
	maxDurationSeconds: number;
	maxDirectories: number;
	fsConcurrency: number;
}

/**
 * Normalized scan limits used by stop conditions.
 * Value objects keep units and validation explicit (ms, positive counts).
 */
export interface SizeScanBudget {
	startTimeMs: number;
	maxDurationMs: DurationMs;
	maxDirectories: PositiveInt;
	cancellationToken: CancellationToken;
}

export interface SizeScanParams {
	rootPath: string;
	config: SizeScanConfig;
	fs: FsPort;
	cancellationToken: CancellationToken;
	onProgress?: (progress: ProgressData) => void;
	logger?: LoggerPort;
}
