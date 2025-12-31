import * as vscode from 'vscode';
import { TerminalStatusBarItem } from './features/statusBar/terminalItem';
import { MetricsStatusBarItem } from './features/statusBar/metricsItem';
import { ProjectSizeScanner } from './features/sizeScan/projectSizeScanner';
import { ScanCache } from './features/sizeScan/scanCache';
import { MetricsPanel } from './features/metricsPanel/metricsPanel';

let terminalItem: TerminalStatusBarItem;
let metricsItem: MetricsStatusBarItem;
let scanner: ProjectSizeScanner;
let cache: ScanCache;
let scanPanel: MetricsPanel;

export function activate(context: vscode.ExtensionContext) {
	console.log('Termetrix is now active');

	// Initialize cache
	cache = new ScanCache();

	// Initialize scanner
	scanner = new ProjectSizeScanner(cache);

	// Initialize scan panel
	scanPanel = new MetricsPanel(scanner, cache, context.extensionUri);

	// Initialize status bar items
	terminalItem = new TerminalStatusBarItem();
	metricsItem = new MetricsStatusBarItem(scanner, cache);

	// Register commands
	const openScanPanelCmd = vscode.commands.registerCommand('termetrix.openScanPanel', () => {
		scanPanel.show();
	});

	const refreshScanCmd = vscode.commands.registerCommand('termetrix.refreshScan', async () => {
		await scanner.scan();
		metricsItem.update();
	});

	const openTerminalCmd = vscode.commands.registerCommand('termetrix.openTerminal', () => {
		terminalItem.openTerminal();
	});

	// Add to subscriptions
	context.subscriptions.push(
		terminalItem,
		metricsItem,
		openScanPanelCmd,
		refreshScanCmd,
		openTerminalCmd,
		// Dispose scanner on deactivation
		{ dispose: () => scanner.dispose() }
	);

	// Initial scan
	scanner.scan().then(() => {
		metricsItem.update();
	});

	// Watch for active editor changes (multi-root project handling)
	vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor) {
			scanner.handleEditorChange(editor);
			metricsItem.update();
		}
	}, null, context.subscriptions);

	// Watch for text selection changes (LOC counter)
	vscode.window.onDidChangeTextEditorSelection(() => {
		metricsItem.updateSelection();
	}, null, context.subscriptions);
}

export function deactivate() {
	console.log('Termetrix is now deactivated');
}
