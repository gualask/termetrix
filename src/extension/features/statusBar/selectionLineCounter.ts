import type * as vscode from 'vscode';

export function countSelectedLines(selection: vscode.Selection): number {
	if (selection.isEmpty) return 0;
	const start = selection.start.line;
	const end = selection.end.line;
	return Math.abs(end - start) + 1;
}

export function getSelectedLineCount(editor: vscode.TextEditor | undefined): number {
	if (!editor) return 0;
	return countSelectedLines(editor.selection);
}

export function getSelectedLineCountFromSelections(selections: readonly vscode.Selection[]): number {
	const first = selections[0];
	return first ? countSelectedLines(first) : 0;
}

