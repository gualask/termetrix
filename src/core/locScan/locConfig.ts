/**
 * Map file extensions to human-readable language names
 */
export const LANGUAGE_MAP: Record<string, string> = {
	'.ts': 'TypeScript',
	'.tsx': 'TypeScript',
	'.js': 'JavaScript',
	'.jsx': 'JavaScript',
	'.mjs': 'JavaScript',
	'.cjs': 'JavaScript',
	'.py': 'Python',
	'.pyw': 'Python',
	'.go': 'Go',
	'.rs': 'Rust',
	'.java': 'Java',
	'.kt': 'Kotlin',
	'.scala': 'Scala',
	'.c': 'C',
	'.cpp': 'C++',
	'.cc': 'C++',
	'.h': 'C/C++',
	'.hpp': 'C++',
	'.cs': 'C#',
	'.rb': 'Ruby',
	'.php': 'PHP',
	'.swift': 'Swift',
	'.vue': 'Vue',
	'.svelte': 'Svelte',
	'.css': 'CSS',
	'.scss': 'SCSS',
	'.sass': 'Sass',
	'.less': 'Less',
	'.html': 'HTML',
	'.htm': 'HTML',
	'.sql': 'SQL',
	'.sh': 'Shell',
	'.bash': 'Shell',
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

// Notes:
// - `DEFAULT_EXCLUDES` is applied before `.gitignore` rules for a fast common-case skip.
// - `MAX_FILE_SIZE_BYTES` prevents reading very large files into memory during LOC scans.
