import type * as vscode from 'vscode';

/**
 * Counts selected lines for a single selection (inclusive on both ends for display purposes).
 */
export function countSelectedLines(selection: vscode.Selection): number {
	const { isEmpty, start, end } = selection;
	return isEmpty ? 0 : Math.abs(end.line - start.line) + 1;
}

/**
 * Returns the selected line count from the active editor (or 0 when no editor is active).
 */
export function getSelectedLineCount(editor: vscode.TextEditor | undefined): number {
	return editor ? countSelectedLines(editor.selection) : 0;
}

/**
 * Reduces multiple selections to a single number for the status bar (uses the primary selection).
 */
export function getSelectedLineCountFromSelections(selections: readonly vscode.Selection[]): number {
	const first = selections[0];
	return first ? countSelectedLines(first) : 0;
}
