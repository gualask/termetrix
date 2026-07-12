import type * as vscode from 'vscode';
import { logger } from '../../../support/logger';
import type { ExtendedScanResult } from '../../../types';
import type { ScanEventEmitter } from '../controller/scanEventEmitter';
import { ScanRunner } from '../controller/scanRunner';
import type { ScanCache } from '../state/scanCache';

export interface ScanLifecycleServiceOptions {
	cache: ScanCache;
	scanEvents: ScanEventEmitter;
	executeScan: (params: {
		rootPath: string;
		cancellationToken: vscode.CancellationToken;
	}) => Promise<ExtendedScanResult>;
}

/**
 * Coordinates scan run lifecycle: cancellation, events, caching, and error handling.
 * Single responsibility: stable orchestration around scan execution.
 */
export class ScanLifecycleService {
	private readonly runner = new ScanRunner<ExtendedScanResult>();

	constructor(private readonly options: ScanLifecycleServiceOptions) {}

	/** Returns `true` when a scan is currently running. */
	isScanInProgress(): boolean {
		return this.runner.isScanInProgress();
	}

	/** Cancels the active scan (best-effort). */
	cancelCurrentScan(): void {
		this.runner.cancel();
	}

	private handleResult(rootPath: string, result: ExtendedScanResult): void {
		// Do not cache cancelled scans (keep the last completed values).
		if (result.incompleteReason === 'cancelled') return;
		// Cache results before emitting "scanEnd" so downstream consumers see fresh data on that event.
		this.options.cache.set(rootPath, result);
	}

	/**
	 * Runs a scan for the given root path, emitting lifecycle events and caching the result.
	 * @param rootPath - Directory to scan.
	 * @returns The scan result, or `undefined` on cancellation or error.
	 */
	async runScan(rootPath: string): Promise<ExtendedScanResult | undefined> {
		try {
			return await this.runner.run({
				onScanState: (isRunning) => this.options.scanEvents.onScanState(rootPath, isRunning),
				task: (cancellationToken) => this.options.executeScan({ rootPath, cancellationToken }),
				onResult: (result) => this.handleResult(rootPath, result),
			});
		} catch (error) {
			logger.error(`Scan error: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}
}
