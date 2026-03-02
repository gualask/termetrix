import type * as vscode from 'vscode';
import type { ExtendedScanResult } from '../../../types';
import { logger } from '../../../support/logger';
import type { SizeScanMode } from '../../../../core/sizeScan/engine/scanEngineTypes';
import { ScanEventEmitter } from '../controller/scanEventEmitter';
import { ScanRunner } from '../controller/scanRunner';
import type { ScanCache } from '../state/scanCache';
import type { DirectoryMetricsSnapshot } from '../../../../core/sizeScan/types';
export interface ScanLifecycleServiceOptions {
	cache: ScanCache;
	scanEvents: ScanEventEmitter;
	executeScan: (params: {
		rootPath: string;
		cancellationToken: vscode.CancellationToken;
		mode: SizeScanMode;
		emitProgressEvents: boolean;
	}) => Promise<ExtendedScanResult>;
	/** Called with directory metrics before "scanEnd" fires, so consumers see fresh data on that event. */
	onDirectoryMetrics?: (rootPath: string, metrics: DirectoryMetricsSnapshot) => void;
}

/**
 * Coordinates scan run lifecycle: cancellation, events, caching, and error handling.
 * Single responsibility: stable orchestration around scan execution.
 */
export class ScanLifecycleService {
	private readonly runner = new ScanRunner<ExtendedScanResult>();

	constructor(private readonly options: ScanLifecycleServiceOptions) {}

	isScanInProgress(): boolean {
		return this.runner.isScanInProgress();
	}

	cancelCurrentScan(): void {
		this.runner.cancel();
	}

	private handleResult(rootPath: string, result: ExtendedScanResult): void {
		// Do not cache cancelled scans (keep the last completed values).
		if (result.incompleteReason === 'cancelled') return;
		// Cache results before emitting "scanEnd" so downstream consumers see fresh data on that event.
		this.options.cache.set(rootPath, result);
		if (result.directoryMetrics) {
			this.options.onDirectoryMetrics?.(rootPath, result.directoryMetrics);
		}
	}

	async runScan(params: {
		rootPath: string;
		mode: SizeScanMode;
		emitProgressEvents: boolean;
	}): Promise<ExtendedScanResult | undefined> {
		const { rootPath, mode, emitProgressEvents } = params;

		try {
			return await this.runner.run({
				onScanState: (isRunning) => this.options.scanEvents.onScanState(rootPath, isRunning),
				task: (cancellationToken) =>
					this.options.executeScan({
						rootPath,
						cancellationToken,
						mode,
						emitProgressEvents,
					}),
				onResult: (result) => this.handleResult(rootPath, result),
			});
		} catch (error) {
			logger.error(`Scan error: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}
}
