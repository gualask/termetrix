import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveScanLimitsPolicy } from '../../src/core/sizeScan/engine/scanLimits.policy';

test('scan limits policy: normalizes invalid size-scan limits with safe defaults', () => {
	const limits = resolveScanLimitsPolicy({
		maxDurationSeconds: Number.NaN,
		maxDirectories: 0,
		fsConcurrency: Number.NaN,
	});

	assert.equal(limits.maxDurationMs, 10000);
	assert.equal(limits.maxDirectories, 1);
	assert.equal(limits.maxFsConcurrency, 32);
	assert.equal(limits.maxDirectoryConcurrency, 8);
	assert.equal(limits.statBatchSize, 256);
});
