import { ScanRoot } from '../../../../core/shared/pathing/scanRoot';
import type { DirectoryMetricsSnapshot } from '../../../../core/sizeScan/types';
import type { ExtendedScanResult, ScanResult } from '../../../types';
import { toPublicScanResult } from './scanResultSanitizer';

const MAX_CACHE_ENTRIES = 10;

interface ScanCacheEntry {
	result: ScanResult;
	directoryMetrics: DirectoryMetricsSnapshot;
}

/**
 * Manages an in-memory cache for scan results.
 */
export class ScanCache {
	private readonly memoryCache = new Map<string, ScanCacheEntry>();

	private getEntry(rootPath: string): ScanCacheEntry | undefined {
		const root = ScanRoot.fromPath(rootPath);
		if (!root) return undefined;
		return this.memoryCache.get(root.key);
	}

	/**
	 * Returns the cached scan result for a root path (if any).
	 * @param rootPath - Root path key.
	 * @returns Cached scan result.
	 */
	get(rootPath: string): ScanResult | undefined {
		return this.getEntry(rootPath)?.result;
	}

	/** Returns cached directory metrics for a root path, if available. */
	getDirectoryMetrics(rootPath: string): DirectoryMetricsSnapshot | undefined {
		return this.getEntry(rootPath)?.directoryMetrics;
	}

	/**
	 * Stores a scan result in the cache.
	 * Public and internal scan data share one bounded lifetime and eviction policy.
	 * @param rootPath - Root path key.
	 * @param result - Scan result to cache.
	 * @returns void
	 */
	set(rootPath: string, result: ExtendedScanResult): void {
		const root = ScanRoot.fromPath(rootPath);
		if (!root) return;
		const entry: ScanCacheEntry = {
			result: toPublicScanResult(result),
			directoryMetrics: result.directoryMetrics,
		};

		// Simple LRU-ish behavior: refresh insertion order on updates.
		if (this.memoryCache.has(root.key)) this.memoryCache.delete(root.key);
		this.memoryCache.set(root.key, entry);

		// Bound memory usage for long-lived VS Code sessions (e.g. frequent root switches in multi-root workspaces).
		while (this.memoryCache.size > MAX_CACHE_ENTRIES) {
			const oldestKey = this.memoryCache.keys().next().value as string | undefined;
			if (!oldestKey) break;
			this.memoryCache.delete(oldestKey);
		}
	}
}
