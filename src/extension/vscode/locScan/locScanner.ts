import * as vscode from 'vscode';
import type { LOCResult } from '../../types';
import { NodeFsPort } from '../../platform/nodeFsPort';
import { scanLOC } from '../../../core/locScan/engine/locEngine';
import type { LocScanRequest } from '../../../core/locScan/locScanRequest';
import { LocPathFilter } from '../../../core/locScan/filtering/locPathFilter';

/**
 * Scanner for counting lines of code in source files.
 */
export class LOCScanner {
	private readonly pathFilter = new LocPathFilter();
	private readonly fs = new NodeFsPort();
	private currentCancellationSource: vscode.CancellationTokenSource | undefined;

	/**
	 * Cancels the current LOC scan, if any (best-effort).
	 * @returns void
	 */
	cancelCurrentScan(): void {
		this.currentCancellationSource?.cancel();
	}

	/**
	 * Scans a directory tree and counts lines of code in supported source files.
	 * Cancels any in-progress scan before starting a new one.
	 * @param rootPath - Root directory to scan.
	 * @returns LOC scan result, or undefined when cancelled.
	 */
	async scan(rootPath: string): Promise<LOCResult | undefined> {
		// Cancel any previous scan and create a fresh cancellation source.
		// Note: dispose() is intentionally omitted here — the finally block of the previous
		// scan call always disposes its own source. Calling dispose() here would double-dispose
		// when a new scan starts before the previous one completes.
		this.currentCancellationSource?.cancel();
		const cancellationSource = new vscode.CancellationTokenSource();
		this.currentCancellationSource = cancellationSource;

		const request: LocScanRequest = {
			rootPath,
			fs: this.fs,
			cancellationToken: cancellationSource.token,
			pathFilter: this.pathFilter,
		};

		try {
			const result = await scanLOC(request);
			return cancellationSource.token.isCancellationRequested ? undefined : result;
		} finally {
			if (this.currentCancellationSource === cancellationSource) {
				this.currentCancellationSource = undefined;
			}
			cancellationSource.dispose();
		}
	}
}
