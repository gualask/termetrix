import type { MessageToExtension } from '../../../../types';
import type { MetricsPanelCommandDeps, MetricsPanelCommandHandler } from '../types';
import { PANEL_COMMAND_ERRORS } from '../errors';
import { runPanelCommand } from '../metricsPanelCommandUtils';
import { createLocCalculatingMessage, createLocResultMessage } from '../../messages';

export async function startLocScanForPanel(deps: MetricsPanelCommandDeps, options?: { force?: boolean }): Promise<void> {
	await runPanelCommand({
		deps,
		tab: 'loc',
		force: options?.force,
		error: PANEL_COMMAND_ERRORS.locScan,
		onBeforeRun: () => deps.sendMessage(createLocCalculatingMessage()),
		run: async (rootPath) => {
			const result = await deps.locScanner.scan(rootPath);
			// Defensive: panel LOC scans don't pass a cancellationToken, so result is always defined.
			if (!result) throw new Error('LOC scan returned no result');
			return result;
		},
		onSuccess: (result) => {
			deps.sendMessage(createLocResultMessage(result));
			deps.sessionState.completeTabRunSuccess('loc');
		},
		onError: (_rootPath, _error) => {
			deps.sessionState.completeTabRunError('loc');
		},
	});
}

export function createLocHandlers(deps: MetricsPanelCommandDeps): Pick<
	Record<MessageToExtension['command'], MetricsPanelCommandHandler>,
	'calculateLOC'
> {
	return {
		calculateLOC: () => startLocScanForPanel(deps, { force: true }),
	};
}
