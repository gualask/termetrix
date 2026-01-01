import * as vscode from 'vscode';
import type { MessageFromExtension, MessageToExtension } from '../../types';
import { resolvePathIfWithinRoot } from '../../common/pathUtils';
import type { ProjectSizeScanner } from '../sizeScan/projectSizeScanner';
import type { ScanCache } from '../sizeScan/scanCache';
import { LOCScanner } from '../locScan/locScanner';

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

export interface MetricsPanelCommandDeps {
	scanner: ProjectSizeScanner;
	cache: ScanCache;
	locScanner: LOCScanner;
	isPanelOpen: () => boolean;
	getPreferredEditorColumn: () => vscode.ViewColumn | undefined;
	getDirectorySizes: () => Record<string, number> | null;
	setDirectorySizes: (value: Record<string, number> | null, rootPath: string | null) => void;
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

export async function triggerSizeScanAndStoreDirectorySizes(
	deps: Pick<MetricsPanelCommandDeps, 'scanner' | 'setDirectorySizes'>
): Promise<void> {
	const result = await deps.scanner.scan();
	if (!result?.directorySizes) return;
	deps.setDirectorySizes(result.directorySizes, result.rootPath);
}

export function createMetricsPanelCommandHandlers(
	deps: MetricsPanelCommandDeps
): Record<MessageToExtension['command'], (path?: string) => Promise<void>> {
	return {
		ready: async () => {
			sendMetricsPanelState(deps);
			void triggerSizeScanAndStoreDirectorySizes(deps);
		},

		revealInExplorer: async (targetPath) => {
			const resolved = resolvePanelPath(deps, targetPath);
			if (!resolved) return;

			const uri = vscode.Uri.file(resolved);
			await vscode.commands.executeCommand('revealInExplorer', uri);
		},

		openFile: async (filePath) => {
			const absolutePath = resolvePanelPath(deps, filePath);
			if (!absolutePath) return;

			try {
				const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
				await vscode.window.showTextDocument(doc, {
					preview: true,
					viewColumn: deps.getPreferredEditorColumn() ?? vscode.ViewColumn.One,
				});
			} catch (error) {
				console.error('Open file failed:', error);
			}
		},

		refresh: async () => {
			if (!deps.isPanelOpen()) return;
			void triggerSizeScanAndStoreDirectorySizes(deps);
		},

		cancelScan: async () => {
			deps.scanner.cancelCurrentScan();
		},

		calculateLOC: async () => {
			const rootPath = getPanelRootPath(deps);
			if (!rootPath) return;

			deps.sendMessage({ type: 'locCalculating' });

			try {
				const result = await deps.locScanner.scan(rootPath);
				deps.sendMessage({ type: 'locResult', data: result });
			} catch (error) {
				console.error('LOC calculation failed:', error);
			}
		},

		deepScan: async () => {
			const rootPath = getPanelRootPath(deps);
			const directorySizes = deps.getDirectorySizes();
			if (!rootPath || !directorySizes) return;

			const deepDirectories = deps.scanner.computeDeepScan(directorySizes, rootPath);
			deps.sendMessage({ type: 'deepScanResult', data: deepDirectories });
		},

		reset: async () => {
			deps.scanner.cancelCurrentScan();
			deps.setDirectorySizes(null, null);
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
