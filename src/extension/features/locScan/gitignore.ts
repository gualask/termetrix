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

function toPosixPath(value: string): string {
	return value.replace(BACKSLASH_REGEX, '/');
}

function consumeDoubleStar(pattern: string, startIndex: number): number {
	let i = startIndex;
	while (pattern[i + 1] === '*') i++;
	return i;
}

function globToRegex(pattern: string): string {
	let out = '';
	for (let i = 0; i < pattern.length; i++) {
		const c = pattern[i];

		// Escape sequences
		if (c === '\\' && i + 1 < pattern.length) {
			const next = pattern[++i];
			out += next.replace(REGEX_SPECIAL_CHARS_GLOBAL, '\\$&');
			continue;
		}

		if (c === '*') {
			if (pattern[i + 1] !== '*') {
				out += '[^/]*';
				continue;
			}

			// Collapse any run of ** into a single .*
			i = consumeDoubleStar(pattern, i);
			out += '.*';
			continue;
		}

		if (c === '?') {
			out += '[^/]';
			continue;
		}

		// Escape regex special chars
		out += REGEX_SPECIAL_CHARS.test(c) ? '\\' + c : c;
	}
	return out;
}

export async function loadGitIgnoreRules(rootPath: string): Promise<GitIgnoreRule[]> {
	const gitignorePath = path.join(rootPath, '.gitignore');

	let content = '';
	try {
		content = await fs.readFile(gitignorePath, 'utf8');
	} catch {
		return [];
	}

	const rules: GitIgnoreRule[] = [];

	for (const rawLine of content.split(LINE_SPLIT_REGEX)) {
		let line = rawLine;

		// Strip trailing CR/whitespace (gitignore trims unescaped trailing spaces; keep it simple here)
		line = line.replace(TRAILING_WHITESPACE_REGEX, '');
		if (!line) continue;

		// Comments (unless escaped)
		if (line.startsWith('#')) continue;
		if (line.startsWith('\\#')) line = line.slice(1);
		if (line.startsWith('\\!')) line = line.slice(1);

		let negated = false;
		if (line.startsWith('!')) {
			negated = true;
			line = line.slice(1);
		}

		if (!line) continue;

		let directoryOnly = false;
		if (line.endsWith('/')) {
			directoryOnly = true;
			line = line.slice(0, -1);
		}

		const anchored = line.startsWith('/');
		if (anchored) {
			line = line.slice(1);
		}

		const hasSlash = line.includes('/');

		const prefix = anchored ? '^' : hasSlash ? '(^|.*/)' : '(^|.*/)'; // basename patterns still match in any directory
		const suffix = directoryOnly ? '(/.*)?$' : '$';

		const body = globToRegex(line);
		const regex = new RegExp(prefix + body + suffix);

		rules.push({ negated, regex });
	}

	return rules;
}

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
