import { ExtendedScanResult } from '../../types';

const MAX_CACHE_ENTRIES = 10;

/**
 * Manages in-memory cache for scan results
 */
export class ScanCache {
	private memoryCache: Map<string, ExtendedScanResult> = new Map();

	/**
	 * Get cached scan result for a root path
	 */
	get(rootPath: string): ExtendedScanResult | undefined {
		return this.memoryCache.get(rootPath);
	}

	/**
	 * Store scan result in memory cache (without directorySizes to save memory)
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

		while (this.memoryCache.size > MAX_CACHE_ENTRIES) {
			const oldestKey = this.memoryCache.keys().next().value as string | undefined;
			if (!oldestKey) break;
			this.memoryCache.delete(oldestKey);
		}
	}
}
