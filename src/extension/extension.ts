import * as vscode from 'vscode';
import { TerminalStatusBarItem } from './features/statusBar/terminalItem';
import { MetricsStatusBarItem } from './features/statusBar/metricsItem';
import { ProjectSizeScanner } from './features/sizeScan/projectSizeScanner';
import { ScanCache } from './features/sizeScan/scanCache';
import { MetricsPanel } from './features/metricsPanel/metricsPanel';

function createCoreServices(context: vscode.ExtensionContext): {
	cache: ScanCache;
	scanner: ProjectSizeScanner;
	metricsPanel: MetricsPanel;
	terminalItem: TerminalStatusBarItem;
	metricsItem: MetricsStatusBarItem;
} {
	const cache = new ScanCache();
	const scanner = new ProjectSizeScanner(cache);
	const metricsPanel = new MetricsPanel(scanner, cache, context.extensionUri);

	const terminalItem = new TerminalStatusBarItem(() => scanner.getCurrentRoot());
	const metricsItem = new MetricsStatusBarItem(scanner, cache);

	return { cache, scanner, metricsPanel, terminalItem, metricsItem };
}

function registerCommands(params: {
	scanner: ProjectSizeScanner;
	metricsPanel: MetricsPanel;
	metricsItem: MetricsStatusBarItem;
	terminalItem: TerminalStatusBarItem;
}): vscode.Disposable[] {
	const { scanner, metricsPanel, metricsItem, terminalItem } = params;

	const openScanPanelCmd = vscode.commands.registerCommand('termetrix.openScanPanel', () => metricsPanel.show());

	const refreshScanCmd = vscode.commands.registerCommand('termetrix.refreshScan', async () => {
		await scanner.scan();
		metricsItem.update();
	});

	const openTerminalCmd = vscode.commands.registerCommand('termetrix.openTerminal', () => {
		terminalItem.openTerminal();
	});

	return [openScanPanelCmd, refreshScanCmd, openTerminalCmd];
}

function registerEditorTracking(params: {
	scanner: ProjectSizeScanner;
	metricsItem: MetricsStatusBarItem;
}): vscode.Disposable {
	const { scanner, metricsItem } = params;
	return vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (!editor) return;
		scanner.handleEditorChange(editor);
		metricsItem.update();
	});
}

function runInitialScan(params: { scanner: ProjectSizeScanner; metricsItem: MetricsStatusBarItem }): void {
	const { scanner, metricsItem } = params;
	void (async () => {
		await scanner.scanSummary();
		metricsItem.update();
	})();
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Termetrix is now active');

	const { scanner, metricsPanel, terminalItem, metricsItem } = createCoreServices(context);
	const commands = registerCommands({ scanner, metricsPanel, metricsItem, terminalItem });
	const editorTracking = registerEditorTracking({ scanner, metricsItem });

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

export function deactivate() {
	console.log('Termetrix is now deactivated');
}
