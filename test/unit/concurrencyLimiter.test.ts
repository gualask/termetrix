import assert from 'node:assert/strict';
import test from 'node:test';

import { createConcurrencyLimiter } from '../../src/core/shared/runtime/concurrencyLimiter';

function defer(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

test('createConcurrencyLimiter: never exceeds max concurrency and preserves completion', async () => {
	const runLimited = createConcurrencyLimiter(2);

	let active = 0;
	let maxActive = 0;

	const gates = Array.from({ length: 6 }, () => defer());
	const started: number[] = [];
	const finished: number[] = [];

	const tasks = gates.map((gate, i) =>
		runLimited(async () => {
			started.push(i);
			active++;
			maxActive = Math.max(maxActive, active);
			await gate.promise;
			active--;
			finished.push(i);
		}),
	);

	// Allow the microtasks to start the first batch.
	await Promise.resolve();
	assert.equal(maxActive, 2);
	assert.equal(started.length, 2);

	// Drain tasks in order; limiter should keep two active until near the end.
	for (const gate of gates) {
		gate.resolve();
		await Promise.resolve();
	}

	await Promise.all(tasks);
	assert.equal(maxActive, 2);
	assert.equal(finished.length, 6);
});

test('createConcurrencyLimiter: works after queue drains and refills', async () => {
	const runLimited = createConcurrencyLimiter(2);

	// Phase 1: no queue, should drain completely.
	await Promise.all([runLimited(async () => {}), runLimited(async () => {})]);

	// Phase 2: refill beyond concurrency; must not deadlock.
	const gates = Array.from({ length: 5 }, () => defer());
	const tasks = gates.map((gate) => runLimited(async () => gate.promise));

	// Ensure some tasks are started and waiting.
	await Promise.resolve();

	for (const gate of gates) gate.resolve();

	const timeout = new Promise<never>((_, reject) => {
		setTimeout(() => reject(new Error('timed out waiting for limiter to drain')), 2000);
	});
	await Promise.race([Promise.all(tasks).then(() => undefined), timeout]);
});
