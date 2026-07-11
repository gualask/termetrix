import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveScanLimitsPolicy } from '../../src/core/sizeScan/engine/scanLimits.policy';

test('scan limits policy: normalizes invalid size-scan limits with safe defaults', () => {
	const limits = resolveScanLimitsPolicy({
		maxDurationSeconds: Number.NaN,
		maxDirectories: 0,
		fsConcurrency: Number.NaN,
	});

	assert.equal(limits.maxDurationMs.value, 10000);
	assert.equal(limits.maxDirectories.value, 1);
	assert.equal(limits.maxFsConcurrency.value, 32);
	assert.equal(limits.maxDirectoryConcurrency.value, 8);
	assert.equal(limits.statBatchSize.value, 256);
});
