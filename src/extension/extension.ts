import * as vscode from 'vscode';
import { TerminalStatusBarItem } from './statusBar/terminalItem';
import { MetricsStatusBarItem } from './statusBar/metricsItem';
import { ProjectScanner } from './scanner/projectScanner';
import { ScanCache } from './cache/scanCache';
import { ScanPanel } from './webview/scanPanel';

let terminalItem: TerminalStatusBarItem;
let metricsItem: MetricsStatusBarItem;
let scanner: ProjectScanner;
let cache: ScanCache;
let scanPanel: ScanPanel;

export function activate(context: vscode.ExtensionContext) {
	console.log('Termetrix is now active');

	// Initialize cache
	cache = new ScanCache();

	// Initialize scanner
	scanner = new ProjectScanner(cache);

	// Initialize scan panel
	scanPanel = new ScanPanel(scanner, cache, context.extensionUri);

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
