/**
 * Comment syntax definition for a language.
 * Used by `countCodeLines` to exclude comment-only lines from the LOC count.
 */
export interface CommentDef {
	/** Single-line openers as char code sequences. E.g. [[47,47]] for '//', [[35]] for '#'. */
	single: ReadonlyArray<readonly [number] | readonly [number, number]>;
	/** Block comment opener/closer, or null if the language has no block comments. */
	multi: { opener: readonly number[]; closer: readonly number[]; nestable: boolean } | null;
	/**
	 * If true, track string literals to avoid false positives
	 * (e.g. `"// not a comment"` should not be treated as a comment).
	 */
	strings: boolean;
}

export interface LanguageDef {
	name: string;
	/** Comment syntax definition. If absent, falls back to countNonEmptyLines. */
	comments?: CommentDef;
}

// Char code constants
const SLASH = 47;
const STAR = 42;
const HASH = 35;
const DASH = 45;
const LT = 60;
const BANG = 33;
const GT = 62;

/** C-style comments: '//' and block comments (non-nestable). Used by TS, JS, Go, Java, C, C++, C#, SCSS, Less. */
const C_STYLE: CommentDef = {
	single: [[SLASH, SLASH]],
	multi: { opener: [SLASH, STAR], closer: [STAR, SLASH], nestable: false },
	strings: true,
};

/** C-style comments with nestable block comments. Used by Rust, Kotlin, Scala, Swift. */
const C_STYLE_NESTABLE: CommentDef = {
	single: [[SLASH, SLASH]],
	multi: { opener: [SLASH, STAR], closer: [STAR, SLASH], nestable: true },
	strings: true,
};

/** Hash-only single-line comments. Used by Python, Ruby, Shell. */
const HASH_ONLY: CommentDef = {
	single: [[HASH]],
	multi: null,
	strings: false,
};

/**
 * Sass indented syntax: `//` single-line comments only. `#` introduces id
 * selectors/interpolation, never comments. `/*` comments are terminated by
 * indentation (no explicit closer required), so block tracking is disabled to
 * avoid swallowing the rest of the file when the closer never appears.
 */
const SASS_STYLE: CommentDef = {
	single: [[SLASH, SLASH]],
	multi: null,
	strings: false,
};

/** Hash and C-style single-line comments with C-style block comments. Used by PHP. */
const HASH_AND_C: CommentDef = {
	single: [[HASH], [SLASH, SLASH]],
	multi: { opener: [SLASH, STAR], closer: [STAR, SLASH], nestable: false },
	strings: true,
};

/** CSS block comments only (no single-line comments). */
const CSS_ONLY: CommentDef = {
	single: [],
	multi: { opener: [SLASH, STAR], closer: [STAR, SLASH], nestable: false },
	strings: false,
};

/** SQL: '--' single-line and block comments. */
const SQL_STYLE: CommentDef = {
	single: [[DASH, DASH]],
	multi: { opener: [SLASH, STAR], closer: [STAR, SLASH], nestable: false },
	strings: false,
};

/** HTML block comments only (angle-bracket style). */
const HTML_STYLE: CommentDef = {
	single: [],
	multi: { opener: [LT, BANG, DASH, DASH], closer: [DASH, DASH, GT], nestable: false },
	strings: false,
};

/**
 * Map file extensions to language definitions (name + comment syntax).
 */
export const LANGUAGE_MAP: Record<string, LanguageDef> = {
	'.ts': { name: 'TypeScript', comments: C_STYLE },
	'.tsx': { name: 'TypeScript', comments: C_STYLE },
	'.js': { name: 'JavaScript', comments: C_STYLE },
	'.jsx': { name: 'JavaScript', comments: C_STYLE },
	'.mjs': { name: 'JavaScript', comments: C_STYLE },
	'.cjs': { name: 'JavaScript', comments: C_STYLE },
	'.py': { name: 'Python', comments: HASH_ONLY },
	'.pyw': { name: 'Python', comments: HASH_ONLY },
	'.go': { name: 'Go', comments: C_STYLE },
	'.rs': { name: 'Rust', comments: C_STYLE_NESTABLE },
	'.java': { name: 'Java', comments: C_STYLE },
	'.kt': { name: 'Kotlin', comments: C_STYLE_NESTABLE },
	'.scala': { name: 'Scala', comments: C_STYLE_NESTABLE },
	'.c': { name: 'C', comments: C_STYLE },
	'.cpp': { name: 'C++', comments: C_STYLE },
	'.cc': { name: 'C++', comments: C_STYLE },
	'.h': { name: 'C/C++', comments: C_STYLE },
	'.hpp': { name: 'C++', comments: C_STYLE },
	'.cs': { name: 'C#', comments: C_STYLE },
	'.rb': { name: 'Ruby', comments: HASH_ONLY },
	'.php': { name: 'PHP', comments: HASH_AND_C },
	'.swift': { name: 'Swift', comments: C_STYLE_NESTABLE },
	'.vue': { name: 'Vue' },
	'.svelte': { name: 'Svelte' },
	'.css': { name: 'CSS', comments: CSS_ONLY },
	'.scss': { name: 'SCSS', comments: C_STYLE },
	'.sass': { name: 'Sass', comments: SASS_STYLE },
	'.less': { name: 'Less', comments: C_STYLE },
	'.html': { name: 'HTML', comments: HTML_STYLE },
	'.htm': { name: 'HTML', comments: HTML_STYLE },
	'.sql': { name: 'SQL', comments: SQL_STYLE },
	'.sh': { name: 'Shell', comments: HASH_ONLY },
	'.bash': { name: 'Shell', comments: HASH_ONLY },
};

/**
 * Source file extensions considered for LOC counting.
 * Derived from LANGUAGE_MAP to avoid drift between accepted extensions and language labels.
 */
export const SOURCE_EXTENSIONS = new Set(Object.keys(LANGUAGE_MAP));

export const DEFAULT_EXCLUDES = ['node_modules', '.git', 'dist', 'out', 'build', '.vscode', 'coverage'];
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
export const TOP_FILES_LIMIT = 10;

export const DEFAULT_LOC_CONCURRENCY = 4;
export const MAX_LOC_CONCURRENCY = 16;

/**
 * Number of files per directory read/counted in parallel.
 * Bounds peak memory: up to `LOC_FILE_BATCH_SIZE * MAX_FILE_SIZE_BYTES` bytes of
 * file content in flight per concurrent directory worker.
 */
export const LOC_FILE_BATCH_SIZE = 8;

// Notes:
// - `DEFAULT_EXCLUDES` is applied before `.gitignore` rules for a fast common-case skip.
// - `MAX_FILE_SIZE_BYTES` prevents reading very large files into memory during LOC scans.
