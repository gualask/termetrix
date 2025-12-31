/**
 * Count non-empty lines in file content.
 * Uses character code comparison for performance.
 */
export function countNonEmptyLines(content: string): number {
	let count = 0;
	let start = 0;
	const NEWLINE = 10;
	const SPACE = 32;
	const TAB = 9;
	const CR = 13;

	for (let i = 0; i <= content.length; i++) {
		const code = i < content.length ? content.charCodeAt(i) : NEWLINE;

		if (code === NEWLINE || i === content.length) {
			// Check if line has non-whitespace content
			for (let j = start; j < i; j++) {
				const c = content.charCodeAt(j);
				if (c !== SPACE && c !== TAB && c !== CR) {
					count++;
					break;
				}
			}
			start = i + 1;
		}
	}

	return count;
}

