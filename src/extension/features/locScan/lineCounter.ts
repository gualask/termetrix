/**
 * Count non-empty lines in file content.
 * Uses character code comparison for performance.
 * HOT PATH: called for many files during LOC scans; keep it branch-light and allocation-free.
 */
export function countNonEmptyLines(content: string): number {
	let count = 0;
	let start = 0;
	const NEWLINE = 10;
	const SPACE = 32;
	const TAB = 9;
	const CR = 13;

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
