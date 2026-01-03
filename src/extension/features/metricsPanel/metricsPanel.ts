import * as vscode from 'vscode';
import { ProjectSizeScanner } from '../sizeScan/projectSizeScanner';
import { ScanCache } from '../sizeScan/state/scanCache';
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
import type { SizeScanInternals } from '../sizeScan/state/sizeScanInternals';

/**
 * Webview panel orchestrator for project metrics visualization.
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

	/**
	 * Creates a metrics panel controller.
	 * @param scanner - Scanner used for size scans and breakdown computation.
	 * @param cache - Cache providing the latest scan result for panel rendering.
	 * @param extensionUri - Extension URI used to resolve webview asset paths.
	 */
	constructor(
		private scanner: ProjectSizeScanner,
		private cache: ScanCache,
		private extensionUri: vscode.Uri
	) {
		this.commandHandlers = createMetricsPanelCommandHandlers(this.createCommandDeps());
	}

	/**
	 * Remembers the user's editor column so that opening files from the webview doesn't steal focus.
	 * @param editor - Active editor (if any).
	 * @returns void
	 */
	private updatePreferredEditorColumnFrom(editor: vscode.TextEditor | undefined): void {
		if (!editor) return;
		const scheme = editor.document.uri.scheme;
		if (scheme !== 'file' && scheme !== 'untitled') return;
		// Remember the column so "openFile" from the webview doesn't steal focus from where the user works.
		this.preferredEditorColumn = editor.viewColumn;
	}

	/**
	 * Builds the dependency object consumed by metrics panel command handlers.
	 * @returns Command handler dependencies bound to this panel instance.
	 */
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

	/**
	 * Disposes per-panel resources and clears memory-heavy cached scan internals.
	 * @returns void
	 */
	private disposePanelResources(): void {
		// Internals can be large on big projects; always clear when the panel is disposed.
		this.currentSizeScanInternals = null; // Free memory
		this.currentSizeScanInternalsRootPath = null;
		this.panelDisposables.clear();
	}

	/**
	 * Handles panel disposal by clearing references and releasing resources.
	 * @returns void
	 */
	private handlePanelDisposed(): void {
		this.panel = undefined;
		this.disposePanelResources();
	}

	/**
	 * Shows the panel if it is not open; otherwise focuses it.
	 * @returns void
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
	 * @returns Webview panel instance.
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

	/**
	 * Registers all panel-lifetime subscriptions and disposes them when the panel closes.
	 * @param panel - Webview panel instance.
	 * @returns void
	 */
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
	 * Handles scan start events.
	 * @param progress - Scan progress payload.
	 * @returns void
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
	 * Handles scan progress events and forwards a minimal progress payload to the webview.
	 * @param progress - Scan progress payload.
	 * @returns void
	 */
	private handleProgress(progress: ScanProgress): void {
		const progressData: ProgressData = {
			currentBytes: progress.currentBytes,
			directoriesScanned: progress.directoriesScanned,
		};
		this.sendMessage({ type: 'progress', data: progressData });
	}

	/**
	 * Sends the latest cached scan state to the webview.
	 * @returns void
	 */
	private updatePanel(): void {
		sendMetricsPanelState({
			scanner: this.scanner,
			cache: this.cache,
			sendMessage: (message) => this.sendMessage(message),
		});
	}

	/**
	 * Sends a message to the webview if the panel is open.
	 * @param message - Message payload for the webview.
	 * @returns void
	 */
	private sendMessage(message: MessageFromExtension): void {
		const panel = this.panel;
		if (!panel) return;
		void panel.webview.postMessage(message);
	}

	/**
	 * Disposes the panel and all subscriptions.
	 * @returns void
	 */
	dispose(): void {
		const panel = this.panel;
		this.panel = undefined;
		this.disposePanelResources();
		panel?.dispose();
		this.panelDisposables.dispose();
	}
}
