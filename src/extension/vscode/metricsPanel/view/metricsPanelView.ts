import * as vscode from 'vscode';
import type { MessageFromExtension } from '../../../types';
import { METRICS_PANEL_TITLE, METRICS_PANEL_VIEW_TYPE } from '../../../support/constants';
import { getMetricsPanelHtml } from './metricsPanelHtml';

/**
 * Manages the VS Code webview panel instance for the metrics panel.
 * Single responsibility: create/reveal/dispose the panel and post messages to it.
 */
export class MetricsPanelView {
	private panel: vscode.WebviewPanel | undefined;

	constructor(private readonly extensionUri: vscode.Uri) {}

	isOpen(): boolean {
		return Boolean(this.panel);
	}

	reveal(): void {
		this.panel?.reveal(vscode.ViewColumn.Beside);
	}

	ensureOpen(): { panel: vscode.WebviewPanel; created: boolean } {
		if (this.panel) return { panel: this.panel, created: false };

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
			}
		);

		panel.webview.html = getMetricsPanelHtml(panel.webview, webviewUri);

		this.panel = panel;
		panel.onDidDispose(() => {
			this.panel = undefined;
		});

		return { panel, created: true };
	}

	postMessage(message: MessageFromExtension): void {
		const panel = this.panel;
		if (!panel) return;
		void panel.webview.postMessage(message);
	}

	dispose(): void {
		const panel = this.panel;
		this.panel = undefined;
		panel?.dispose();
	}
}
