import * as fs from 'fs/promises';
import * as path from 'path';

export interface GitIgnoreRule {
	negated: boolean;
	regex: RegExp;
}

const BACKSLASH_REGEX = /\\/g;
const TRAILING_WHITESPACE_REGEX = /\s+$/;
const LINE_SPLIT_REGEX = /\r?\n/;
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/;
const REGEX_SPECIAL_CHARS_GLOBAL = /[.*+?^${}()|[\]\\]/g;

/**
 * Normalizes a path to POSIX separators for gitignore matching.
 * @param value - Path using platform separators.
 * @returns POSIX-normalized path.
 */
function toPosixPath(value: string): string {
	return value.replace(BACKSLASH_REGEX, '/');
}

/**
 * Advances the index over a run of consecutive `*` characters.
 * @param pattern - Glob pattern.
 * @param startIndex - Index of the first `*` in the run.
 * @returns Index of the last `*` in the run.
 */
function consumeDoubleStar(pattern: string, startIndex: number): number {
	let i = startIndex;
	while (pattern[i + 1] === '*') i++;
	return i;
}

/**
 * Converts a gitignore-style glob pattern into a regex fragment.
 *
 * Supported tokens:
 * - `*` matches within a single path segment (no `/`)
 * - `**` matches across path segments
 * - `?` matches a single character within a segment
 * - `\\` escapes the next character
 * @param pattern - Gitignore-style glob pattern.
 * @returns Regex fragment (without anchors) implementing the glob semantics.
 */
function globToRegex(pattern: string): string {
	let out = '';
	for (let i = 0; i < pattern.length; i++) {
		const c = pattern[i];

		// 1) Escape sequences: `\X` means "treat X literally" (even if it would be a glob token).
		if (c === '\\' && i + 1 < pattern.length) {
			const next = pattern[++i];
			out += next.replace(REGEX_SPECIAL_CHARS_GLOBAL, '\\$&');
			continue;
		}

		// 2) Single-char wildcard within a segment.
		if (c === '?') {
			out += '[^/]';
			continue;
		}

		// 3) Literal character (escape only if it would be special in regex).
		if (c !== '*') {
			out += REGEX_SPECIAL_CHARS.test(c) ? '\\' + c : c;
			continue;
		}

		// 4) `*` / `**` wildcards. Single `*` stays within one path segment; `**` can cross segments.
		if (pattern[i + 1] !== '*') {
			// Single star: match within a path segment.
			out += '[^/]*';
			continue;
		}

		// Collapse any run of `**...*` into a single `.*`.
		i = consumeDoubleStar(pattern, i);
		out += '.*';
	}
	return out;
}

type ParsedGitIgnoreLine = {
	negated: boolean;
	anchored: boolean;
	directoryOnly: boolean;
	pattern: string;
};

/**
 * Parses a single `.gitignore` line into a simplified rule representation.
 * Returns `null` for empty/comment lines.
 * @param rawLine - Raw line from `.gitignore`.
 * @returns Parsed rule fields, or null when the line should be ignored.
 */
function parseGitIgnoreLine(rawLine: string): ParsedGitIgnoreLine | null {
	// Best-effort gitignore parsing; correctness is "good enough" for LOC scanning filters.
	let line = rawLine.replace(TRAILING_WHITESPACE_REGEX, '');
	if (!line) return null;

	// Comments (unless escaped).
	if (line.startsWith('#')) return null;
	if (line.startsWith('\\#')) line = line.slice(1);
	if (line.startsWith('\\!')) line = line.slice(1);

	let negated = false;
	if (line.startsWith('!')) {
		negated = true;
		line = line.slice(1);
	}
	if (!line) return null;

	let directoryOnly = false;
	if (line.endsWith('/')) {
		directoryOnly = true;
		line = line.slice(0, -1);
	}

	const anchored = line.startsWith('/');
	if (anchored) line = line.slice(1);
	if (!line) return null;

	return { negated, anchored, directoryOnly, pattern: line };
}

/**
 * Compiles a parsed gitignore rule into a RegExp for matching POSIX paths.
 * @param parsed - Parsed gitignore line (excluding negation).
 * @returns Compiled RegExp.
 */
function compileRuleRegex(parsed: Omit<ParsedGitIgnoreLine, 'negated'>): RegExp {
	// Prefix semantics are intentionally simplified: non-anchored patterns can match at any depth.
	const prefix = parsed.anchored ? '^' : '(^|.*/)'; 
	const suffix = parsed.directoryOnly ? '(/.*)?$' : '$';
	return new RegExp(prefix + globToRegex(parsed.pattern) + suffix);
}

/**
 * Loads `.gitignore` rules from the repo root (best-effort).
 * When no `.gitignore` exists, returns an empty rule set.
 * @param rootPath - Root directory path containing `.gitignore`.
 * @returns List of compiled rules, in file order.
 */
export async function loadGitIgnoreRules(rootPath: string): Promise<GitIgnoreRule[]> {
	const gitignorePath = path.join(rootPath, '.gitignore');

	let content = '';
	try {
		// Best-effort: if there's no .gitignore, we just scan everything.
		content = await fs.readFile(gitignorePath, 'utf8');
	} catch {
		return [];
	}

	const rules: GitIgnoreRule[] = [];

	for (const rawLine of content.split(LINE_SPLIT_REGEX)) {
		const parsed = parseGitIgnoreLine(rawLine);
		if (!parsed) continue;
		rules.push({
			negated: parsed.negated,
			regex: compileRuleRegex(parsed),
		});
	}

	return rules;
}

/**
 * Returns true if `relativePath` should be ignored by the provided gitignore rules.
 *
 * Rules are applied in order; later matches override earlier ones (including negation).
 * @param relativePath - Path relative to the scan root.
 * @param rules - Compiled rules from `.gitignore`.
 * @returns True when the path should be ignored.
 */
export function isGitIgnored(relativePath: string, rules: GitIgnoreRule[]): boolean {
	if (rules.length === 0) return false;
	const posix = toPosixPath(relativePath);

	let ignored = false;
	for (const rule of rules) {
		if (rule.regex.test(posix)) {
			ignored = !rule.negated;
		}
	}
	return ignored;
}
