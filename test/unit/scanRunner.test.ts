import assert from 'node:assert/strict';
import test from 'node:test';

import type * as vscode from 'vscode';
import { ScanRunner } from '../../src/extension/vscode/sizeScan/controller/scanRunner';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

test('scan runner: superseding a run cancels it without ending the active run', async () => {
	const runner = new ScanRunner<string>();
	const first = createDeferred<string>();
	const second = createDeferred<string>();
	const scanStates: boolean[] = [];
	let firstToken: vscode.CancellationToken | undefined;

	const firstRun = runner.run({
		task: (token) => {
			firstToken = token;
			return first.promise;
		},
		onScanState: (isRunning) => scanStates.push(isRunning),
	});
	const secondRun = runner.run({
		task: () => second.promise,
		onScanState: (isRunning) => scanStates.push(isRunning),
	});

	assert.equal(firstToken?.isCancellationRequested, true);
	first.resolve('stale');
	await firstRun;
	assert.equal(runner.isScanInProgress(), true);
	assert.deepEqual(scanStates, [true, true]);

	second.resolve('fresh');
	assert.equal(await secondRun, 'fresh');
	assert.equal(runner.isScanInProgress(), false);
	assert.deepEqual(scanStates, [true, true, false]);
});
