import * as vscode from 'vscode';
import { TerminalStatusBarItem } from './features/statusBar/terminalItem';
import { MetricsStatusBarItem } from './features/statusBar/metricsItem';
import { ProjectSizeScanner } from './features/sizeScan/projectSizeScanner';
import { ScanCache } from './features/sizeScan/scanCache';
import { MetricsPanel } from './features/metricsPanel/metricsPanel';

/**
 * Creates the core, long-lived services used by the extension.
 * @param context - VS Code extension context.
 * @returns Core service instances.
 */
function createCoreServices(context: vscode.ExtensionContext): {
	cache: ScanCache;
	scanner: ProjectSizeScanner;
	metricsPanel: MetricsPanel;
	terminalItem: TerminalStatusBarItem;
	metricsItem: MetricsStatusBarItem;
} {
	// Core services are created once per activation and disposed via `context.subscriptions`.
	const cache = new ScanCache();
	const scanner = new ProjectSizeScanner(cache);
	const metricsPanel = new MetricsPanel(scanner, cache, context.extensionUri);

	const terminalItem = new TerminalStatusBarItem(() => scanner.getCurrentRoot());
	const metricsItem = new MetricsStatusBarItem(scanner, cache);

	return { cache, scanner, metricsPanel, terminalItem, metricsItem };
}

/**
 * Registers extension commands and returns their disposables.
 * @param params - Command registration dependencies.
 * @param params.scanner - Size scanner used by scan-related commands.
 * @param params.metricsPanel - Panel used by the open command.
 * @param params.metricsItem - Status bar item to refresh after scans.
 * @param params.terminalItem - Status bar item to open the terminal.
 * @returns Command disposables.
 */
function registerCommands(params: {
	scanner: ProjectSizeScanner;
	metricsPanel: MetricsPanel;
	metricsItem: MetricsStatusBarItem;
	terminalItem: TerminalStatusBarItem;
}): vscode.Disposable[] {
	const { scanner, metricsPanel, metricsItem, terminalItem } = params;

	// Commands are the public surface of the extension. Keep handlers small and delegate to services.
	const openScanPanelCmd = vscode.commands.registerCommand('termetrix.openScanPanel', () => metricsPanel.show());

	const refreshScanCmd = vscode.commands.registerCommand('termetrix.refreshScan', async () => {
		// Explicit refresh: run the full scan and then refresh the status bar.
		await scanner.scan();
		metricsItem.update();
	});

	const openTerminalCmd = vscode.commands.registerCommand('termetrix.openTerminal', () => {
		terminalItem.openTerminal();
	});

	return [openScanPanelCmd, refreshScanCmd, openTerminalCmd];
}

/**
 * Tracks active editor changes to keep the current scan root and status bar up to date.
 * @param params - Editor tracking dependencies.
 * @param params.scanner - Scanner to update when the active editor changes.
 * @param params.metricsItem - Status bar item to refresh after root changes.
 * @returns Subscription disposable.
 */
function registerEditorTracking(params: {
	scanner: ProjectSizeScanner;
	metricsItem: MetricsStatusBarItem;
}): vscode.Disposable {
	const { scanner, metricsItem } = params;
	return vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (!editor) return;
		// Root selection is tied to the active editor (multi-root workspaces).
		scanner.handleEditorChange(editor);
		metricsItem.update();
	});
}

/**
 * Performs the initial scan during activation (runs asynchronously).
 * @param params - Initial scan dependencies.
 * @param params.scanner - Scanner used to run a quick summary scan.
 * @param params.metricsItem - Status bar item to refresh after the scan.
 * @returns void
 */
function runInitialScan(params: { scanner: ProjectSizeScanner; metricsItem: MetricsStatusBarItem }): void {
	const { scanner, metricsItem } = params;
	void (async () => {
		// Keep activation snappy: start with the summary scan and let the user trigger deeper views.
		await scanner.scanSummary();
		metricsItem.update();
	})();
}

/**
 * VS Code entry point called when the extension is activated.
 * @param context - VS Code extension context.
 * @returns void
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('Termetrix is now active');

	const { scanner, metricsPanel, terminalItem, metricsItem } = createCoreServices(context);
	const commands = registerCommands({ scanner, metricsPanel, metricsItem, terminalItem });
	const editorTracking = registerEditorTracking({ scanner, metricsItem });

	// Ensure everything is disposed on deactivation.
	context.subscriptions.push(
		terminalItem,
		metricsItem,
		metricsPanel,
		...commands,
		editorTracking,
		// Dispose scanner on deactivation
		{ dispose: () => scanner.dispose() }
	);

	runInitialScan({ scanner, metricsItem });
}

/**
 * VS Code entry point called when the extension is deactivated.
 * @returns void
 */
export function deactivate() {
	console.log('Termetrix is now deactivated');
}
