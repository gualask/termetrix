import type * as vscode from 'vscode';
import { scanProjectSize } from '../../../../core/sizeScan/engine/scanEngine';
import type { ProgressData } from '../../../../shared/contracts/progress';
import { NodeFsPort } from '../../../platform/nodeFsPort';
import { configManager } from '../../../support/configManager';
import { logger } from '../../../support/logger';
import type { ExtendedScanResult } from '../../../types';

const fs = new NodeFsPort();

/** Executes the pure size engine with extension-host configuration and diagnostics. */
export async function executeSizeScan(params: {
	rootPath: string;
	cancellationToken: vscode.CancellationToken;
	onProgress?: (progress: ProgressData) => void;
}): Promise<ExtendedScanResult> {
	const { rootPath, cancellationToken, onProgress } = params;
	const engineConfig = configManager.getCoreScanConfig();
	const memBefore = process.memoryUsage();

	const result = await scanProjectSize({
		rootPath,
		config: engineConfig,
		fs,
		cancellationToken,
		logger,
		onProgress,
	});

	const memAfter = process.memoryUsage();
	const heapDeltaMB = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
	const externalDeltaMB = (memAfter.external - memBefore.external) / 1024 / 1024;
	logger.info(
		`Scan memory: heap ${heapDeltaMB >= 0 ? '+' : ''}${heapDeltaMB.toFixed(1)} MB, ` +
			`external ${externalDeltaMB >= 0 ? '+' : ''}${externalDeltaMB.toFixed(1)} MB`,
	);

	return result;
}
