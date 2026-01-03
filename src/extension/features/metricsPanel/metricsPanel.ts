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
	type MetricsPanelCommandDeps,
} from './metricsPanelCommands';
import { getMetricsPanelHtml } from './metricsPanelHtml';
import type { SizeScanInternals } from '../sizeScan/sizeScanInternals';

/**
 * Webview panel orchestrator for project metrics visualization
 */
export class MetricsPanel implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private readonly panelDisposables = new DisposableStore();
	private readonly locScanner = new LOCScanner();
	private readonly commandHandlers: ReturnType<typeof createMetricsPanelCommandHandlers>;
	/** Temporary storage for size scan internals during webview session (for breakdown computation) */
	private currentSizeScanInternals: SizeScanInternals | null = null;
	private currentSizeScanInternalsRootPath: string | null = null;
	/** Last known editor column used by the user (non-webview), for opening files outside the webview column */
	private preferredEditorColumn: vscode.ViewColumn | undefined;

	constructor(
		private scanner: ProjectSizeScanner,
		private cache: ScanCache,
		private extensionUri: vscode.Uri
	) {
		this.commandHandlers = createMetricsPanelCommandHandlers(this.createCommandDeps());
	}

	private updatePreferredEditorColumnFrom(editor: vscode.TextEditor | undefined): void {
		if (!editor) return;
		const scheme = editor.document.uri.scheme;
		if (scheme !== 'file' && scheme !== 'untitled') return;
		// Remember the column so "openFile" from the webview doesn't steal focus from where the user works.
		this.preferredEditorColumn = editor.viewColumn;
	}

	private createCommandDeps(): MetricsPanelCommandDeps {
		return {
			scanner: this.scanner,
			cache: this.cache,
			locScanner: this.locScanner,
			isPanelOpen: () => Boolean(this.panel),
			getPreferredEditorColumn: () => this.preferredEditorColumn,
			getSizeScanInternals: () => this.currentSizeScanInternals,
			setSizeScanInternals: (value, rootPath) => {
				this.currentSizeScanInternals = value;
				this.currentSizeScanInternalsRootPath = value ? rootPath : null;
			},
			sendMessage: (message) => this.sendMessage(message),
		};
	}

	private disposePanelResources(): void {
		// Internals can be large on big projects; always clear when the panel is disposed.
		this.currentSizeScanInternals = null; // Free memory
		this.currentSizeScanInternalsRootPath = null;
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
			// If already open, just focus and push the latest cached state.
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
				// Keep UI state across tab switches; we still explicitly refresh data on scan end / user actions.
				retainContextWhenHidden: true,
				localResourceRoots: [webviewUri],
			}
		);

		panel.webview.html = getMetricsPanelHtml(panel.webview, webviewUri);

		return panel;
	}

	private registerPanelSubscriptions(panel: vscode.WebviewPanel): void {
		// Scanner progress events can be frequent; keep handlers minimal.
		const scanEvents = new ScannerEventSubscription(this.scanner, {
			onScanStart: (progress) => this.handleScanStart(progress),
			onProgress: (progress) => this.handleProgress(progress),
			onScanEnd: () => this.updatePanel(),
		});

		// Track the user's last active editor column so "openFile" doesn't steal focus from the webview.
		const activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
			this.updatePreferredEditorColumnFrom(editor);
		});

		// The dispatcher validates message shape; handlers are the only entry points into VS Code APIs.
		const webviewMessageListener = panel.webview.onDidReceiveMessage((message) =>
			void dispatchMetricsPanelWebviewMessage(message, this.commandHandlers)
		);

		const disposeListener = panel.onDidDispose(() => this.handlePanelDisposed());

		this.panelDisposables.add(
			vscode.Disposable.from(scanEvents, activeEditorListener, webviewMessageListener, disposeListener)
		);
	}

	/**
	 * Handle scan start event
	 */
	private handleScanStart(progress: ScanProgress): void {
		// If the scan root changes, invalidate scan internals from the previous root.
		if (progress.rootPath !== this.currentSizeScanInternalsRootPath) {
			this.currentSizeScanInternals = null;
			this.currentSizeScanInternalsRootPath = null;
		}
		// UI updates for scan start/progress do not require full cached state.
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
	 * Send message to webview
	 */
	private sendMessage(message: MessageFromExtension): void {
		const panel = this.panel;
		if (!panel) return;
		void panel.webview.postMessage(message);
	}

	dispose(): void {
		const panel = this.panel;
		this.panel = undefined;
		this.disposePanelResources();
		panel?.dispose();
		this.panelDisposables.dispose();
	}
}
