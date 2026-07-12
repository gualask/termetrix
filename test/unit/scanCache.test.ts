import assert from 'node:assert/strict';
import test from 'node:test';

import type { ExtendedScanResult } from '../../src/extension/types';
import { ScanCache } from '../../src/extension/vscode/sizeScan/state/scanCache';

function makeResult(rootPath: string, totalBytes: number): ExtendedScanResult {
	return {
		rootPath,
		totalBytes,
		metadata: {
			startTime: 100,
			endTime: 150,
			duration: 50,
			directoriesScanned: 1,
		},
		incomplete: false,
		skippedCount: 0,
		directoryMetrics: {
			[rootPath]: {
				bytes: totalBytes,
				fileCount: 1,
				maxFileBytes: totalBytes,
				maxFileName: 'index.ts',
			},
		},
	};
}

test('scan cache: stores public result and directory metrics in one entry', () => {
	const root = '/workspace/project';
	const result = makeResult(root, 128);
	const cache = new ScanCache();

	cache.set(root, result);

	assert.deepEqual(cache.get(root), {
		rootPath: root,
		totalBytes: 128,
		metadata: result.metadata,
		incomplete: false,
		skippedCount: 0,
	});
	assert.equal(cache.getDirectoryMetrics(root), result.directoryMetrics);
});

test('scan cache: evicts public result and directory metrics together', () => {
	const cache = new ScanCache();
	const roots = Array.from({ length: 11 }, (_, index) => `/workspace/project-${index}`);

	for (const [index, root] of roots.entries()) cache.set(root, makeResult(root, index + 1));

	assert.equal(cache.get(roots[0]), undefined);
	assert.equal(cache.getDirectoryMetrics(roots[0]), undefined);
	assert.equal(cache.get(roots[10])?.totalBytes, 11);
	assert.ok(cache.getDirectoryMetrics(roots[10]));
});
