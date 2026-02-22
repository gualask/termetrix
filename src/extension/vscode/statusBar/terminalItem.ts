import * as vscode from 'vscode';
import { COMMAND_IDS, VSCODE_COMMAND_IDS } from '../../support/constants';

/**
 * Terminal status bar item - icon-only, one-click terminal access
 * Lives under `extension/vscode` (host-side only).
 */
export class TerminalStatusBarItem implements vscode.Disposable {
	private statusBarItem: vscode.StatusBarItem;

	/**
	 * Creates the terminal status bar item.
	 */
	constructor() {
		// Secondary/contextual action: keep it on the right per VS Code status bar conventions.
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			1000
		);

		// Icon-only, no text
		this.statusBarItem.text = '$(terminal)';
		this.statusBarItem.tooltip = 'Show Terminal';
		this.statusBarItem.command = COMMAND_IDS.openTerminal;

		// Default: keep current behavior (visible unless hidden via configuration).
		this.setVisible(true);
	}

	/**
	 * Shows or hides the status bar item.
	 * @param visible - Whether the item should be visible.
	 * @returns void
	 */
	setVisible(visible: boolean): void {
		if (visible) {
			this.statusBarItem.show();
			return;
		}
		this.statusBarItem.hide();
	}

	/**
	 * Show integrated terminal panel (same behavior as VS Code's terminal view command).
	 * @returns void
	 */
	openTerminal(): void {
		void vscode.commands.executeCommand(VSCODE_COMMAND_IDS.focusTerminal);
	}

	/**
	 * Disposes the status bar item.
	 * @returns void
	 */
	dispose(): void {
		this.statusBarItem.dispose();
	}
}
