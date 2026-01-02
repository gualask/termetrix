import { ExtendedScanResult } from '../../types';

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
		this.memoryCache.set(rootPath, slimResult);
	}

	/**
	 * Clear memory cache for a specific root
	 */
	clear(rootPath: string): void {
		this.memoryCache.delete(rootPath);
	}

	/**
	 * Clear all memory cache
	 */
	clearAll(): void {
		this.memoryCache.clear();
	}
}
