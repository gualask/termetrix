import type { MessageToExtension } from '../../../types';
import type { MetricsPanelCommandHandler } from './metricsPanelCommands';

/**
 * Validates and dispatches a webview message to the corresponding command handler.
 * @param message - Raw message received from the webview (untrusted).
 * @param handlers - Map of handlers by command.
 * @returns Promise resolving once the handler completes.
 */
export async function dispatchMetricsPanelWebviewMessage(
	message: unknown,
	handlers: Record<MessageToExtension['command'], MetricsPanelCommandHandler>
): Promise<void> {
	// Defensive parsing: webview messages are untyped and should not be trusted.
	if (!message || typeof message !== 'object') return;
	const maybeMessage = message as { command?: unknown };
	if (typeof maybeMessage.command !== 'string') return;
	if (!Object.prototype.hasOwnProperty.call(handlers, maybeMessage.command)) return;

	const handler = handlers[maybeMessage.command as MessageToExtension['command']];
	await Promise.resolve(handler(message as MessageToExtension));
}
