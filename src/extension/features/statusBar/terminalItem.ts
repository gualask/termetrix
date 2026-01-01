import * as vscode from 'vscode';

/**
 * Terminal status bar item - icon-only, one-click terminal access
 */
export class TerminalStatusBarItem implements vscode.Disposable {
	private statusBarItem: vscode.StatusBarItem;

	constructor(private getProjectRoot?: () => string | undefined) {
		// Create status bar item (left-aligned)
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			1000 // High priority (appears on the left)
		);

		// Icon-only, no text
		this.statusBarItem.text = '$(terminal)';
		this.statusBarItem.tooltip = 'Open Terminal';
		this.statusBarItem.command = 'termetrix.openTerminal';

		// Show immediately
		this.statusBarItem.show();
	}

	/**
	 * Open integrated terminal
	 */
	openTerminal(): void {
		// Prefer the current project root (same context used by the scanner).
		const projectRoot = this.getProjectRoot?.();

		if (projectRoot) {
			const terminal = vscode.window.createTerminal({
				cwd: projectRoot,
				name: 'Termetrix'
			});
			terminal.show();
			return;
		}

		// Fallback: use first workspace folder if available.
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (workspaceFolder) {
			const terminal = vscode.window.createTerminal({
				cwd: workspaceFolder.uri.fsPath,
				name: 'Termetrix'
			});
			terminal.show();
			return;
		}

		// No project folder, just create a terminal
		const terminal = vscode.window.createTerminal('Termetrix');
		terminal.show();
	}

	dispose(): void {
		this.statusBarItem.dispose();
	}
}
