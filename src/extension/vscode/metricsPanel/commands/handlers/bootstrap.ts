import { configManager } from '../../../../support/configManager';
import type { MessageToExtension } from '../../../../types';
import { createBreakdownMessage, createUpdateMessage } from '../../messages';
import { getSyncedPanelRootOrSendNoRoot } from '../metricsPanelCommandUtils';
import type { MetricsPanelCommandDeps, MetricsPanelCommandHandler } from '../types';
import { startLocScanForPanel } from './loc';

function onReady(deps: MetricsPanelCommandDeps): void {
	const root = getSyncedPanelRootOrSendNoRoot(deps);
	if (!root) return;

	const cached = deps.scanner.getCachedResult(root);
	// Reflect any in-progress scan (e.g. startup scan still running when the panel opens).
	deps.sendMessage(createUpdateMessage({ scanResult: cached, isScanning: deps.scanner.isScanInProgress() }));

	// Send cached breakdown immediately if available (full scan ran before panel opened).
	const directoryMetrics = deps.scanner.getCachedDirectoryMetrics(root);
	if (directoryMetrics) deps.sendMessage(createBreakdownMessage(root, directoryMetrics));

	const panelConfig = configManager.getPanelConfig();
	// force: true ensures the LOC scan always runs for a fresh webview, even if a stale
	// scan from the previous panel session completed and set the state to 'success' before
	// this 'ready' message arrived (race on rapid panel close + reopen).
	if (panelConfig.autoScanLoc) void startLocScanForPanel(deps, { force: true });
}

/**
 * Creates the handler map for the panel bootstrap phase (the `ready` command).
 * @param deps - Panel command dependencies.
 */
export function createBootstrapHandlers(
	deps: MetricsPanelCommandDeps,
): Pick<Record<MessageToExtension['command'], MetricsPanelCommandHandler>, 'ready'> {
	return {
		ready: () => onReady(deps),
	};
}
