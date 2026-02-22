import * as vscode from 'vscode';
import { TerminalStatusBarItem } from './vscode/statusBar/terminalItem';
import { MetricsStatusBarItem } from './vscode/statusBar/metricsItem';
import { ScanRefreshStatusBarItem } from './vscode/statusBar/scanRefreshItem';
import { SelectionLinesStatusBarItem } from './vscode/statusBar/selectionLinesItem';
import { ProjectSizeScanner } from './vscode/sizeScan/projectSizeScanner';
import { ScanCache } from './vscode/sizeScan/state/scanCache';
import { MetricsPanel } from './vscode/metricsPanel/metricsPanel';
import { configManager, shouldAutoScanOnStartup } from './support/configManager';
import { COMMAND_IDS } from './support/constants';
import { logger } from './support/logger';

/**
 * Creates the core, long-lived services used by the extension.
 * @param context - VS Code extension context.
 * @returns Core service instances.
 */
function createCoreServices(context: vscode.ExtensionContext): {
	scanner: ProjectSizeScanner;
	metricsPanel: MetricsPanel;
	terminalItem: TerminalStatusBarItem;
	metricsItem: MetricsStatusBarItem;
	scanRefreshItem: ScanRefreshStatusBarItem;
	selectionLinesItem: SelectionLinesStatusBarItem;
} {
	// Core services are created once per activation and disposed via `context.subscriptions`.
	const cache = new ScanCache();
	const scanner = new ProjectSizeScanner(cache);
	const metricsPanel = new MetricsPanel(scanner, context.extensionUri);

	const terminalItem = new TerminalStatusBarItem();
	const metricsItem = new MetricsStatusBarItem(scanner, cache);
	const scanRefreshItem = new ScanRefreshStatusBarItem(scanner);
	const selectionLinesItem = new SelectionLinesStatusBarItem();

	return { scanner, metricsPanel, terminalItem, metricsItem, scanRefreshItem, selectionLinesItem };
}

/**
 * Registers extension commands and returns their disposables.
 * @param params - Command registration dependencies.
 * @param params.scanner - Size scanner used by scan-related commands.
 * @param params.metricsPanel - Panel used by the open command.
 * @param params.terminalItem - Status bar item to open the terminal.
 * @returns Command disposables.
 */
function registerCommands(params: {
	scanner: ProjectSizeScanner;
	metricsPanel: MetricsPanel;
	terminalItem: TerminalStatusBarItem;
}): vscode.Disposable[] {
	const { scanner, metricsPanel, terminalItem } = params;

	// Commands are the public surface of the extension. Keep handlers small and delegate to services.
	const openMetricsPanelCmd = vscode.commands.registerCommand(COMMAND_IDS.openMetricsPanel, () => metricsPanel.show());

	const refreshScanCmd = vscode.commands.registerCommand(COMMAND_IDS.refreshScan, async () => {
		// Full scan when the panel is open (breakdown needs directory metrics); summary otherwise.
		await (metricsPanel.isOpen() ? scanner.scan() : scanner.scanSummary());
	});

	const cancelScanCmd = vscode.commands.registerCommand(COMMAND_IDS.cancelScan, () => {
		scanner.cancelCurrentScan();
	});

	const openTerminalCmd = vscode.commands.registerCommand(COMMAND_IDS.openTerminal, () => {
		terminalItem.openTerminal();
	});

	return [openMetricsPanelCmd, refreshScanCmd, cancelScanCmd, openTerminalCmd];
}

/**
 * Tracks active editor changes to keep the current scan root up to date.
 * @param params - Editor tracking dependencies.
 * @param params.scanner - Scanner to update when the active editor changes.
 * @returns Subscription disposable.
 */
function registerEditorTracking(params: {
	scanner: ProjectSizeScanner;
}): vscode.Disposable {
	const { scanner } = params;
	return vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (!editor) return;
		// Root selection is tied to the active editor (multi-root workspaces).
		scanner.handleEditorChange(editor);
	});
}

/**
 * Performs the initial scan during activation (runs asynchronously).
 * @param params - Initial scan dependencies.
 * @param params.scanner - Scanner used to run a quick summary scan.
 * @returns void
 */
function runInitialScan(params: { scanner: ProjectSizeScanner }): void {
	const { scanner } = params;
	const { autoScanMode } = configManager.getScanSettings();
	if (!shouldAutoScanOnStartup(autoScanMode)) {
		return;
	}

	void (async () => {
		// Keep activation snappy: start with the summary scan and let the user trigger deeper views.
		await scanner.scanSummary();
	})();
}

/**
 * VS Code entry point called when the extension is activated.
 * @param context - VS Code extension context.
 * @returns void
 */
export function activate(context: vscode.ExtensionContext) {
	// Initialize logger early so all services can use it
	logger.initialize();
	logger.debug('Termetrix is now active');

	const { scanner, metricsPanel, terminalItem, metricsItem, scanRefreshItem, selectionLinesItem } = createCoreServices(context);
	const commands = registerCommands({ scanner, metricsPanel, terminalItem });
	const editorTracking = registerEditorTracking({ scanner });

	// Apply status bar visibility settings and keep them in sync at runtime.
	const applyStatusBarConfig = () => {
		const { showTerminalButton, showSelectionLineCount } = configManager.getStatusBarConfig();
		terminalItem.setVisible(showTerminalButton);
		selectionLinesItem.setVisible(showSelectionLineCount);
	};
	const statusBarConfigSubscription = configManager.subscribeAndApply(applyStatusBarConfig);

	// Ensure everything is disposed on deactivation.
	context.subscriptions.push(
		terminalItem,
		metricsItem,
		scanRefreshItem,
		selectionLinesItem,
		metricsPanel,
		...commands,
		editorTracking,
		statusBarConfigSubscription,
		// Dispose scanner and logger on deactivation
		{ dispose: () => scanner.dispose() },
		{ dispose: () => logger.dispose() }
	);

	runInitialScan({ scanner });
}

/**
 * VS Code entry point called when the extension is deactivated.
 * @returns void
 */
export function deactivate() {
	// Cleanup handled by context.subscriptions
}
