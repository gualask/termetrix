import type { MessageToExtension } from '../../../types';
import { createBootstrapHandlers } from './handlers/bootstrap';
import { createLocHandlers } from './handlers/loc';
import { createNavigationHandlers } from './handlers/navigation';
import { createResetHandlers } from './handlers/reset';
import { createSizeHandlers } from './handlers/size';
import type { MetricsPanelCommandDeps, MetricsPanelCommandHandler } from './types';

export type { MetricsPanelCommandDeps, MetricsPanelCommandHandler } from './types';

/**
 * Creates command handlers used by the webview message dispatcher.
 * @param deps - Dependencies required to handle commands.
 * @returns Mapping from command strings to async handlers.
 */
export function createMetricsPanelCommandHandlers(
	deps: MetricsPanelCommandDeps,
): Record<MessageToExtension['command'], MetricsPanelCommandHandler> {
	const handlers = {
		...createBootstrapHandlers(deps),
		...createNavigationHandlers(deps),
		...createSizeHandlers(deps),
		...createLocHandlers(deps),
		...createResetHandlers(deps),
	} satisfies Record<MessageToExtension['command'], MetricsPanelCommandHandler>;

	return handlers;
}
