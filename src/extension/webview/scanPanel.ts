import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectScanner } from '../scanner/projectScanner';
import { ScanCache } from '../cache/scanCache';
import { ScanProgress } from '../types';
import { LOCScanner } from '../scanner/locScanner';
import { ScannerEventSubscription } from '../utils/scannerEvents';

/**
 * Webview panel orchestrator for project scanning visualization
 */
export class ScanPanel {
	private panel: vscode.WebviewPanel | undefined;
	private disposables: vscode.Disposable[] = [];
	private locScanner: LOCScanner;
	private eventSubscription: ScannerEventSubscription;
	/** Temporary storage for directorySizes during webview session (for deep scan) */
	private currentDirectorySizes: Record<string, number> | null = null;
	/** Last known editor column used by the user (non-webview), for opening files outside the webview column */
	private preferredEditorColumn: vscode.ViewColumn | undefined;

	constructor(
		private scanner: ProjectScanner,
		private cache: ScanCache,
		private extensionUri: vscode.Uri
	) {
		this.locScanner = new LOCScanner();

		this.eventSubscription = new ScannerEventSubscription(scanner, {
			onScanStart: this.handleScanStart.bind(this),
			onProgress: this.handleProgress.bind(this),
			onScanEnd: this.handleScanEnd.bind(this)
		});

		// Track the user's last active editor column so we can open files there (not in the webview column).
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				if (!editor) return;
				const scheme = editor.document.uri.scheme;
				if (scheme === 'file' || scheme === 'untitled') {
					this.preferredEditorColumn = editor.viewColumn;
				}
			})
		);
	}

	/**
	 * Show or focus the panel
	 */
	show(): void {
		// Capture the current user editor column before focusing/creating the webview.
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const scheme = editor.document.uri.scheme;
			if (scheme === 'file' || scheme === 'untitled') {
				this.preferredEditorColumn = editor.viewColumn;
			}
		}

		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Beside);
			this.updatePanel();
		} else {
			this.createPanel();
		}
	}

	/**
	 * Create webview panel
	 */
	private createPanel(): void {
		const webviewUri = vscode.Uri.joinPath(this.extensionUri, 'out', 'webview');

		this.panel = vscode.window.createWebviewPanel(
			'termetrixScanPanel',
			'Termetrix Scanner',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [webviewUri]
			}
		);

		// Set HTML content
		this.panel.webview.html = this.getWebviewHTML(this.panel.webview, webviewUri);

		// Handle messages from webview
		this.panel.webview.onDidReceiveMessage(
			this.handleWebviewMessage.bind(this),
			undefined,
			this.disposables
		);

		// Clean up when panel is closed
		this.panel.onDidDispose(
			() => {
				this.panel = undefined;
				this.currentDirectorySizes = null; // Free memory
				this.disposables.forEach(d => d.dispose());
				this.disposables = [];
			},
			undefined,
			this.disposables
		);
	}

	/**
	 * Generate HTML for webview that loads the bundled Svelte app
	 */
	private getWebviewHTML(webview: vscode.Webview, webviewUri: vscode.Uri): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(webviewUri, 'webview.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(webviewUri, 'webview.css')
		);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; connect-src ${webview.cspSource};">
	<title>Termetrix Scanner</title>
	<link rel="stylesheet" href="${styleUri}">
</head>
<body>
	<script src="${scriptUri}"></script>
</body>
</html>`;
	}

	/**
	 * Handle scan start event
	 */
	private handleScanStart(progress: ScanProgress): void {
		this.sendMessage({ type: 'scanStart', data: progress });
	}

	/**
	 * Handle progress event
	 */
	private handleProgress(progress: ScanProgress): void {
		this.sendMessage({ type: 'progress', data: progress });
	}

	/**
	 * Handle scan end event
	 */
	private handleScanEnd(_progress: ScanProgress): void {
		this.updatePanel();
	}

	/**
	 * Update panel with current scan data
	 */
	private updatePanel(): void {
		const rootPath = this.scanner.getCurrentRoot();
		if (!rootPath) {
			this.sendMessage({ type: 'noRoot' });
			return;
		}

		const scanResult = this.cache.get(rootPath);
		const isScanning = this.scanner.isScanInProgress();

		this.sendMessage({
			type: 'update',
			data: {
				scanResult,
				isScanning
			}
		});
	}

	/**
	 * Command handlers map - each handler has single responsibility
	 */
	private readonly commandHandlers: Record<string, (path?: string) => Promise<void>> = {
		ready: async () => {
			// Show current state immediately (even if scanning)
			await this.updatePanel();
			// Trigger fresh scan in background (updates will come via events)
			this.triggerScan();
		},

		revealInExplorer: async (targetPath) => {
			if (targetPath) {
				const uri = vscode.Uri.file(targetPath);
				await vscode.commands.executeCommand('revealInExplorer', uri);
			}
		},

		openFile: async (filePath) => {
			const rootPath = this.scanner.getCurrentRoot();
			if (!rootPath || !filePath) {
				return;
			}

			const absolutePath = path.resolve(rootPath, filePath);
			const absoluteRoot = path.resolve(rootPath);
			if (absolutePath !== absoluteRoot && !absolutePath.startsWith(absoluteRoot + path.sep)) {
				return;
			}

			try {
				const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
				await vscode.window.showTextDocument(doc, {
					preview: true,
					viewColumn: this.preferredEditorColumn ?? vscode.ViewColumn.One,
				});
			} catch (error) {
				console.error('Open file failed:', error);
			}
		},

		refresh: async () => {
			// Trigger fresh scan (updates will come via events)
			this.triggerScan();
		},

		cancelScan: async () => {
			// Cancel current scan if in progress
			this.scanner.cancelCurrentScan();
		},

		calculateLOC: async () => {
			await this.handleCalculateLOC();
		},

		deepScan: async () => {
			await this.handleDeepScan();
		},

		reset: async () => {
			// Cancel any ongoing scan
			this.scanner.cancelCurrentScan();
			// Clear cached directory sizes
			this.currentDirectorySizes = null;
			// Send noRoot to reset UI to initial state
			this.sendMessage({ type: 'noRoot' });
		}
	};

	/**
	 * Handle messages from webview - delegates to command handlers
	 */
	private async handleWebviewMessage(message: { command: string; path?: string }): Promise<void> {
		const handler = this.commandHandlers[message.command];
		if (handler) {
			await handler(message.path);
		}
	}

	/**
	 * Handle LOC calculation request
	 */
	private async handleCalculateLOC(): Promise<void> {
		const rootPath = this.scanner.getCurrentRoot();
		if (!rootPath || !this.panel) {
			return;
		}

		this.sendMessage({ type: 'locCalculating' });

		try {
			const result = await this.locScanner.scan(rootPath);
			this.sendMessage({ type: 'locResult', data: result });
		} catch (error) {
			console.error('LOC calculation failed:', error);
		}
	}

	/**
	 * Trigger a fresh scan and save directorySizes for deep scan
	 * Single responsibility: initiate scan and cache results
	 */
	private async triggerScan(): Promise<void> {
		const result = await this.scanner.scan();
		if (result?.directorySizes) {
			this.currentDirectorySizes = result.directorySizes;
		}
	}

	/**
	 * Handle deep scan request - computes cumulative sizes from current scan data
	 */
	private async handleDeepScan(): Promise<void> {
		const rootPath = this.scanner.getCurrentRoot();
		if (!rootPath || !this.panel || !this.currentDirectorySizes) {
			return;
		}

		const deepDirectories = this.scanner.computeDeepScan(
			this.currentDirectorySizes,
			rootPath
		);

		this.sendMessage({ type: 'deepScanResult', data: deepDirectories });
	}

	/**
	 * Send message to webview
	 */
	private sendMessage(message: unknown): void {
		this.panel?.webview.postMessage(message);
	}

	dispose(): void {
		this.eventSubscription.dispose();
		this.panel?.dispose();
		this.disposables.forEach(d => d.dispose());
	}
}
