export type SelectionLike = {
	isEmpty: boolean;
	start: { line: number };
	end: { line: number };
};

export type TextEditorLike = {
	selection: SelectionLike;
};

/**
 * Counts selected lines for a single selection (inclusive on both ends for display purposes).
 * Pure helper: no I/O, no mutable state.
 * @param selection - Selection-like object to count.
 * @returns Number of selected lines.
 */
export function countSelectedLines(selection: SelectionLike): number {
	const { isEmpty, start, end } = selection;
	return isEmpty ? 0 : Math.abs(end.line - start.line) + 1;
}

/**
 * Returns the selected line count from the active editor (or 0 when no editor is active).
 * @param editor - Active editor (if any).
 * @returns Number of selected lines.
 */
export function getSelectedLineCount(editor: TextEditorLike | undefined): number {
	return editor ? countSelectedLines(editor.selection) : 0;
}

/**
 * Reduces multiple selections to a single number for the status bar (uses the primary selection).
 * @param selections - Editor selections.
 * @returns Number of selected lines for the primary selection.
 */
export function getSelectedLineCountFromSelections(selections: readonly SelectionLike[]): number {
	const first = selections[0];
	return first ? countSelectedLines(first) : 0;
}
