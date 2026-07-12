import type { MessageToExtension } from '../../../../types';
import { toPublicScanResult } from '../../../sizeScan/state/scanResultSanitizer';
import { createBreakdownMessage, createUpdateMessage } from '../../messages';
import { PANEL_COMMAND_ERRORS } from '../errors';
import { runPanelScanCommand } from '../metricsPanelCommandUtils';
import type { MetricsPanelCommandDeps, MetricsPanelCommandHandler } from '../types';

/**
 * Starts a size scan for the metrics panel, honouring session lifecycle gating.
 * @param deps - Panel command dependencies.
 * @param options.force - When `true`, restarts even after a prior successful scan.
 */
export async function startSizeScanForPanel(
	deps: MetricsPanelCommandDeps,
	options?: { force?: boolean },
): Promise<void> {
	await runPanelScanCommand({
		deps,
		scanKind: 'size',
		force: options?.force,
		error: PANEL_COMMAND_ERRORS.sizeScan,
		run: (rootPath) => deps.scanner.scan(rootPath),
		onSuccess: (result, rootPath) => {
			// Guard: if the workspace root changed while the scan was running (and the cancellation
			// token was not observed in time), the result belongs to a stale root and must be
			// discarded to avoid writing the wrong root's data into the new root's session state.
			if (deps.scanner.getCurrentRoot() !== rootPath) return;

			if (!result || result.incompleteReason === 'cancelled') {
				// Use the scanner cache as source of truth: it reflects any completed scan result
				// regardless of whether it was panel-initiated or external (auto-refresh, startup).
				const previous = deps.scanner.getCachedResult(rootPath);
				deps.sessionState.restoreAfterCancel('size', Boolean(previous));
				deps.sendMessage(createUpdateMessage({ scanResult: previous, isScanning: false }));
				return;
			}

			deps.sessionState.completeRunSuccess('size');
			deps.sendMessage(createUpdateMessage({ scanResult: toPublicScanResult(result), isScanning: false }));
			deps.sendMessage(createBreakdownMessage(rootPath, result.directoryMetrics));
		},
		onError: (rootPath, _error) => {
			// Same root-change guard as onSuccess: skip state updates if the root changed.
			if (deps.scanner.getCurrentRoot() !== rootPath) return;
			deps.sessionState.completeRunError('size');
			deps.sendMessage(createUpdateMessage({ scanResult: deps.scanner.getCachedResult(rootPath), isScanning: false }));
		},
	});
}

/**
 * Creates the handler map for size-scan commands (`refresh` and `cancelScan`).
 * @param deps - Panel command dependencies.
 */
export function createSizeHandlers(
	deps: MetricsPanelCommandDeps,
): Pick<Record<MessageToExtension['command'], MetricsPanelCommandHandler>, 'refresh' | 'cancelScan'> {
	return {
		refresh: () => startSizeScanForPanel(deps, { force: true }),
		cancelScan: (message) => {
			const { target } = message as Extract<MessageToExtension, { command: 'cancelScan' }>;
			if (target === 'size') deps.scanner.cancelCurrentScan();
			else deps.locScanner.cancelCurrentScan();
		},
	};
}
