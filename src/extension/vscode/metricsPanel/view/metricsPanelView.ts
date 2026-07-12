import * as vscode from 'vscode';
import { METRICS_PANEL_TITLE, METRICS_PANEL_VIEW_TYPE } from '../../../support/constants';
import type { MessageFromExtension } from '../../../types';
import { getMetricsPanelHtml } from './metricsPanelHtml';

/**
 * Manages the VS Code webview panel instance for the metrics panel.
 * Single responsibility: create/reveal/dispose the panel and post messages to it.
 */
export class MetricsPanelView {
	private panel: vscode.WebviewPanel | undefined;

	constructor(private readonly extensionUri: vscode.Uri) {}

	/** Returns `true` when the webview panel is currently open. */
	isOpen(): boolean {
		return Boolean(this.panel);
	}

	/** Brings the panel into view without stealing focus from the active editor. */
	reveal(): void {
		this.panel?.reveal(vscode.ViewColumn.Beside);
	}

	/**
	 * Opens the panel if not already open, or returns the existing instance.
	 * @returns The open panel.
	 */
	ensureOpen(): vscode.WebviewPanel {
		if (this.panel) return this.panel;

		const webviewUri = vscode.Uri.joinPath(this.extensionUri, 'out', 'webview');

		const panel = vscode.window.createWebviewPanel(
			METRICS_PANEL_VIEW_TYPE,
			METRICS_PANEL_TITLE,
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				// Keep UI state when the panel is hidden; data is explicitly refreshed on scan end / user actions.
				retainContextWhenHidden: true,
				localResourceRoots: [webviewUri],
			},
		);

		panel.webview.html = getMetricsPanelHtml(panel.webview, webviewUri);

		this.panel = panel;
		panel.onDidDispose(() => {
			this.panel = undefined;
		});

		return panel;
	}

	/**
	 * Sends a message to the webview. No-op when the panel is not open.
	 * @param message - Message to post.
	 */
	postMessage(message: MessageFromExtension): void {
		const panel = this.panel;
		if (!panel) return;
		void panel.webview.postMessage(message);
	}

	/** Disposes the webview panel and releases internal references. */
	dispose(): void {
		const panel = this.panel;
		this.panel = undefined;
		panel?.dispose();
	}
}
