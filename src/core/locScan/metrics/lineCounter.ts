import type { CommentDef } from '../locConfig';

const NEWLINE = 10;
const SPACE = 32;
const TAB = 9;
const CR = 13;
const BACKSLASH = 92;

/**
 * Count non-empty lines in file content.
 * Uses character code comparison for performance.
 * HOT PATH: called for many files during LOC scans; keep it branch-light and allocation-free.
 * @param content - File contents as a UTF-8 string.
 * @returns Number of non-empty (non-whitespace) lines.
 */
export function countNonEmptyLines(content: string): number {
	let count = 0;
	let start = 0;

	const hasNonWhitespace = (from: number, to: number): boolean => {
		for (let i = from; i < to; i++) {
			const c = content.charCodeAt(i);
			if (c !== SPACE && c !== TAB && c !== CR) return true;
		}
		return false;
	};

	for (let i = 0; i <= content.length; i++) {
		// Use a sentinel newline at EOF so the last line is handled uniformly.
		const code = i < content.length ? content.charCodeAt(i) : NEWLINE;

		if (code === NEWLINE || i === content.length) {
			if (hasNonWhitespace(start, i)) count++;
			start = i + 1;
		}
	}

	return count;
}

const STATE_CODE = 0;
const STATE_IN_SINGLE = 1;
const STATE_IN_MULTI = 2;
const STATE_IN_STRING = 3;

/**
 * Estimate code lines using the configured lexical comment and string delimiters.
 * Lines recognized as comment-only or whitespace are excluded. This is not a
 * language parser, so indentation-scoped or otherwise unconfigured constructs
 * may still count as code.
 * Inline comments (code followed by a comment) count as code lines.
 *
 * HOT PATH: single-pass O(n), zero allocations, no intermediate strings.
 * @param content - File contents as a UTF-8 string.
 * @param def - Comment syntax definition for the language.
 * @returns Number of lines with real code.
 */
export function countCodeLines(content: string, def: CommentDef): number {
	// Flat scalars for single-line openers (-1 = absent).
	// s_c1 === -1 means a 1-char opener (e.g. '#'); otherwise it's the second char of a 2-char opener.
	const s0c0 = def.single[0]?.[0] ?? -1;
	const s0c1 = def.single[0]?.[1] ?? -1;
	const s1c0 = def.single[1]?.[0] ?? -1;
	const s1c1 = def.single[1]?.[1] ?? -1;

	// Block comment config.
	const mOpener = def.multi?.opener ?? [];
	const mCloser = def.multi?.closer ?? [];
	const nestable = def.multi?.nestable ?? false;
	const mOpenerLen = mOpener.length;
	const mCloserLen = mCloser.length;

	const trackStrings = def.strings;
	const len = content.length;

	// Returns true if content[at..at+seq.length) matches seq.
	// Caller must pre-check seq[0] === content[at]; this checks only seq[1..].
	const matchesAt = (seq: readonly number[], at: number): boolean => {
		for (let j = 1; j < seq.length; j++) {
			if (at + j >= len || content.charCodeAt(at + j) !== seq[j]) return false;
		}
		return true;
	};

	// State machine variables.
	// `depth` tracks nesting level for nestable block comments (e.g. Rust's /* /* */ */).
	// `stringQuote` holds the opening quote char code (34 " / 39 ' / 96 `) while inside a string.
	let count = 0;
	let state = STATE_CODE;
	let lineHasCode = false;
	let depth = 0;
	let stringQuote = 0;
	let i = 0;

	// Single pass: the sentinel NEWLINE at i === len flushes the last line uniformly.
	while (i <= len) {
		const c = i < len ? content.charCodeAt(i) : NEWLINE;

		// ── Line boundary ────────────────────────────────────────────────────────
		// A NEWLINE always ends an IN_SINGLE comment and commits the current line.
		if (c === NEWLINE) {
			if (state === STATE_IN_SINGLE) state = STATE_CODE;
			if (lineHasCode) count++;
			lineHasCode = false;
			i++;
			continue;
		}

		// ── STATE_CODE: normal code, watching for comment/string openers ─────────
		if (state === STATE_CODE) {
			if (c === s0c0 && (s0c1 === -1 || (i + 1 < len && content.charCodeAt(i + 1) === s0c1))) {
				// Single-line comment opener 0 (e.g. '//' or '#')
				state = STATE_IN_SINGLE;
				i += s0c1 === -1 ? 1 : 2;
			} else if (c === s1c0 && (s1c1 === -1 || (i + 1 < len && content.charCodeAt(i + 1) === s1c1))) {
				// Single-line comment opener 1 (PHP has both '#' and '//')
				state = STATE_IN_SINGLE;
				i += s1c1 === -1 ? 1 : 2;
			} else if (mOpenerLen > 0 && c === mOpener[0] && matchesAt(mOpener, i)) {
				// Block comment opener (e.g. '/*' or '<!--')
				state = STATE_IN_MULTI;
				depth = nestable ? 1 : 0; // depth > 0 only needed for nestable languages
				i += mOpenerLen;
			} else if (trackStrings && (c === 34 || c === 39 || c === 96)) {
				// String literal opener (", ', `) — track to avoid false comment positives
				stringQuote = c;
				state = STATE_IN_STRING;
				lineHasCode = true;
				i++;
			} else {
				if (c !== SPACE && c !== TAB && c !== CR) lineHasCode = true;
				i++;
			}

			// ── STATE_IN_SINGLE: skip everything until the next newline ──────────────
		} else if (state === STATE_IN_SINGLE) {
			i++;

			// ── STATE_IN_MULTI: skip until closer; track depth if nestable ───────────
		} else if (state === STATE_IN_MULTI) {
			if (nestable && c === mOpener[0] && matchesAt(mOpener, i)) {
				depth++;
				i += mOpenerLen;
			} else if (c === mCloser[0] && matchesAt(mCloser, i)) {
				if (--depth <= 0) state = STATE_CODE;
				i += mCloserLen;
			} else {
				i++;
			}

			// ── STATE_IN_STRING: skip until matching closing quote, respecting escapes ─
		} else {
			if (c === BACKSLASH) {
				// Skip the escaped character, but never jump over a newline (it must
				// still commit the line) or past EOF (the sentinel must still fire).
				const next = i + 1 < len ? content.charCodeAt(i + 1) : NEWLINE;
				i += next === NEWLINE ? 1 : 2;
			} else if (c === stringQuote) {
				state = STATE_CODE;
				lineHasCode = true;
				i++;
			} else {
				if (c !== SPACE && c !== TAB && c !== CR) lineHasCode = true;
				i++;
			}
		}
	}

	return count;
}
