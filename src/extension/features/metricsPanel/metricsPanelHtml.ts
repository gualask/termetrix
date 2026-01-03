import * as vscode from 'vscode';

/**
 * Single responsibility: generate the webview HTML shell for the metrics panel.
 * @param webview - Webview instance used to generate webview-safe URIs.
 * @param webviewUri - Base URI where the built webview assets are located.
 * @returns HTML markup for the webview.
 */
export function getMetricsPanelHtml(webview: vscode.Webview, webviewUri: vscode.Uri): string {
	// Map extension-local resources into webview-safe URIs.
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewUri, 'webview.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewUri, 'webview.css'));

	// CSP is intentionally strict: only allow our bundled JS/CSS.
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; connect-src ${webview.cspSource};">
	<title>Termetrix Metrics</title>
	<link rel="stylesheet" href="${styleUri}">
</head>
<body>
	<script src="${scriptUri}"></script>
</body>
</html>`;
}
