import * as path from 'path';

function ensureTrailingSeparator(value: string): string {
	return value.endsWith(path.sep) ? value : value + path.sep;
}

export function isPathWithinRoot(absolutePath: string, rootPath: string): boolean {
	const resolvedRoot = path.resolve(rootPath);
	const resolvedPath = path.resolve(absolutePath);

	if (resolvedPath === resolvedRoot) return true;
	return resolvedPath.startsWith(ensureTrailingSeparator(resolvedRoot));
}

export function resolvePathWithinRoot(rootPath: string, relativePath: string): string | undefined {
	const resolvedRoot = path.resolve(rootPath);
	const resolvedPath = path.resolve(resolvedRoot, relativePath);

	return isPathWithinRoot(resolvedPath, resolvedRoot) ? resolvedPath : undefined;
}

export function resolvePathIfWithinRoot(rootPath: string, inputPath: string): string | undefined {
	if (path.isAbsolute(inputPath)) {
		return isPathWithinRoot(inputPath, rootPath) ? path.resolve(inputPath) : undefined;
	}
	return resolvePathWithinRoot(rootPath, inputPath);
}
