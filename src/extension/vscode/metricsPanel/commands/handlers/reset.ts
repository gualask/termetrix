import type { MessageToExtension } from '../../../../types';
import type { MetricsPanelCommandDeps, MetricsPanelCommandHandler } from '../types';
import { createNoRootMessage } from '../../messages';

function onReset(deps: MetricsPanelCommandDeps): void {
	// Reset is a soft clear for the panel state; scanning resumes automatically as the user keeps working.
	// LOC scanner is panel-lifetime so it must be cancelled; size scanner is global and must not be
	// interrupted (results benefit the status bar and will be reported via onScanEnd / onReady).
	deps.locScanner.cancelCurrentScan();
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
