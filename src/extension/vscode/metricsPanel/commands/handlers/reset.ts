import type { MessageToExtension } from '../../../../types';
import type { MetricsPanelCommandDeps, MetricsPanelCommandHandler } from '../types';
import { createNoRootMessage } from '../../messages';

function onReset(deps: MetricsPanelCommandDeps): void {
	// Reset is a soft clear for the panel state; scanning resumes automatically as the user keeps working.
	deps.scanner.cancelCurrentScan();
	deps.sessionState.clearInternals();
	deps.sendMessage(createNoRootMessage());
}

export function createResetHandlers(deps: MetricsPanelCommandDeps): Pick<
	Record<MessageToExtension['command'], MetricsPanelCommandHandler>,
	'reset'
> {
	return {
		reset: () => onReset(deps),
	};
}
