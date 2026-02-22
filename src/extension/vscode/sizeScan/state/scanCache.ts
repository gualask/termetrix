import type { ExtendedScanResult, ScanResult } from '../../../types';
import { ScanRoot } from '../../../../core/shared/pathing/scanRoot';
import { toPublicScanResult } from './scanResultSanitizer';

const MAX_CACHE_ENTRIES = 10;

/**
 * Manages an in-memory cache for scan results.
 */
export class ScanCache {
	private memoryCache: Map<string, ScanResult> = new Map();

	/**
	 * Returns the cached scan result for a root path (if any).
	 * @param rootPath - Root path key.
	 * @returns Cached scan result.
	 */
	get(rootPath: string): ScanResult | undefined {
		const root = ScanRoot.fromPath(rootPath);
		if (!root) return undefined;
		return this.memoryCache.get(root.key);
	}

	/**
	 * Stores a scan result in the cache.
	 * Heavyweight internal fields are stripped to keep memory usage bounded.
	 * @param rootPath - Root path key.
	 * @param result - Scan result to cache.
	 * @returns void
	 */
	set(rootPath: string, result: ExtendedScanResult): void {
		const root = ScanRoot.fromPath(rootPath);
		if (!root) return;
		const slimResult = toPublicScanResult(result);

		// Simple LRU-ish behavior: refresh insertion order on updates.
		if (this.memoryCache.has(root.key)) this.memoryCache.delete(root.key);
		this.memoryCache.set(root.key, slimResult);

		// Bound memory usage for long-lived VS Code sessions (e.g. frequent root switches in multi-root workspaces).
		while (this.memoryCache.size > MAX_CACHE_ENTRIES) {
			const oldestKey = this.memoryCache.keys().next().value as string | undefined;
			if (!oldestKey) break;
			this.memoryCache.delete(oldestKey);
		}
	}
}
