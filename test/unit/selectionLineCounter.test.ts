import assert from 'node:assert/strict';
import test from 'node:test';

import {
	countSelectedLines,
	getSelectedLineCount,
	getSelectedLineCountFromSelections,
	type SelectionLike,
	type TextEditorLike,
} from '../../src/extension/vscode/statusBar/selectionLines/selectionLineCounter';

test('selectionLineCounter: countSelectedLines handles empty and non-empty selections', () => {
	const emptySelection: SelectionLike = { isEmpty: true, start: { line: 3 }, end: { line: 3 } };
	const forwardSelection: SelectionLike = { isEmpty: false, start: { line: 2 }, end: { line: 5 } };
	const reverseSelection: SelectionLike = { isEmpty: false, start: { line: 9 }, end: { line: 4 } };

	assert.equal(countSelectedLines(emptySelection), 0);
	assert.equal(countSelectedLines(forwardSelection), 4);
	assert.equal(countSelectedLines(reverseSelection), 6);
});

test('selectionLineCounter: getSelectedLineCount returns zero without active editor', () => {
	assert.equal(getSelectedLineCount(undefined), 0);
});

test('selectionLineCounter: getSelectedLineCount uses active editor selection', () => {
	const editor: TextEditorLike = {
		selection: { isEmpty: false, start: { line: 10 }, end: { line: 12 } },
	};

	assert.equal(getSelectedLineCount(editor), 3);
});

test('selectionLineCounter: getSelectedLineCountFromSelections uses primary selection', () => {
	const selections: SelectionLike[] = [
		{ isEmpty: false, start: { line: 1 }, end: { line: 2 } },
		{ isEmpty: false, start: { line: 10 }, end: { line: 20 } },
	];

	assert.equal(getSelectedLineCountFromSelections(selections), 2);
	assert.equal(getSelectedLineCountFromSelections([]), 0);
});
