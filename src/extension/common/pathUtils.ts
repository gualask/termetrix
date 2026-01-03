import * as path from 'path';

/**
 * Ensures a path ends with the platform separator.
 * Used to avoid false positives like `/foo` matching `/foobar` when using prefix checks.
 */
function ensureTrailingSeparator(value: string): string {
	return value.endsWith(path.sep) ? value : value + path.sep;
}

/**
 * Returns true when `absolutePath` is equal to `rootPath` or located within it.
 * Both inputs are resolved before comparison.
 */
export function isPathWithinRoot(absolutePath: string, rootPath: string): boolean {
	const resolvedRoot = path.resolve(rootPath);
	const resolvedPath = path.resolve(absolutePath);

	if (resolvedPath === resolvedRoot) return true;
	return resolvedPath.startsWith(ensureTrailingSeparator(resolvedRoot));
}

/**
 * Resolves a relative path against `rootPath` and returns the absolute path only if it stays within `rootPath`.
 */
export function resolvePathWithinRoot(rootPath: string, relativePath: string): string | undefined {
	const resolvedRoot = path.resolve(rootPath);
	const resolvedPath = path.resolve(resolvedRoot, relativePath);

	return isPathWithinRoot(resolvedPath, resolvedRoot) ? resolvedPath : undefined;
}

/**
 * Resolves `inputPath` to an absolute path and returns it only if it stays within `rootPath`.
 * Absolute inputs are validated as-is; relative inputs are resolved against the root.
 */
export function resolvePathIfWithinRoot(rootPath: string, inputPath: string): string | undefined {
	if (path.isAbsolute(inputPath)) {
		return isPathWithinRoot(inputPath, rootPath) ? path.resolve(inputPath) : undefined;
	}
	return resolvePathWithinRoot(rootPath, inputPath);
}
