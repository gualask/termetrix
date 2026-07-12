import assert from 'node:assert/strict';
import test from 'node:test';

import type { ExtendedScanResult, LOCResult, MessageFromExtension, ScanResult } from '../../src/extension/types';
import { startLocScanForPanel } from '../../src/extension/vscode/metricsPanel/commands/handlers/loc';
import { startSizeScanForPanel } from '../../src/extension/vscode/metricsPanel/commands/handlers/size';
import type { MetricsPanelCommandDeps } from '../../src/extension/vscode/metricsPanel/commands/types';
import { MetricsPanelSessionState } from '../../src/extension/vscode/metricsPanel/state/metricsPanelSessionState';

const ROOT_A = '/workspace/project-a';
const ROOT_B = '/workspace/project-b';

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

function makeScanResult(rootPath: string): ScanResult {
	return {
		rootPath,
		totalBytes: 128,
		metadata: {
			startTime: 100,
			endTime: 150,
			duration: 50,
			directoriesScanned: 2,
		},
		incomplete: false,
		skippedCount: 0,
	};
}

function makeExtendedScanResult(rootPath: string): ExtendedScanResult {
	return {
		...makeScanResult(rootPath),
		directoryMetrics: {
			[rootPath]: {
				bytes: 128,
				fileCount: 1,
				maxFileBytes: 128,
				maxFileName: 'index.ts',
			},
		},
	};
}

function makeLocResult(): LOCResult {
	return {
		totalLines: 42,
		byLanguage: { TypeScript: 42 },
		topFiles: [{ path: 'src/index.ts', lines: 42, language: 'TypeScript' }],
		scannedFiles: 1,
		skippedFiles: 0,
	};
}

interface HarnessOptions {
	sizeScan?: (rootPath: string) => Promise<ExtendedScanResult | undefined>;
	locScan?: (rootPath: string) => Promise<LOCResult | undefined>;
	cachedSizeResult?: ScanResult;
}

function createHarness(options: HarnessOptions = {}) {
	let currentRoot: string | undefined = ROOT_A;
	let panelOpen = true;
	const messages: MessageFromExtension[] = [];
	const sizeScanRoots: string[] = [];
	const locScanRoots: string[] = [];
	const sessionState = new MetricsPanelSessionState();

	const scanner = {
		getCurrentRoot: () => currentRoot,
		getCachedResult: () => options.cachedSizeResult,
		scan: async (rootPath: string) => {
			sizeScanRoots.push(rootPath);
			return options.sizeScan?.(rootPath);
		},
		cancelCurrentScan: () => undefined,
	} as unknown as MetricsPanelCommandDeps['scanner'];

	const locScanner = {
		scan: async (rootPath: string) => {
			locScanRoots.push(rootPath);
			return options.locScan?.(rootPath);
		},
		cancelCurrentScan: () => undefined,
	} as unknown as MetricsPanelCommandDeps['locScanner'];

	const deps: MetricsPanelCommandDeps = {
		scanner,
		locScanner,
		sessionState,
		isPanelOpen: () => panelOpen,
		getPreferredEditorColumn: () => undefined,
		sendMessage: (message) => messages.push(message),
	};

	return {
		deps,
		locScanRoots,
		messages,
		sessionState,
		sizeScanRoots,
		setCurrentRoot: (rootPath: string | undefined) => {
			currentRoot = rootPath;
		},
		setPanelOpen: (open: boolean) => {
			panelOpen = open;
		},
	};
}

test('metrics panel orchestration: discards a size result when the workspace root changes mid-scan', async () => {
	const scan = createDeferred<ExtendedScanResult | undefined>();
	const harness = createHarness({ sizeScan: () => scan.promise });

	const run = startSizeScanForPanel(harness.deps);
	assert.deepEqual(harness.sizeScanRoots, [ROOT_A]);
	assert.equal(harness.sessionState.getScanState('size'), 'running');

	harness.setCurrentRoot(ROOT_B);
	scan.resolve(makeExtendedScanResult(ROOT_A));
	await run;

	assert.deepEqual(harness.messages, []);
	assert.equal(harness.sessionState.getScanState('size'), 'running');
});

test('metrics panel orchestration: ignores LOC completion after the panel closes', async () => {
	const scan = createDeferred<LOCResult | undefined>();
	const harness = createHarness({ locScan: () => scan.promise });

	const run = startLocScanForPanel(harness.deps);
	assert.deepEqual(harness.locScanRoots, [ROOT_A]);
	assert.deepEqual(
		harness.messages.map((message) => message.type),
		['locScanStart'],
	);

	harness.setPanelOpen(false);
	scan.resolve(makeLocResult());
	await run;

	assert.deepEqual(
		harness.messages.map((message) => message.type),
		['locScanStart'],
	);
	assert.equal(harness.sessionState.getScanState('loc'), 'running');
});

test('metrics panel orchestration: restores the cached size result after cancellation', async () => {
	const previous = makeScanResult(ROOT_A);
	const harness = createHarness({
		cachedSizeResult: previous,
		sizeScan: async () => undefined,
	});
	harness.sessionState.syncPanelRootPath(ROOT_A);
	assert.equal(harness.sessionState.beginRun('size'), true);
	harness.sessionState.completeRunSuccess('size');

	await startSizeScanForPanel(harness.deps, { force: true });

	assert.equal(harness.sessionState.getScanState('size'), 'success');
	assert.deepEqual(harness.messages, [
		{
			type: 'update',
			data: { scanResult: previous, isScanning: false },
		},
	]);
});

test('metrics panel orchestration: force restarts LOC after success and cancellation allows another run', async () => {
	const harness = createHarness({ locScan: async () => undefined });
	harness.sessionState.syncPanelRootPath(ROOT_A);
	assert.equal(harness.sessionState.beginRun('loc'), true);
	harness.sessionState.completeRunSuccess('loc');

	await startLocScanForPanel(harness.deps);
	assert.deepEqual(harness.locScanRoots, []);
	assert.deepEqual(harness.messages, []);

	await startLocScanForPanel(harness.deps, { force: true });

	assert.deepEqual(harness.locScanRoots, [ROOT_A]);
	assert.deepEqual(
		harness.messages.map((message) => message.type),
		['locScanStart', 'locScanCancelled'],
	);
	assert.equal(harness.sessionState.getScanState('loc'), 'never');
});
