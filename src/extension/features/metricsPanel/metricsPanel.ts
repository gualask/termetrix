import * as vscode from 'vscode';
import { ProjectSizeScanner } from '../sizeScan/projectSizeScanner';
import { ScanCache } from '../sizeScan/scanCache';
import type { MessageFromExtension, ProgressData, ScanProgress } from '../../types';
import { LOCScanner } from '../locScan/locScanner';
import { ScannerEventSubscription } from '../../common/scannerEvents';
import { DisposableStore } from '../../common/disposableStore';
import {
	createMetricsPanelCommandHandlers,
	dispatchMetricsPanelWebviewMessage,
	sendMetricsPanelState,
} from './metricsPanelCommands';
import { getMetricsPanelHtml } from './metricsPanelHtml';

/**
 * Webview panel orchestrator for project metrics visualization
 */
export class MetricsPanel implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private readonly panelDisposables = new DisposableStore();
	private readonly locScanner: LOCScanner;
	private readonly commandHandlers: ReturnType<typeof createMetricsPanelCommandHandlers>;
	/** Temporary storage for directorySizes during webview session (for deep scan) */
	private currentDirectorySizes: Record<string, number> | null = null;
	private currentDirectorySizesRootPath: string | null = null;
	/** Last known editor column used by the user (non-webview), for opening files outside the webview column */
	private preferredEditorColumn: vscode.ViewColumn | undefined;

	constructor(
		private scanner: ProjectSizeScanner,
		private cache: ScanCache,
		private extensionUri: vscode.Uri
	) {
		this.locScanner = new LOCScanner();
		this.commandHandlers = createMetricsPanelCommandHandlers({
			scanner: this.scanner,
			cache: this.cache,
			locScanner: this.locScanner,
			isPanelOpen: () => Boolean(this.panel),
			getPreferredEditorColumn: () => this.preferredEditorColumn,
			getDirectorySizes: () => this.currentDirectorySizes,
			setDirectorySizes: (value, rootPath) => {
				this.currentDirectorySizes = value;
				this.currentDirectorySizesRootPath = value ? rootPath : null;
			},
			sendMessage: (message) => this.sendMessage(message),
		});
	}

	private updatePreferredEditorColumnFrom(editor: vscode.TextEditor | undefined): void {
		if (!editor) return;
		const scheme = editor.document.uri.scheme;
		if (scheme !== 'file' && scheme !== 'untitled') return;
		this.preferredEditorColumn = editor.viewColumn;
	}

	private disposePanelResources(): void {
		this.currentDirectorySizes = null; // Free memory
		this.currentDirectorySizesRootPath = null;
		this.panelDisposables.clear();
	}

	private handlePanelDisposed(): void {
		this.panel = undefined;
		this.disposePanelResources();
	}

	/**
	 * Show or focus the panel
	 */
	show(): void {
		// Capture the current user editor column before focusing/creating the webview.
		this.updatePreferredEditorColumnFrom(vscode.window.activeTextEditor);

		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Beside);
			this.updatePanel();
			return;
		}

		this.panel = this.createPanel();
		this.registerPanelSubscriptions(this.panel);
	}

	/**
	 * Create webview panel (no subscriptions).
	 */
	private createPanel(): vscode.WebviewPanel {
		this.disposePanelResources();

		const webviewUri = vscode.Uri.joinPath(this.extensionUri, 'out', 'webview');

		const panel = vscode.window.createWebviewPanel(
			'termetrixScanPanel',
			'Termetrix Metrics',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [webviewUri]
			}
		);

		// Set HTML content
		panel.webview.html = getMetricsPanelHtml(panel.webview, webviewUri);

		return panel;
	}

	private registerPanelSubscriptions(panel: vscode.WebviewPanel): void {
		// Subscribe to scanner events for the lifetime of this panel instance.
		this.panelDisposables.add(
			new ScannerEventSubscription(this.scanner, {
				onScanStart: this.handleScanStart.bind(this),
				onProgress: this.handleProgress.bind(this),
				onScanEnd: this.handleScanEnd.bind(this),
			})
		);

		// Track the user's last active editor column so we can open files there (not in the webview column).
		this.panelDisposables.add(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				this.updatePreferredEditorColumnFrom(editor);
			})
		);

		// Handle messages from webview
		this.panelDisposables.add(
			panel.webview.onDidReceiveMessage((message) => void this.handleWebviewMessage(message))
		);

		// Clean up when panel is closed
		this.panelDisposables.add(
			panel.onDidDispose(() => this.handlePanelDisposed())
		);
	}

	/**
	 * Handle scan start event
	 */
	private handleScanStart(progress: ScanProgress): void {
		// If the scan root changes, invalidate directorySizes from the previous root.
		if (progress.rootPath !== this.currentDirectorySizesRootPath) {
			this.currentDirectorySizes = null;
			this.currentDirectorySizesRootPath = null;
		}
		this.sendMessage({ type: 'scanStart' });
	}

	/**
	 * Handle progress event
	 */
	private handleProgress(progress: ScanProgress): void {
		const progressData: ProgressData = {
			currentBytes: progress.currentBytes,
			directoriesScanned: progress.directoriesScanned,
		};
		this.sendMessage({ type: 'progress', data: progressData });
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
		sendMetricsPanelState({
			scanner: this.scanner,
			cache: this.cache,
			sendMessage: (message) => this.sendMessage(message),
		});
	}

	/**
	 * Handle messages from webview - delegates to command handlers
	 */
	private async handleWebviewMessage(message: unknown): Promise<void> {
		await dispatchMetricsPanelWebviewMessage(message, this.commandHandlers);
	}

	/**
	 * Send message to webview
	 */
	private sendMessage(message: MessageFromExtension): void {
		void this.panel?.webview.postMessage(message);
	}

	dispose(): void {
		const panel = this.panel;
		this.panel = undefined;
		this.disposePanelResources();
		panel?.dispose();
		this.panelDisposables.dispose();
	}
}
