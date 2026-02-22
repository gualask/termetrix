import type * as vscode from 'vscode';
import type { ExtendedScanResult } from '../../../types';
import { logger } from '../../../support/logger';
import type { SizeScanMode } from '../../../../core/sizeScan/engine/scanEngineTypes';
import { ScanEventEmitter } from '../controller/scanEventEmitter';
import { ScanRunner } from '../controller/scanRunner';
import type { ScanCache } from '../state/scanCache';
export interface ScanLifecycleServiceOptions {
	cache: ScanCache;
	scanEvents: ScanEventEmitter;
	executeScan: (params: {
		rootPath: string;
		cancellationToken: vscode.CancellationToken;
		mode: SizeScanMode;
		emitProgressEvents: boolean;
	}) => Promise<ExtendedScanResult>;
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
				onResult: (result) => {
					// Cache the result before emitting "scanEnd" so downstream consumers can render fresh data.
					// Do not cache cancelled scans (keep the last completed values).
					if (result.incompleteReason === 'cancelled') return;
					this.options.cache.set(rootPath, result);
				},
			});
		} catch (error) {
			logger.error(`Scan error: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}
}
