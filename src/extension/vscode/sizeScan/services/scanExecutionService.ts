import type * as vscode from 'vscode';
import type { ExtendedScanResult } from '../../../types';
import { configManager } from '../../../support/configManager';
import { logger } from '../../../support/logger';
import { scanProjectSize } from '../../../../core/sizeScan/engine/scanEngine';
import type { SizeScanMode } from '../../../../core/sizeScan/engine/scanEngineTypes';
import type { ProgressData } from '../../../../shared/contracts/progress';
import { NodeFsPort } from '../../../platform/nodeFsPort';

type ScanExecutionProgressHandler = (progress: ProgressData) => void;

/**
 * Bridges extension-level policy/config with the pure size scan engine.
 * Single responsibility: execute scans with the right engine parameters.
 */
export class ScanExecutionService {
	private readonly fs = new NodeFsPort();

	constructor(private readonly onProgress?: ScanExecutionProgressHandler) {}

	async execute(params: {
		rootPath: string;
		cancellationToken: vscode.CancellationToken;
		mode: SizeScanMode;
		emitProgressEvents: boolean;
	}): Promise<ExtendedScanResult> {
		const { rootPath, cancellationToken, mode, emitProgressEvents } = params;
		const engineConfig = configManager.getCoreScanConfig();

		const memBefore = process.memoryUsage();

		const result = await scanProjectSize({
			rootPath,
			config: engineConfig,
			fs: this.fs,
			cancellationToken,
			logger,
			mode,
			onProgress: emitProgressEvents ? (progress) => this.onProgress?.(progress) : undefined,
		});

		const memAfter = process.memoryUsage();
		const heapDeltaMB = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
		const externalDeltaMB = (memAfter.external - memBefore.external) / 1024 / 1024;
		logger.info(
			`Scan memory: heap ${heapDeltaMB >= 0 ? '+' : ''}${heapDeltaMB.toFixed(1)} MB, ` +
				`external ${externalDeltaMB >= 0 ? '+' : ''}${externalDeltaMB.toFixed(1)} MB`
		);

		return result;
	}
}
