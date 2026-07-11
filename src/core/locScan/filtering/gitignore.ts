import * as path from 'node:path';
import type { FsPort } from '../../ports/fsPort';

export interface GitIgnoreRule {
	negated: boolean;
	regex: RegExp;
	/**
	 * For directory-only rules (`dir/`): matcher applied to file paths.
	 * It only matches descendants of the directory, never a file whose own
	 * name matches the pattern (git semantics). Absent for regular rules.
	 */
	fileRegex?: RegExp;
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
			out += REGEX_SPECIAL_CHARS.test(c) ? `\\${c}` : c;
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
 *
 * When `dirPrefix` is provided (for nested `.gitignore` files), patterns are
 * scoped to that subdirectory: anchored patterns match only at the top of the
 * subdirectory; unanchored patterns match at any depth within it.
 * @param parsed - Parsed gitignore line (excluding negation).
 * @param dirPrefix - POSIX-relative path of the directory owning this rule (omit for root).
 * @returns Compiled RegExp.
 */
function compileRuleRegexes(
	parsed: Omit<ParsedGitIgnoreLine, 'negated'>,
	dirPrefix?: string,
): Pick<GitIgnoreRule, 'regex' | 'fileRegex'> {
	const patternRegex = globToRegex(parsed.pattern);

	let core: string;
	if (dirPrefix) {
		// Escape regex special chars in the prefix (e.g. dots in ".github").
		const escapedPrefix = dirPrefix.replace(REGEX_SPECIAL_CHARS_GLOBAL, '\\$&');
		if (parsed.anchored) {
			// /build in foo/.gitignore → matches foo/build only (top-level of that dir).
			core = `^${escapedPrefix}/${patternRegex}`;
		} else {
			// build in foo/.gitignore → matches foo/build and foo/any/depth/build.
			core = `^${escapedPrefix}/(|.*/)${patternRegex}`;
		}
	} else {
		// Root rules: non-anchored patterns can match at any depth.
		core = (parsed.anchored ? '^' : '(^|.*/)') + patternRegex;
	}

	if (!parsed.directoryOnly) return { regex: new RegExp(`${core}$`) };

	return {
		// Directory paths: match the directory itself or any descendant.
		regex: new RegExp(`${core}(/.*)?$`),
		// File paths: only descendants (a file named like the pattern is not ignored).
		fileRegex: new RegExp(`${core}/.*$`),
	};
}

/**
 * Parses all lines from a `.gitignore` file content into compiled rules.
 * @param content - Raw file content.
 * @param dirPrefix - POSIX-relative directory path to scope the rules (omit for root).
 * @returns List of compiled rules, in file order.
 */
function parseGitIgnoreContent(content: string, dirPrefix?: string): GitIgnoreRule[] {
	const rules: GitIgnoreRule[] = [];
	for (const rawLine of content.split(LINE_SPLIT_REGEX)) {
		const parsed = parseGitIgnoreLine(rawLine);
		if (!parsed) continue;
		rules.push({ negated: parsed.negated, ...compileRuleRegexes(parsed, dirPrefix) });
	}
	return rules;
}

/**
 * Loads `.gitignore` rules from the repo root (best-effort).
 * When no `.gitignore` exists, returns an empty rule set.
 * @param rootPath - Root directory path containing `.gitignore`.
 * @returns List of compiled rules, in file order.
 */
export async function loadGitIgnoreRules(rootPath: string, fs: FsPort): Promise<GitIgnoreRule[]> {
	const gitignorePath = path.join(rootPath, '.gitignore');
	try {
		const content = await fs.readFile(gitignorePath, 'utf8');
		return parseGitIgnoreContent(content);
	} catch {
		return [];
	}
}

/**
 * Loads `.gitignore` rules from a nested directory (best-effort).
 * Patterns are compiled relative to `relativeDir` so they match correctly
 * against root-relative paths used throughout the LOC engine.
 * @param dirPath - Absolute path of the directory containing `.gitignore`.
 * @param relativeDir - Path of that directory relative to the scan root (OS separators).
 * @returns List of compiled rules, in file order. Empty when no `.gitignore` exists.
 */
export async function loadNestedGitIgnoreRules(
	dirPath: string,
	relativeDir: string,
	fs: FsPort,
): Promise<GitIgnoreRule[]> {
	const gitignorePath = path.join(dirPath, '.gitignore');
	try {
		const content = await fs.readFile(gitignorePath, 'utf8');
		return parseGitIgnoreContent(content, toPosixPath(relativeDir));
	} catch {
		return [];
	}
}

/**
 * Returns true if `relativePath` should be ignored by the provided gitignore rules.
 *
 * Rules are applied in order; later matches override earlier ones (including negation).
 * @param relativePath - Path relative to the scan root.
 * @param rules - Compiled rules from `.gitignore`.
 * @param isDirectory - Whether `relativePath` refers to a directory. Directory-only
 * rules (`dir/`) never match a file whose own name matches the pattern.
 * @returns True when the path should be ignored.
 */
export function isGitIgnored(relativePath: string, rules: GitIgnoreRule[], isDirectory = true): boolean {
	if (rules.length === 0) return false;
	const posix = toPosixPath(relativePath);

	// Later rules override earlier ones, so the last matching rule decides:
	// iterate backwards and stop at the first match.
	for (let i = rules.length - 1; i >= 0; i--) {
		const rule = rules[i];
		const regex = isDirectory ? rule.regex : (rule.fileRegex ?? rule.regex);
		if (regex.test(posix)) return !rule.negated;
	}
	return false;
}
