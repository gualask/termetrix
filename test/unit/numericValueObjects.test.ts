import assert from 'node:assert/strict';
import test from 'node:test';

import {
	secondsToDurationMs,
	toBoundedRatio,
	toConcurrencyLimit,
	toPositiveInt,
} from '../../src/core/shared/numericValueObjects';

test('numericValueObjects: toBoundedRatio clamps and falls back deterministically', () => {
	assert.equal(toBoundedRatio(2, 0.5), 1);
	assert.equal(toBoundedRatio(-0.2, 0.5), 0);
	assert.equal(toBoundedRatio(undefined, 0.5), 0.5);
	assert.equal(toBoundedRatio(Number.NaN, 0.8), 0.8);
});

test('numericValueObjects: toPositiveInt floors values and enforces min=1', () => {
	assert.equal(toPositiveInt(3.9, 4), 3);
	assert.equal(toPositiveInt(0, 4), 1);
	assert.equal(toPositiveInt(Number.NaN, 4), 4);
});

test('numericValueObjects: secondsToDurationMs converts normalized seconds to milliseconds', () => {
	assert.equal(secondsToDurationMs(2.9, 10), 2000);
	assert.equal(secondsToDurationMs(0, 10), 1000);
	assert.equal(secondsToDurationMs(Number.NaN, 10), 10000);
});

test('numericValueObjects: toConcurrencyLimit applies bounded fallback and clamp', () => {
	assert.equal(toConcurrencyLimit(undefined, 4, 1, 16), 4);
	assert.equal(toConcurrencyLimit(0, 4, 1, 16), 1);
	assert.equal(toConcurrencyLimit(128, 4, 1, 16), 16);
	assert.equal(toConcurrencyLimit(3.9, 4, 1, 16), 3);
});
