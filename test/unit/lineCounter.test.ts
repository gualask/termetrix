import assert from 'node:assert/strict';
import test from 'node:test';
import { type CommentDef, LANGUAGE_MAP } from '../../src/core/locScan/locConfig';
import { countCodeLines } from '../../src/core/locScan/metrics/lineCounter';

// ── Shared CommentDef fixtures ────────────────────────────────────────────────

const C_STYLE: CommentDef = {
	single: [[47, 47]],
	multi: { opener: [47, 42], closer: [42, 47], nestable: false },
	strings: true,
};

const C_STYLE_NESTABLE: CommentDef = {
	single: [[47, 47]],
	multi: { opener: [47, 42], closer: [42, 47], nestable: true },
	strings: true,
};

const HASH_ONLY: CommentDef = {
	single: [[35]],
	multi: null,
	strings: false,
};

const HASH_AND_C: CommentDef = {
	single: [[35], [47, 47]],
	multi: { opener: [47, 42], closer: [42, 47], nestable: false },
	strings: true,
};

const HTML_STYLE: CommentDef = {
	single: [],
	multi: { opener: [60, 33, 45, 45], closer: [45, 45, 62], nestable: false },
	strings: false,
};

// ── C_STYLE tests ─────────────────────────────────────────────────────────────

test('countCodeLines C_STYLE: comment-only line counts as 0', () => {
	assert.equal(countCodeLines('// this is a comment', C_STYLE), 0);
});

test('countCodeLines C_STYLE: code + inline comment counts as 1', () => {
	assert.equal(countCodeLines('const x = 1; // inline comment', C_STYLE), 1);
});

test('countCodeLines C_STYLE: empty line counts as 0', () => {
	assert.equal(countCodeLines('', C_STYLE), 0);
	assert.equal(countCodeLines('   ', C_STYLE), 0);
	assert.equal(countCodeLines('\t', C_STYLE), 0);
});

test('countCodeLines C_STYLE: block comment spanning multiple lines → 0 per line', () => {
	const input = '/*\n * middle\n */';
	assert.equal(countCodeLines(input, C_STYLE), 0);
});

test('countCodeLines C_STYLE: block comment on same line as code', () => {
	// Code before block comment → counts
	assert.equal(countCodeLines('int x = /* why */ 42;', C_STYLE), 1);
	// Block comment only → does not count
	assert.equal(countCodeLines('/* comment only */', C_STYLE), 0);
});

test('countCodeLines C_STYLE: string containing // is not treated as comment', () => {
	assert.equal(countCodeLines('"// not a comment"', C_STYLE), 1);
});

test('countCodeLines C_STYLE: string containing /* is not treated as block comment', () => {
	assert.equal(countCodeLines('const s = "/* not a comment */";', C_STYLE), 1);
});

test('countCodeLines C_STYLE: escaped quote does not close string', () => {
	// '\\"' inside a string — should not close the string prematurely
	assert.equal(countCodeLines('const s = "he said \\"hi\\""; // comment', C_STYLE), 1);
});

test('countCodeLines C_STYLE: escaped newline inside a string keeps both physical lines', () => {
	// Template literal with a line continuation: both physical lines contain code.
	const input = 'const s = `a\\\nb`;';
	assert.equal(countCodeLines(input, C_STYLE), 2);
});

test('countCodeLines C_STYLE: backslash as last character does not drop the final line', () => {
	// Unterminated string ending with a backslash at EOF.
	assert.equal(countCodeLines('const s = "abc\\', C_STYLE), 1);
});

test('countCodeLines C_STYLE: escaped backslash before newline is not a continuation', () => {
	// `\\` is a complete escape; the newline after it is a normal line boundary.
	const input = 'const s = `x\\\\\ny`;';
	assert.equal(countCodeLines(input, C_STYLE), 2);
});

test('countCodeLines C_STYLE: unterminated block comment at EOF → subsequent code lines = 0', () => {
	const input = 'code\n/* unterminated\nstill in comment';
	// "code" → 1, the rest is inside the block comment → 0
	assert.equal(countCodeLines(input, C_STYLE), 1);
});

test('countCodeLines C_STYLE: multiple code lines', () => {
	const input = 'const a = 1;\nconst b = 2;\nconst c = 3;';
	assert.equal(countCodeLines(input, C_STYLE), 3);
});

test('countCodeLines C_STYLE: mixed code and comment lines', () => {
	const input = [
		'// header comment',
		'import { foo } from "bar";',
		'',
		'// another comment',
		'export function main() {',
		'  // body comment',
		'  return 42;',
		'}',
	].join('\n');
	// Non-comment, non-empty code lines: import, export function, return, closing brace → 4
	assert.equal(countCodeLines(input, C_STYLE), 4);
});

// ── C_STYLE_NESTABLE (Rust-like) tests ───────────────────────────────────────

test('countCodeLines C_STYLE_NESTABLE: nested block comment → 0 for all lines', () => {
	// /* /* nested */ still open\n */
	const input = '/* /* nested */ still open\n*/';
	assert.equal(countCodeLines(input, C_STYLE_NESTABLE), 0);
});

test('countCodeLines C_STYLE_NESTABLE: non-nested block comment closes correctly', () => {
	const input = '/* comment */\ncode line';
	assert.equal(countCodeLines(input, C_STYLE_NESTABLE), 1);
});

test('countCodeLines C_STYLE_NESTABLE: code after nested comment', () => {
	const input = '/* /* inner */ outer */ let x = 1;';
	assert.equal(countCodeLines(input, C_STYLE_NESTABLE), 1);
});

// ── HASH_ONLY tests ───────────────────────────────────────────────────────────

test('countCodeLines HASH_ONLY: # comment-only line → 0', () => {
	assert.equal(countCodeLines('# this is a comment', HASH_ONLY), 0);
});

test('countCodeLines HASH_ONLY: code + inline # comment → 1', () => {
	assert.equal(countCodeLines('x = 1 # inline comment', HASH_ONLY), 1);
});

test('countCodeLines HASH_ONLY: multiple lines', () => {
	const input = '# header\nx = 1\ny = 2\n# footer';
	assert.equal(countCodeLines(input, HASH_ONLY), 2);
});

// ── Sass (indented syntax, real LANGUAGE_MAP config) ─────────────────────────

test('countCodeLines Sass: id selectors and interpolation are code, not comments', () => {
	const sass = LANGUAGE_MAP['.sass'].comments!;
	// `#` in Sass introduces id selectors / interpolation — never a comment.
	assert.equal(countCodeLines('#header\n  color: red', sass), 2);
	assert.equal(countCodeLines('.btn\n  background: #{$color}', sass), 2);
});

test('countCodeLines Sass: // silent comment lines are not code', () => {
	const sass = LANGUAGE_MAP['.sass'].comments!;
	assert.equal(countCodeLines('// silent comment', sass), 0);
	assert.equal(countCodeLines('#header // trailing comment\n  color: red', sass), 2);
});

// ── HTML_STYLE tests ──────────────────────────────────────────────────────────

test('countCodeLines HTML_STYLE: <!-- --> comment-only → 0', () => {
	assert.equal(countCodeLines('<!-- this is a comment -->', HTML_STYLE), 0);
});

test('countCodeLines HTML_STYLE: multi-line HTML comment → 0 per line', () => {
	const input = '<!--\n  comment body\n-->';
	assert.equal(countCodeLines(input, HTML_STYLE), 0);
});

test('countCodeLines HTML_STYLE: actual HTML tag is code', () => {
	assert.equal(countCodeLines('<div>hello</div>', HTML_STYLE), 1);
});

test('countCodeLines HTML_STYLE: HTML tag + inline comment', () => {
	const input = '<div> <!-- inline --> </div>';
	assert.equal(countCodeLines(input, HTML_STYLE), 1);
});

// ── HASH_AND_C (PHP-like) tests ───────────────────────────────────────────────

test('countCodeLines HASH_AND_C: # comment → 0', () => {
	assert.equal(countCodeLines('# php comment', HASH_AND_C), 0);
});

test('countCodeLines HASH_AND_C: // comment → 0', () => {
	assert.equal(countCodeLines('// php comment', HASH_AND_C), 0);
});

test('countCodeLines HASH_AND_C: code + # inline → 1', () => {
	assert.equal(countCodeLines('$x = 1; # inline', HASH_AND_C), 1);
});

test('countCodeLines HASH_AND_C: code + // inline → 1', () => {
	assert.equal(countCodeLines('$x = 1; // inline', HASH_AND_C), 1);
});

test('countCodeLines HASH_AND_C: block comment → 0', () => {
	assert.equal(countCodeLines('/* block */', HASH_AND_C), 0);
});
