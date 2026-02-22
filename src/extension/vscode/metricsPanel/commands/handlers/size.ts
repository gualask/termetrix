import type { ExtendedScanResult, MessageToExtension, ScanResult } from '../../../../types';
import { computeSizeBreakdown } from '../../../../../core/sizeScan/model/sizeBreakdown';
import type { DirectoryMetricsSnapshot } from '../../../../../core/sizeScan/types';
import { toPublicScanResult } from '../../../sizeScan/state/scanResultSanitizer';
import type { MetricsPanelCommandDeps, MetricsPanelCommandHandler } from '../types';
import { getPanelRootPath as getRootPath, runPanelCommand } from '../metricsPanelCommandUtils';
import { PANEL_COMMAND_ERRORS } from '../errors';
import {
	createDeepScanResultMessage,
	createEmptyDeepScanResultMessage,
	createUpdateMessage,
} from '../../messages';

type SizeScanOutcome =
	| { kind: 'cancelled'; previous: ScanResult | undefined }
	| { kind: 'error'; previous: ScanResult | undefined }
	| { kind: 'success'; scanResult: ScanResult; breakdownSource: DirectoryMetricsSnapshot };

function getSizeScanOutcome(deps: MetricsPanelCommandDeps, result: ExtendedScanResult | undefined): SizeScanOutcome {
	const previous = deps.sessionState.getSizeScanResult();
	if (!result) return { kind: 'error', previous };
	if (result.incompleteReason === 'cancelled') return { kind: 'cancelled', previous };

	const breakdownSource = result.directoryMetrics ?? null;
	if (!breakdownSource) return { kind: 'error', previous };

	const scanResult = toPublicScanResult(result);
	return { kind: 'success', scanResult, breakdownSource };
}

export async function startSizeScanForPanel(deps: MetricsPanelCommandDeps, options?: { force?: boolean }): Promise<void> {
	await runPanelCommand({
		deps,
		tab: 'size',
		force: options?.force,
		error: PANEL_COMMAND_ERRORS.sizeScan,
		run: (rootPath) => deps.scanner.scan(rootPath),
		onSuccess: (result, _rootPath) => {
			const outcome = getSizeScanOutcome(deps, result);

			if (outcome.kind === 'cancelled') {
				deps.sessionState.restoreTabAfterCancel('size', Boolean(outcome.previous));
				deps.sendMessage(createUpdateMessage({ scanResult: outcome.previous, isScanning: false }));
				return;
			}

			if (outcome.kind === 'error') {
				throw new Error('size scan outcome is invalid');
			}

			deps.sessionState.setSizeScanResult(outcome.scanResult);
			deps.sessionState.setSizeBreakdownSource(outcome.breakdownSource);
			deps.sessionState.completeTabRunSuccess('size');
			deps.sendMessage(createUpdateMessage({ scanResult: outcome.scanResult, isScanning: false }));
		},
		onError: (_rootPath, _error) => {
			deps.sessionState.completeTabRunError('size');
			deps.sendMessage(createUpdateMessage({ scanResult: deps.sessionState.getSizeScanResult(), isScanning: false }));
		},
	});
}

function onRefresh(deps: MetricsPanelCommandDeps): void {
	void startSizeScanForPanel(deps, { force: true });
}

function onDeepScan(deps: MetricsPanelCommandDeps): void {
	const rootPath = getRootPath(deps);
	if (!rootPath) {
		deps.sendMessage(createEmptyDeepScanResultMessage());
		return;
	}

	const internals = deps.sessionState.getSizeBreakdownSource();
	if (!internals) {
		deps.sendMessage(createEmptyDeepScanResultMessage(rootPath));
		return;
	}

	const breakdown = computeSizeBreakdown({ rootPath, directoryMetrics: internals });
	deps.sendMessage(createDeepScanResultMessage(breakdown));
}

export function createSizeHandlers(deps: MetricsPanelCommandDeps): Pick<
	Record<MessageToExtension['command'], MetricsPanelCommandHandler>,
	'refresh' | 'cancelScan' | 'deepScan'
> {
	return {
		refresh: () => onRefresh(deps),
		cancelScan: () => deps.scanner.cancelCurrentScan(),
		deepScan: () => onDeepScan(deps),
	};
}
