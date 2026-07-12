import type { LOCResult } from '../../../shared/contracts/loc';
import { ConcurrencyLimit } from '../../shared/numericValueObjects';
import { createLifoArrayQueueDriver, runConcurrentQueue } from '../../shared/runtime/workQueue';
import { type GitIgnoreRule, loadGitIgnoreRules } from '../filtering/gitignore';
import { LocPathFilter } from '../filtering/locPathFilter';
import { DEFAULT_LOC_CONCURRENCY, MAX_LOC_CONCURRENCY } from '../locConfig';
import type { LocScanRequest } from '../locScanRequest';
import { LocAccumulator } from '../metrics/locAccumulator';
import { type DirItem, scanDirectory } from './locDirectoryScanner';
import { LocTraversalContext } from './locTraversalContext';

/**
 * File-system LOC scan engine (no VS Code dependencies).
 * Single responsibility: traverse the filesystem and compute LOCResult.
 */
export async function scanLOC(params: LocScanRequest): Promise<LOCResult> {
	const { rootPath, fs, cancellationToken, maxConcurrency } = params;
	const pathFilter = params.pathFilter ?? new LocPathFilter();
	const accumulator = new LocAccumulator();
	const concurrency = ConcurrencyLimit.bounded(maxConcurrency, DEFAULT_LOC_CONCURRENCY, 1, MAX_LOC_CONCURRENCY).value;

	const rootRules = await loadGitIgnoreRules(rootPath, fs);
	const context = new LocTraversalContext({
		rootPath,
		accumulator,
		cancellationToken,
		pathFilter,
		fs,
	});
	await scanDirectoryTree(context, concurrency, rootRules);

	return accumulator.finalize();
}

/**
 * Drives the concurrent directory traversal, seeding the queue with the root directory.
 * @param context - Shared traversal state.
 * @param maxConcurrency - Maximum number of concurrent directory scans.
 * @param rootRules - Compiled rules from the root `.gitignore`.
 */
async function scanDirectoryTree(
	context: LocTraversalContext,
	maxConcurrency: number,
	rootRules: GitIgnoreRule[],
): Promise<void> {
	if (context.isCancelled()) return;
	const queue: DirItem[] = [{ dirPath: context.rootPath, rules: rootRules }];
	await runConcurrentQueue<DirItem>({
		driver: createLifoArrayQueueDriver({
			queue,
			shouldStop: () => context.isCancelled(),
			isStopScheduled: () => context.isCancelled(),
		}),
		maxConcurrency,
		runOne: async (item) => {
			const subdirectories = await scanDirectory(context, item.dirPath, item.rules);
			if (context.isCancelled()) return;
			for (const sub of subdirectories) queue.push(sub);
		},
	});
}
