import assert from 'node:assert/strict';
import test from 'node:test';

import {
	BoundedRatio,
	ConcurrencyLimit,
	DurationMs,
	NonNegativeInt,
	PositiveInt,
} from '../../src/core/shared/numericValueObjects';

test('numericValueObjects: BoundedRatio clamps and falls back deterministically', () => {
	assert.equal(BoundedRatio.from(2, 0.5).value, 1);
	assert.equal(BoundedRatio.from(-0.2, 0.5).value, 0);
	assert.equal(BoundedRatio.from(undefined, 0.5).value, 0.5);
	assert.equal(BoundedRatio.from(Number.NaN, 0.8).value, 0.8);
});

test('numericValueObjects: PositiveInt floors values and enforces min=1', () => {
	assert.equal(PositiveInt.from(3.9, 4).value, 3);
	assert.equal(PositiveInt.from(0, 4).value, 1);
	assert.equal(PositiveInt.from(Number.NaN, 4).value, 4);
});

test('numericValueObjects: NonNegativeInt floors values and enforces min=0', () => {
	assert.equal(NonNegativeInt.from(4.8, 7).value, 4);
	assert.equal(NonNegativeInt.from(-99, 7).value, 0);
	assert.equal(NonNegativeInt.from(Number.NaN, 7).value, 7);
});

test('numericValueObjects: DurationMs converts normalized seconds to milliseconds', () => {
	assert.equal(DurationMs.fromSeconds(2.9, 10).value, 2000);
	assert.equal(DurationMs.fromSeconds(0, 10).value, 1000);
	assert.equal(DurationMs.fromSeconds(Number.NaN, 10).value, 10000);
});

test('numericValueObjects: ConcurrencyLimit applies bounded fallback and clamp', () => {
	assert.equal(ConcurrencyLimit.bounded(undefined, 4, 1, 16).value, 4);
	assert.equal(ConcurrencyLimit.bounded(0, 4, 1, 16).value, 1);
	assert.equal(ConcurrencyLimit.bounded(128, 4, 1, 16).value, 16);
	assert.equal(ConcurrencyLimit.bounded(3.9, 4, 1, 16).value, 3);
});
