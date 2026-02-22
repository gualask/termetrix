import type * as vscode from 'vscode';
import { getSelectedLineCount, getSelectedLineCountFromSelections } from '../selectionLineCounter';

/**
 * Tracks selected line count across editor/selection changes.
 * Single responsibility: selection line count state.
 * Lives under `extension/vscode` (host-side only).
 */
export class SelectionLineTracker {
	private selectedLines = 0;

	initializeFrom(editor: vscode.TextEditor | undefined): void {
		this.selectedLines = getSelectedLineCount(editor);
	}

	getSelectedLines(): number {
		return this.selectedLines;
	}

	updateFromEditor(editor: vscode.TextEditor | undefined): boolean {
		const next = getSelectedLineCount(editor);
		if (next === this.selectedLines) return false;
		this.selectedLines = next;
		return true;
	}

	updateFromSelections(selections: readonly vscode.Selection[]): boolean {
		const next = getSelectedLineCountFromSelections(selections);
		if (next === this.selectedLines) return false;
		this.selectedLines = next;
		return true;
	}
}
