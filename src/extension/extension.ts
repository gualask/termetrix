import * as vscode from 'vscode';
import { TerminalStatusBarItem } from './features/statusBar/terminalItem';
import { MetricsStatusBarItem } from './features/statusBar/metricsItem';
import { ProjectSizeScanner } from './features/sizeScan/projectSizeScanner';
import { ScanCache } from './features/sizeScan/scanCache';
import { MetricsPanel } from './features/metricsPanel/metricsPanel';

export function activate(context: vscode.ExtensionContext) {
	console.log('Termetrix is now active');

	const cache = new ScanCache();
	const scanner = new ProjectSizeScanner(cache);
	const metricsPanel = new MetricsPanel(scanner, cache, context.extensionUri);

	const terminalItem = new TerminalStatusBarItem(() => scanner.getCurrentRoot());
	const metricsItem = new MetricsStatusBarItem(scanner, cache);

	// Register commands
	const openScanPanelCmd = vscode.commands.registerCommand('termetrix.openScanPanel', () => metricsPanel.show());

	const refreshScanCmd = vscode.commands.registerCommand('termetrix.refreshScan', async () => {
		await scanner.scan();
		metricsItem.update();
	});

	const openTerminalCmd = vscode.commands.registerCommand('termetrix.openTerminal', () => {
		terminalItem.openTerminal();
	});

	context.subscriptions.push(
		terminalItem,
		metricsItem,
		metricsPanel,
		openScanPanelCmd,
		refreshScanCmd,
		openTerminalCmd,
		// Dispose scanner on deactivation
		{ dispose: () => scanner.dispose() }
	);

	void (async () => {
		await scanner.scanSummary();
		metricsItem.update();
	})();

	// Watch for active editor changes (multi-root project handling)
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (!editor) return;
			scanner.handleEditorChange(editor);
			metricsItem.update();
		})
	);
}

export function deactivate() {
	console.log('Termetrix is now deactivated');
}
