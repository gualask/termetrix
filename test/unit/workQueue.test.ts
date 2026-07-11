import assert from 'node:assert/strict';
import test from 'node:test';

import { createLifoArrayQueueDriver, runConcurrentQueue } from '../../src/core/shared/runtime/workQueue';

function delay(ms: number): Promise<'timeout'> {
	return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
}

test('runConcurrentQueue: drains the queue and runs every item', async () => {
	const queue = [1, 2, 3, 4, 5];
	const ran: number[] = [];
	await runConcurrentQueue<number>({
		driver: createLifoArrayQueueDriver({
			queue,
			shouldStop: () => false,
			isStopScheduled: () => false,
		}),
		maxConcurrency: 2,
		runOne: async (item) => {
			ran.push(item);
		},
	});
	assert.equal(ran.length, 5);
	assert.equal(queue.length, 0);
});

test('runConcurrentQueue: resolves when shouldStop is true even if stop was never scheduled', async () => {
	// Driver contract allows shouldStop() to be true while isStopScheduled() is
	// false; the queue must still terminate instead of waiting forever.
	const queue = [1, 2, 3];
	const driver = {
		shouldStop: () => true,
		isStopScheduled: () => false,
		hasQueuedItems: () => queue.length > 0,
		popQueuedItem: () => queue.pop(),
		clearQueue: () => {
			queue.length = 0;
		},
	};

	const outcome = await Promise.race([
		runConcurrentQueue<number>({
			driver,
			maxConcurrency: 2,
			runOne: async () => {},
		}).then(() => 'done' as const),
		delay(200),
	]);
	assert.equal(outcome, 'done');
});

test('runConcurrentQueue: stop becoming true mid-run terminates after in-flight items settle', async () => {
	let stop = false;
	const queue = [1, 2, 3, 4];
	const ran: number[] = [];
	const driver = {
		shouldStop: () => stop,
		isStopScheduled: () => false,
		hasQueuedItems: () => queue.length > 0,
		popQueuedItem: () => queue.pop(),
		clearQueue: () => {
			queue.length = 0;
		},
	};

	const outcome = await Promise.race([
		runConcurrentQueue<number>({
			driver,
			maxConcurrency: 1,
			runOne: async (item) => {
				ran.push(item);
				if (ran.length === 2) stop = true;
			},
		}).then(() => 'done' as const),
		delay(200),
	]);
	assert.equal(outcome, 'done');
	assert.equal(ran.length, 2);
});
