import * as vscode from 'vscode';
import { DisposableStore } from '../../support/disposableStore';
import { SelectionLineTracker } from './state/selectionLineTracker';

/**
 * Status bar item showing selected line count for the active editor.
 */
export class SelectionLinesStatusBarItem implements vscode.Disposable {
	private readonly statusBarItem: vscode.StatusBarItem;
	private readonly selectionTracker = new SelectionLineTracker();
	private readonly disposables = new DisposableStore();
	private isEnabled = true;

	constructor() {
		// Editor-context item: keep it on the right, near other contextual actions.
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1001);
		this.statusBarItem.tooltip = 'Selected lines';

		this.selectionTracker.initializeFrom(vscode.window.activeTextEditor);
		const selectionListener = this.createSelectionListener();
		const activeEditorListener = this.createActiveEditorListener();

		this.disposables.add(
			vscode.Disposable.from(
				this.statusBarItem,
				selectionListener,
				activeEditorListener
			)
		);

		this.render();
	}

	private createSelectionListener(): vscode.Disposable {
		return vscode.window.onDidChangeTextEditorSelection((e) => {
			if (!this.selectionTracker.updateFromSelections(e.selections)) return;
			this.render();
		});
	}

	private createActiveEditorListener(): vscode.Disposable {
		return vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (!this.selectionTracker.updateFromEditor(editor)) return;
			this.render();
		});
	}

	setVisible(visible: boolean): void {
		if (this.isEnabled === visible) return;
		this.isEnabled = visible;
		this.render();
	}

	private render(): void {
		if (!this.isEnabled) {
			this.statusBarItem.hide();
			return;
		}

		const selectedLines = this.selectionTracker.getSelectedLines();
		if (selectedLines <= 0) {
			this.statusBarItem.hide();
			return;
		}

		this.statusBarItem.text = `$(list-selection) ${selectedLines}`;
		this.statusBarItem.tooltip = `Selected lines: ${selectedLines}`;
		this.statusBarItem.show();
	}

	dispose(): void {
		this.disposables.dispose();
	}
}
