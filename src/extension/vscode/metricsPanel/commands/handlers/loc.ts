import type { MessageToExtension } from '../../../../types';
import type { MetricsPanelCommandDeps, MetricsPanelCommandHandler } from '../types';
import { PANEL_COMMAND_ERRORS } from '../errors';
import { runPanelScanCommand } from '../metricsPanelCommandUtils';
import { createLocScanStartMessage, createLocResultMessage, createLocScanCancelledMessage } from '../../messages';

/**
 * Starts a LOC scan for the metrics panel, honouring session lifecycle gating.
 * @param deps - Panel command dependencies.
 * @param options.force - When `true`, restarts even after a prior successful scan.
 */
export async function startLocScanForPanel(deps: MetricsPanelCommandDeps, options?: { force?: boolean }): Promise<void> {
	await runPanelScanCommand({
		deps,
		scanKind: 'loc',
		force: options?.force,
		error: PANEL_COMMAND_ERRORS.locScan,
		onBeforeRun: () => deps.sendMessage(createLocScanStartMessage()),
		run: (rootPath) => deps.locScanner.scan(rootPath),
		onSuccess: (result) => {
			if (!result) {
				// Scan was cancelled. Notify the UI then restore to 'never' so the next recalculation can start.
				deps.sendMessage(createLocScanCancelledMessage());
				deps.sessionState.restoreAfterCancel('loc', false);
				return;
			}
			deps.sendMessage(createLocResultMessage(result));
			deps.sessionState.completeRunSuccess('loc');
		},
		onError: (_rootPath, _error) => {
			deps.sessionState.completeRunError('loc');
		},
	});
}

/**
 * Creates the handler map for the LOC command (`calculateLOC`).
 * @param deps - Panel command dependencies.
 */
export function createLocHandlers(deps: MetricsPanelCommandDeps): Pick<
	Record<MessageToExtension['command'], MetricsPanelCommandHandler>,
	'calculateLOC'
> {
	return {
		calculateLOC: () => startLocScanForPanel(deps, { force: true }),
	};
}
