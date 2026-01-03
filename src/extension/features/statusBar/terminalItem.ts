import * as vscode from 'vscode';

/**
 * Terminal status bar item - icon-only, one-click terminal access
 */
export class TerminalStatusBarItem implements vscode.Disposable {
	private statusBarItem: vscode.StatusBarItem;

	/**
	 * Creates the terminal status bar item.
	 * @param getProjectRoot - Callback returning the preferred cwd (typically the active project root).
	 */
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
	 * Creates and shows an integrated terminal, optionally setting the working directory.
	 * @param cwd - Terminal working directory.
	 * @returns void
	 */
	private showTerminal(cwd?: string): void {
		// Prefer setting `cwd` so the user lands in the same context used by scans.
		const terminal = cwd
			? vscode.window.createTerminal({ cwd, name: 'Termetrix' })
			: vscode.window.createTerminal('Termetrix');
		terminal.show();
	}

	/**
	 * Open integrated terminal
	 * @returns void
	 */
	openTerminal(): void {
		// Prefer the current project root (same context used by the scanner).
		const projectRoot = this.getProjectRoot?.();

		if (projectRoot) return this.showTerminal(projectRoot);

		// Fallback: use the first opened folder (if any).
		const firstFolder = vscode.workspace.workspaceFolders?.[0];
		if (firstFolder) return this.showTerminal(firstFolder.uri.fsPath);

		// Final fallback: use VS Code defaults.
		this.showTerminal();
	}

	/**
	 * Disposes the status bar item.
	 * @returns void
	 */
	dispose(): void {
		this.statusBarItem.dispose();
	}
}
