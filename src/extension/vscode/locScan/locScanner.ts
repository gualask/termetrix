import * as vscode from 'vscode';
import type { LOCResult } from '../../types';
import { NodeFsPort } from '../../platform/nodeFsPort';
import { scanLOC } from '../../../core/locScan/engine/locEngine';
import type { LocScanRequest } from '../../../core/locScan/locScanRequest';
import { LocPathFilter } from '../../../core/locScan/filtering/locPathFilter';
import { configManager } from '../../support/configManager';
import { LOC_CONCURRENCY_DIVISOR } from '../../support/constants';

/**
 * Scanner for counting lines of code in source files.
 */
export class LOCScanner {
	private readonly pathFilter = new LocPathFilter();
	private readonly fs = new NodeFsPort();

	/**
	 * Scans a directory tree and counts lines of code in supported source files.
	 * @param rootPath - Root directory to scan.
	 * @param cancellationToken - Optional cancellation token.
	 * @returns LOC scan result.
	 */
	async scan(rootPath: string, cancellationToken?: vscode.CancellationToken): Promise<LOCResult | undefined> {
		const { fsConcurrency } = configManager.getCoreScanConfig();
		// LOC reads file contents; keep it less aggressive than size traversal to reduce IO pressure.
		const maxConcurrency = Math.max(1, Math.floor(fsConcurrency / LOC_CONCURRENCY_DIVISOR));
		const request: LocScanRequest = {
			rootPath,
			fs: this.fs,
			cancellationToken,
			pathFilter: this.pathFilter,
			maxConcurrency,
		};
		const result = await scanLOC(request);
		return cancellationToken?.isCancellationRequested ? undefined : result;
	}
}
