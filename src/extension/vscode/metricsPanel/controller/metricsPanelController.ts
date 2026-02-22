import * as vscode from 'vscode';
import type { MessageToExtension, ProgressData } from '../../../types';
import { ScannerEventSubscription } from '../../../support/scannerEvents';
import { DisposableStore } from '../../../support/disposableStore';
import { type MetricsPanelCommandHandler } from '../commands/metricsPanelCommands';
import { dispatchMetricsPanelWebviewMessage } from '../commands/metricsPanelMessageRouter';
import { createProgressMessage, createScanStartMessage, createUpdateMessage } from '../messages';
import type { ProjectSizeScanner } from '../../sizeScan/projectSizeScanner';
import type { MetricsPanelSessionState } from '../state/metricsPanelSessionState';
import type { MetricsPanelView } from '../view/metricsPanelView';

/**
 * Wires events and subscriptions for an open metrics panel.
 * Single responsibility: panel-lifetime subscriptions + message forwarding.
 */
export class MetricsPanelController implements vscode.Disposable {
	private readonly panelDisposables = new DisposableStore();

	constructor(
		private readonly deps: {
			scanner: ProjectSizeScanner;
			view: MetricsPanelView;
			sessionState: MetricsPanelSessionState;
			commandHandlers: Record<MessageToExtension['command'], MetricsPanelCommandHandler>;
		}
	) {}

	reset(): void {
		// Panel-lifetime scans should stop when the panel closes to avoid unnecessary IO.
		this.deps.scanner.cancelCurrentScan();
		this.deps.sessionState.clearInternals();
		this.panelDisposables.clear();
	}

	attach(panel: vscode.WebviewPanel): void {
		this.panelDisposables.clear();

		// Scanner progress events can be frequent; keep handlers minimal.
		const scanEvents = new ScannerEventSubscription(this.deps.scanner, {
			onScanStart: (rootPath) => this.handleScanStart(rootPath),
			onProgress: (progress) => this.handleProgress(progress),
			onScanEnd: () => this.handleScanEnd(),
		});

		// Track the user's last active editor column so "openFile" doesn't steal focus from the webview.
		const activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
			this.deps.sessionState.updatePreferredEditorColumnFrom(editor);
		});

		// The dispatcher validates message shape; handlers are the only entry points into VS Code APIs.
		const webviewMessageListener = panel.webview.onDidReceiveMessage((message) =>
			void dispatchMetricsPanelWebviewMessage(message, this.deps.commandHandlers)
		);

		const disposeListener = panel.onDidDispose(() => this.reset());

		this.panelDisposables.add(
			vscode.Disposable.from(scanEvents, activeEditorListener, webviewMessageListener, disposeListener)
		);
	}

	private handleScanStart(rootPath: string): void {
		// If the scan root changes, invalidate scan internals from the previous root.
		this.deps.sessionState.invalidateInternalsIfRootChanged(rootPath);
		// UI updates for scan start/progress do not require full cached state.
		this.deps.view.postMessage(createScanStartMessage());
	}

	private handleProgress(progress: ProgressData): void {
		this.deps.view.postMessage(createProgressMessage(progress));
	}

	private handleScanEnd(): void {
		// If a panel-initiated size scan is in flight, it will send the authoritative "update" message.
		if (this.deps.sessionState.getTabState('size') === 'running') return;

		// For any other scan (e.g. root-change summary scan), ensure the webview doesn't get stuck in "Scanning…".
		this.deps.view.postMessage(
			createUpdateMessage({
				scanResult: this.deps.sessionState.getSizeScanResult(),
				isScanning: false,
			})
		);
	}

	dispose(): void {
		this.reset();
		this.panelDisposables.dispose();
	}
}
