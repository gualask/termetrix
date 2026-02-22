import type { MessageToExtension, MetricsTab } from '../../../../types';
import type { MetricsPanelCommandDeps, MetricsPanelCommandHandler } from '../types';
import { getMessageTab } from './common';
import { getSyncedPanelRootOrSendNoRoot } from '../metricsPanelCommandUtils';
import { createUpdateMessage } from '../../messages';
import { startLocScanForPanel } from './loc';
import { startSizeScanForPanel } from './size';

function onReady(deps: MetricsPanelCommandDeps): void {
	// Bootstrap: treat each panel open as a new session ("start from zero").
	// Do not hydrate from cache; the first tab activation will trigger a new scan.
	if (!getSyncedPanelRootOrSendNoRoot(deps)) return;

	deps.sendMessage(createUpdateMessage({ scanResult: undefined, isScanning: false }));
}

function onTabActivated(deps: MetricsPanelCommandDeps, tab: MetricsTab | undefined): void {
	if (!deps.isPanelOpen()) return;
	if (!tab) return;
	if (!getSyncedPanelRootOrSendNoRoot(deps)) return;

	if (tab === 'size') {
		void startSizeScanForPanel(deps);
		return;
	}

	void startLocScanForPanel(deps);
}

export function createBootstrapHandlers(deps: MetricsPanelCommandDeps): Pick<
	Record<MessageToExtension['command'], MetricsPanelCommandHandler>,
	'ready' | 'tabActivated'
> {
	return {
		ready: () => onReady(deps),
		tabActivated: (message) => onTabActivated(deps, getMessageTab(message)),
	};
}
