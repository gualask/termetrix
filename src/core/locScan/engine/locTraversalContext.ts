import * as path from 'node:path';
import type { FsPort } from '../../ports/fsPort';
import type { CancellationToken } from '../../shared/runtime/cancellationToken';
import type { GitIgnoreRule } from '../filtering/gitignore';
import type { LocPathFilter } from '../filtering/locPathFilter';
import type { LocAccumulator } from '../metrics/locAccumulator';

export interface LocTraversalContextParams {
	rootPath: string;
	fs: FsPort;
	accumulator: LocAccumulator;
	pathFilter: LocPathFilter;
	cancellationToken?: CancellationToken;
}

/**
 * Mutable context shared across LOC traversal functions.
 * Co-locates traversal data and filtering/cancellation behavior.
 * Gitignore rules are passed per-call to shouldSkip so that nested
 * .gitignore files can be applied at the correct directory depth.
 */
export class LocTraversalContext {
	readonly rootPath: string;
	readonly fs: FsPort;
	readonly accumulator: LocAccumulator;
	readonly pathFilter: LocPathFilter;
	readonly cancellationToken?: CancellationToken;

	/** @throws {Error} When `rootPath` is empty. */
	constructor(params: LocTraversalContextParams) {
		if (!params.rootPath) throw new Error('rootPath is required');
		this.rootPath = path.resolve(params.rootPath);
		this.fs = params.fs;
		this.accumulator = params.accumulator;
		this.pathFilter = params.pathFilter;
		this.cancellationToken = params.cancellationToken;
	}

	/** Returns `true` when the active cancellation token has been triggered. */
	isCancelled(): boolean {
		return this.cancellationToken?.isCancellationRequested === true;
	}

	/**
	 * Returns `true` when `relativePath` should be excluded from the scan.
	 * Applies default directory exclusions first, then the provided gitignore rules.
	 * @param relativePath - Path relative to the scan root.
	 * @param rules - Effective gitignore rules for the current directory depth.
	 * @param isDirectory - Whether `relativePath` refers to a directory (affects `dir/` rules).
	 */
	shouldSkip(relativePath: string, rules: GitIgnoreRule[], isDirectory = true): boolean {
		return this.pathFilter.shouldSkip(relativePath, rules, isDirectory);
	}

	/** Increments the count of skipped (excluded or unreadable) entries. */
	incrementSkipped(): void {
		this.accumulator.incrementSkipped();
	}
}
