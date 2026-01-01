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

	private showTerminal(cwd?: string): void {
		const terminal = cwd
			? vscode.window.createTerminal({ cwd, name: 'Termetrix' })
			: vscode.window.createTerminal('Termetrix');
		terminal.show();
	}

	/**
	 * Open integrated terminal
	 */
	openTerminal(): void {
		// Prefer the current project root (same context used by the scanner).
		const projectRoot = this.getProjectRoot?.();

		if (projectRoot) return this.showTerminal(projectRoot);

		// Fallback: use the first opened folder (if any).
		const firstFolder = vscode.workspace.workspaceFolders?.[0];
		if (firstFolder) return this.showTerminal(firstFolder.uri.fsPath);

		this.showTerminal();
	}

	dispose(): void {
		this.statusBarItem.dispose();
	}
}
