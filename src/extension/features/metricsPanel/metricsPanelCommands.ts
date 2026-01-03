import * as vscode from 'vscode';
import type { MessageFromExtension, MessageToExtension } from '../../types';
import { resolvePathIfWithinRoot } from '../../common/pathUtils';
import type { ProjectSizeScanner } from '../sizeScan/projectSizeScanner';
import type { ScanCache } from '../sizeScan/scanCache';
import { LOCScanner } from '../locScan/locScanner';
import type { SizeScanInternals } from '../sizeScan/sizeScanInternals';

type MetricsPanelCommandHandler = (path?: string) => Promise<void>;

function getPanelRootPath(deps: Pick<MetricsPanelCommandDeps, 'isPanelOpen' | 'scanner'>): string | undefined {
	// Defensive: commands can arrive while the panel is closing.
	if (!deps.isPanelOpen()) return undefined;
	return deps.scanner.getCurrentRoot();
}

function resolvePanelPath(
	deps: Pick<MetricsPanelCommandDeps, 'isPanelOpen' | 'scanner'>,
	targetPath: string | undefined
): string | undefined {
	const rootPath = getPanelRootPath(deps);
	if (!rootPath || !targetPath) return undefined;
	// Security: never allow the webview to request paths outside the project root.
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
		// Webview should never get stuck because of an exception; surface a recoverable error instead.
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

	// UI reads from the cache to avoid triggering new scans just to paint.
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
	// Deep breakdown requires scan internals; store them only for the lifetime of the panel session.
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

async function onReady(deps: MetricsPanelCommandDeps): Promise<void> {
	// Bootstrap: send cached state immediately, then kick off the heavy scan in the background.
	sendMetricsPanelState(deps);
	void triggerSizeScanAndStoreInternals(deps);
}

async function onRevealInExplorer(deps: MetricsPanelCommandDeps, targetPath: string | undefined): Promise<void> {
	const resolved = resolvePanelPath(deps, targetPath);
	if (!resolved) return;

	await runCommand(deps, 'revealInExplorer', async () => {
		const uri = vscode.Uri.file(resolved);
		await vscode.commands.executeCommand('revealInExplorer', uri);
	});
}

async function onOpenFile(deps: MetricsPanelCommandDeps, filePath: string | undefined): Promise<void> {
	const absolutePath = resolvePanelPath(deps, filePath);
	if (!absolutePath) return;

	await runCommand(deps, 'openFile', async () => {
		const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
		await vscode.window.showTextDocument(doc, {
			preview: true,
			viewColumn: deps.getPreferredEditorColumn() ?? vscode.ViewColumn.One,
		});
	});
}

async function onRefresh(deps: MetricsPanelCommandDeps): Promise<void> {
	if (!deps.isPanelOpen()) return;
	// Refresh is explicit; keep it async and don't block the UI thread.
	void triggerSizeScanAndStoreInternals(deps);
}

async function onCalculateLOC(deps: MetricsPanelCommandDeps): Promise<void> {
	const rootPath = getPanelRootPath(deps);
	if (!rootPath) return;

	deps.sendMessage({ type: 'locCalculating' });

	await runCommand(deps, 'calculateLOC', async () => {
		const result = await deps.locScanner.scan(rootPath);
		deps.sendMessage({ type: 'locResult', data: result });
	});
}

async function onDeepScan(deps: MetricsPanelCommandDeps): Promise<void> {
	const rootPath = getPanelRootPath(deps);
	const internals = deps.getSizeScanInternals();
	if (!rootPath || !internals) {
		// Ensure the UI overlay can be dismissed even when we can't compute deep metrics yet.
		deps.sendMessage({ type: 'deepScanResult', data: { rootPath: rootPath ?? '', parents: [] } });
		return;
	}

	// Pure compute step: no IO here, just transforms captured scan internals into a UI view model.
	const breakdown = deps.scanner.computeSizeBreakdown({ rootPath, ...internals });
	deps.sendMessage({ type: 'deepScanResult', data: breakdown });
}

async function onReset(deps: MetricsPanelCommandDeps): Promise<void> {
	// Reset is a soft clear for the panel state; scanning resumes automatically as the user keeps working.
	deps.scanner.cancelCurrentScan();
	deps.setSizeScanInternals(null, null);
	deps.sendMessage({ type: 'noRoot' });
}

export function createMetricsPanelCommandHandlers(
	deps: MetricsPanelCommandDeps
): Record<MessageToExtension['command'], MetricsPanelCommandHandler> {
	return {
		ready: () => onReady(deps),
		revealInExplorer: (targetPath) => onRevealInExplorer(deps, targetPath),
		openFile: (filePath) => onOpenFile(deps, filePath),
		refresh: () => onRefresh(deps),
		cancelScan: () => Promise.resolve(deps.scanner.cancelCurrentScan()),
		calculateLOC: () => onCalculateLOC(deps),
		deepScan: () => onDeepScan(deps),
		reset: () => onReset(deps),
	};
}

export async function dispatchMetricsPanelWebviewMessage(
	message: unknown,
	handlers: Record<MessageToExtension['command'], MetricsPanelCommandHandler>
): Promise<void> {
	// Defensive parsing: webview messages are untyped and should not be trusted.
	if (!message || typeof message !== 'object') return;
	const maybeMessage = message as { command?: unknown; path?: unknown };
	if (typeof maybeMessage.command !== 'string') return;
	if (!Object.prototype.hasOwnProperty.call(handlers, maybeMessage.command)) return;

	const handler = handlers[maybeMessage.command as MessageToExtension['command']];
	await handler(typeof maybeMessage.path === 'string' ? maybeMessage.path : undefined);
}
