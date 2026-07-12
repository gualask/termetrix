export interface LocTopFile {
	/**
	 * Root-relative path (never absolute) using `/` separators.
	 * This is a display + navigation path for the webview.
	 */
	path: string;
	lines: number;
	language: string;
}

export interface LOCResult {
	/** Approximate lines of code after configured best-effort comment filtering. */
	totalLines: number;
	/** Approximate lines of code by language. */
	byLanguage: Record<string, number>;
	/**
	 * Top files by line count.
	 * `path` is always root-relative (never absolute) and always uses `/` separators.
	 */
	topFiles: LocTopFile[];
	/** Number of files scanned */
	scannedFiles: number;
	/** Number of files skipped */
	skippedFiles: number;
}
