import * as path from 'path';

export interface DeepScanDirectory {
	path: string;
	absolutePath: string;
	bytes: number;
}

/**
 * Compute deep scan with cumulative sizes from direct directory sizes.
 * Single responsibility: aggregate direct sizes up the directory tree.
 */
export function computeDeepScan(
	directorySizes: Record<string, number>,
	rootPath: string
): DeepScanDirectory[] {
	const cumulativeSizes = new Map<string, number>();

	// For each directory with files, propagate its size up to all ancestors
	for (const [dirPath, directSize] of Object.entries(directorySizes)) {
		// Add direct size to this directory
		const current = cumulativeSizes.get(dirPath) || 0;
		cumulativeSizes.set(dirPath, current + directSize);

		// Propagate up to all ancestors
		let currentPath = dirPath;
		while (true) {
			const parentPath = path.dirname(currentPath);
			if (
				parentPath === currentPath ||
				!parentPath.startsWith(rootPath) ||
				parentPath.length < rootPath.length
			) {
				break;
			}
			const parentCumulative = cumulativeSizes.get(parentPath) || 0;
			cumulativeSizes.set(parentPath, parentCumulative + directSize);
			currentPath = parentPath;
		}
	}

	// Build all directories from cumulative sizes
	const allDirectories: DeepScanDirectory[] = [];
	for (const [dirPath, bytes] of cumulativeSizes.entries()) {
		if (dirPath === rootPath) continue;
		const relativePath = path.relative(rootPath, dirPath);
		allDirectories.push({ path: relativePath, absolutePath: dirPath, bytes });
	}

	return allDirectories.sort((a, b) => b.bytes - a.bytes);
}

