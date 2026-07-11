import type { LocTopFile } from '../../../shared/contracts/loc';

/**
 * Creates a validated LOC top-file entry.
 * Returns undefined when input does not satisfy scan-domain invariants.
 */
export function createLocTopFile(params: {
	relativePath: string;
	lines: number;
	language: string;
}): LocTopFile | undefined {
	const { relativePath, lines, language } = params;
	if (!relativePath) return undefined;
	if (!Number.isFinite(lines) || lines <= 0) return undefined;
	if (!language) return undefined;

	// Contract: UI paths always use `/` separators.
	const path = relativePath.replace(/\\/g, '/');
	return { path, lines, language };
}
