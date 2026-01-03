import { ExtendedScanResult } from '../../../types';

const MAX_CACHE_ENTRIES = 10;

/**
 * Manages an in-memory cache for scan results.
 */
export class ScanCache {
	private memoryCache: Map<string, ExtendedScanResult> = new Map();

	/**
	 * Returns the cached scan result for a root path (if any).
	 * @param rootPath - Root path key.
	 * @returns Cached scan result.
	 */
	get(rootPath: string): ExtendedScanResult | undefined {
		return this.memoryCache.get(rootPath);
	}

	/**
	 * Stores a scan result in the cache.
	 * Heavyweight internal fields are stripped to keep memory usage bounded.
	 * @param rootPath - Root path key.
	 * @param result - Scan result to cache.
	 * @returns void
	 */
	set(rootPath: string, result: ExtendedScanResult): void {
		// Remove internal, heavyweight fields before caching (only needed temporarily for deep scan)
		const {
			directorySizes: _directorySizes,
			directoryFileCounts: _directoryFileCounts,
			directoryMaxFileBytes: _directoryMaxFileBytes,
			topFilesByDirectory: _topFilesByDirectory,
			...slimResult
		} = result;

		// Simple LRU-ish behavior: refresh insertion order on updates.
		if (this.memoryCache.has(rootPath)) this.memoryCache.delete(rootPath);
		this.memoryCache.set(rootPath, slimResult);

		// Bound memory usage for long-lived VS Code sessions (e.g. frequent root switches in multi-root workspaces).
		while (this.memoryCache.size > MAX_CACHE_ENTRIES) {
			const oldestKey = this.memoryCache.keys().next().value as string | undefined;
			if (!oldestKey) break;
			this.memoryCache.delete(oldestKey);
		}
	}
}
