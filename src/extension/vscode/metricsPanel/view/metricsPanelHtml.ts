import * as vscode from 'vscode';
import { METRICS_PANEL_TITLE } from '../../../support/constants';

function getNonce(): string {
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let value = '';
	for (let i = 0; i < 32; i++) value += possible.charAt(Math.floor(Math.random() * possible.length));
	return value;
}

/**
 * Single responsibility: generate the webview HTML shell for the metrics panel.
 * Lives under `extension/vscode` (host-side only).
 * @param webview - Webview instance used to generate webview-safe URIs.
 * @param webviewUri - Base URI where the built webview assets are located.
 * @returns HTML markup for the webview.
 */
export function getMetricsPanelHtml(webview: vscode.Webview, webviewUri: vscode.Uri): string {
	// Map extension-local resources into webview-safe URIs.
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewUri, 'webview.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewUri, 'webview.css'));
	const nonce = getNonce();

	// CSP is intentionally strict: only allow our bundled JS/CSS.
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; connect-src 'none';">
	<title>${METRICS_PANEL_TITLE}</title>
	<link rel="stylesheet" href="${styleUri}">
</head>
<body>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
