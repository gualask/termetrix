import * as vscode from 'vscode';
import type { MessageFromExtension, MessageToExtension } from '../../types';
import { resolvePathIfWithinRoot } from '../../common/pathUtils';
import type { ProjectSizeScanner } from '../sizeScan/projectSizeScanner';
import type { ScanCache } from '../sizeScan/scanCache';
import { LOCScanner } from '../locScan/locScanner';
import type { SizeScanInternals } from '../sizeScan/sizeScanInternals';

function getPanelRootPath(deps: Pick<MetricsPanelCommandDeps, 'isPanelOpen' | 'scanner'>): string | undefined {
	if (!deps.isPanelOpen()) return undefined;
	return deps.scanner.getCurrentRoot();
}

function resolvePanelPath(
	deps: Pick<MetricsPanelCommandDeps, 'isPanelOpen' | 'scanner'>,
	targetPath: string | undefined
): string | undefined {
	const rootPath = getPanelRootPath(deps);
	if (!rootPath || !targetPath) return undefined;
	return resolvePathIfWithinRoot(rootPath, targetPath);
}

function sendPanelError(
	deps: Pick<MetricsPanelCommandDeps, 'sendMessage'>,
	message: string,
	code: string
): void {
	deps.sendMessage({
		type: 'error',
		data: {
			message,
			code,
			recoverable: true,
		},
	});
}

async function runCommand(
	deps: Pick<MetricsPanelCommandDeps, 'sendMessage'>,
	label: string,
	fn: () => Promise<void>
): Promise<void> {
	try {
		await fn();
	} catch (error) {
		console.error(`${label} failed:`, error);
		sendPanelError(deps, `${label} failed`, `panel.${label}`);
	}
}

export interface MetricsPanelCommandDeps {
	scanner: ProjectSizeScanner;
	cache: ScanCache;
	locScanner: LOCScanner;
	isPanelOpen: () => boolean;
	getPreferredEditorColumn: () => vscode.ViewColumn | undefined;
	getSizeScanInternals: () => SizeScanInternals | null;
	setSizeScanInternals: (value: SizeScanInternals | null, rootPath: string | null) => void;
	sendMessage: (message: MessageFromExtension) => void;
}

export function sendMetricsPanelState(deps: Pick<MetricsPanelCommandDeps, 'scanner' | 'cache' | 'sendMessage'>): void {
	const rootPath = deps.scanner.getCurrentRoot();
	if (!rootPath) {
		deps.sendMessage({ type: 'noRoot' });
		return;
	}

	const scanResult = deps.cache.get(rootPath);
	const isScanning = deps.scanner.isScanInProgress();

	deps.sendMessage({
		type: 'update',
		data: {
			scanResult,
			isScanning,
		},
	});
}

export async function triggerSizeScanAndStoreInternals(
	deps: Pick<MetricsPanelCommandDeps, 'scanner' | 'setSizeScanInternals'>
): Promise<void> {
	const result = await deps.scanner.scan();
	if (!result?.directorySizes) return;
	deps.setSizeScanInternals(
		{
			directorySizes: result.directorySizes,
			directoryFileCounts: result.directoryFileCounts,
			directoryMaxFileBytes: result.directoryMaxFileBytes,
			topFilesByDirectory: result.topFilesByDirectory,
		},
		result.rootPath
	);
}

export function createMetricsPanelCommandHandlers(
	deps: MetricsPanelCommandDeps
): Record<MessageToExtension['command'], (path?: string) => Promise<void>> {
	return {
		ready: async () => {
			sendMetricsPanelState(deps);
			void triggerSizeScanAndStoreInternals(deps);
		},

		revealInExplorer: async (targetPath) => {
			const resolved = resolvePanelPath(deps, targetPath);
			if (!resolved) return;

			await runCommand(deps, 'revealInExplorer', async () => {
				const uri = vscode.Uri.file(resolved);
				await vscode.commands.executeCommand('revealInExplorer', uri);
			});
		},

		openFile: async (filePath) => {
			const absolutePath = resolvePanelPath(deps, filePath);
			if (!absolutePath) return;

			await runCommand(deps, 'openFile', async () => {
				const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
				await vscode.window.showTextDocument(doc, {
					preview: true,
					viewColumn: deps.getPreferredEditorColumn() ?? vscode.ViewColumn.One,
				});
			});
		},

		refresh: async () => {
			if (!deps.isPanelOpen()) return;
			void triggerSizeScanAndStoreInternals(deps);
		},

		cancelScan: async () => {
			deps.scanner.cancelCurrentScan();
		},

		calculateLOC: async () => {
			const rootPath = getPanelRootPath(deps);
			if (!rootPath) return;

			deps.sendMessage({ type: 'locCalculating' });

			await runCommand(deps, 'calculateLOC', async () => {
				const result = await deps.locScanner.scan(rootPath);
				deps.sendMessage({ type: 'locResult', data: result });
			});
		},

			deepScan: async () => {
				const rootPath = getPanelRootPath(deps);
				const internals = deps.getSizeScanInternals();
				if (!rootPath || !internals) {
					// Ensure the UI overlay can be dismissed even when we can't compute deep metrics yet.
					deps.sendMessage({ type: 'deepScanResult', data: { rootPath: rootPath ?? '', parents: [] } });
					return;
				}

				const breakdown = deps.scanner.computeSizeBreakdown({ rootPath, ...internals });
				deps.sendMessage({ type: 'deepScanResult', data: breakdown });
			},

			reset: async () => {
				deps.scanner.cancelCurrentScan();
				deps.setSizeScanInternals(null, null);
				deps.sendMessage({ type: 'noRoot' });
			},
		};
	}

export async function dispatchMetricsPanelWebviewMessage(
	message: unknown,
	handlers: Record<MessageToExtension['command'], (path?: string) => Promise<void>>
): Promise<void> {
	if (!message || typeof message !== 'object') return;
	const maybeMessage = message as { command?: unknown; path?: unknown };
	if (typeof maybeMessage.command !== 'string') return;
	if (!Object.prototype.hasOwnProperty.call(handlers, maybeMessage.command)) return;

	const handler = handlers[maybeMessage.command as MessageToExtension['command']];
	await handler(typeof maybeMessage.path === 'string' ? maybeMessage.path : undefined);
}
