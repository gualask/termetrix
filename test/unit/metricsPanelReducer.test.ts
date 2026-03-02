import test from 'node:test';
import assert from 'node:assert/strict';

import { initialMetricsPanelState, metricsPanelReducer } from '../../src/ui/hooks/useMetricsPanelState';

function makeScanResult(params: { rootPath: string; endTime: number }) {
	const { rootPath, endTime } = params;
	return {
		rootPath,
		totalBytes: 123,
		metadata: {
			startTime: endTime - 50,
			endTime,
			duration: 50,
			directoriesScanned: 10,
		},
		incomplete: false,
		incompleteReason: undefined,
		skippedCount: 0,
	};
}

test('metricsPanelReducer: deepScanResult updates breakdown without affecting scan state', () => {
	const scanA = makeScanResult({ rootPath: '/repo', endTime: 1000 });

	let state = metricsPanelReducer(initialMetricsPanelState, {
		type: 'message',
		message: { type: 'update', data: { isScanning: false, scanResult: scanA } },
	});
	assert.equal(state.breakdown, null);

	// Backend sends deepScanResult immediately after update.
	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'deepScanResult', data: { rootPath: scanA.rootPath, parents: [] } },
	});
	assert.ok(state.breakdown);
	// Scan state is unaffected.
	assert.equal(state.viewData.isScanning, false);
	assert.equal(state.isCalculatingLOC, false);
});

test('metricsPanelReducer: update with new scan key clears breakdown; deepScanResult re-populates it', () => {
	const scanA = makeScanResult({ rootPath: '/repo', endTime: 1000 });
	const scanB = makeScanResult({ rootPath: '/repo', endTime: 2000 });

	// First scan + breakdown.
	let state = metricsPanelReducer(initialMetricsPanelState, {
		type: 'message',
		message: { type: 'update', data: { isScanning: false, scanResult: scanA } },
	});
	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'deepScanResult', data: { rootPath: scanA.rootPath, parents: [] } },
	});
	assert.ok(state.breakdown);

	// New scan result clears stale breakdown.
	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'update', data: { isScanning: false, scanResult: scanB } },
	});
	assert.equal(state.breakdown, null);

	// Backend re-sends breakdown for the new scan.
	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'deepScanResult', data: { rootPath: scanB.rootPath, parents: [] } },
	});
	assert.ok(state.breakdown);
});

test('metricsPanelReducer: cancel with no prior breakdown keeps breakdown null', () => {
	const scanA = makeScanResult({ rootPath: '/repo', endTime: 1000 });

	// Bootstrap: cached result shown (no breakdown yet).
	let state = metricsPanelReducer(initialMetricsPanelState, {
		type: 'message',
		message: { type: 'update', data: { isScanning: false, scanResult: scanA } },
	});

	// Scan starts (panel refresh in flight).
	state = metricsPanelReducer(state, { type: 'message', message: { type: 'scanStart' } });
	assert.equal(state.viewData.isScanning, true);

	// Cancel: backend sends same scan key back (no new result).
	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'update', data: { isScanning: false, scanResult: scanA } },
	});
	assert.ok(state.viewData.scanResult);  // workspace still shown
	assert.equal(state.breakdown, null);   // no breakdown (none was loaded before cancel)
});

test('metricsPanelReducer: cancel with existing breakdown keeps chart visible', () => {
	const scanA = makeScanResult({ rootPath: '/repo', endTime: 1000 });

	// Bootstrap + breakdown already loaded.
	let state = metricsPanelReducer(initialMetricsPanelState, {
		type: 'message',
		message: { type: 'update', data: { isScanning: false, scanResult: scanA } },
	});
	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'deepScanResult', data: { rootPath: scanA.rootPath, parents: [] } },
	});
	assert.ok(state.breakdown);

	// Refresh starts.
	state = metricsPanelReducer(state, { type: 'message', message: { type: 'scanStart' } });

	// Cancel: same scan key restored.
	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'update', data: { isScanning: false, scanResult: scanA } },
	});
	assert.ok(state.breakdown);  // chart stays visible
});

test('metricsPanelReducer: scanStart keeps existing breakdown visible', () => {
	const scanA = makeScanResult({ rootPath: '/repo', endTime: 1000 });

	let state = metricsPanelReducer(initialMetricsPanelState, {
		type: 'message',
		message: { type: 'update', data: { isScanning: false, scanResult: scanA } },
	});
	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'deepScanResult', data: { rootPath: scanA.rootPath, parents: [] } },
	});
	assert.ok(state.breakdown);

	// Simulate an incomplete flag before starting a new scan.
	state = metricsPanelReducer(state, {
		type: 'message',
		message: {
			type: 'update',
			data: { isScanning: false, scanResult: { ...scanA, incomplete: true, incompleteReason: 'time_limit' } },
		},
	});

	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'scanStart' },
	});

	assert.equal(state.viewData.isScanning, true);
	assert.equal(state.viewData.scanResult?.incomplete, false);
	assert.equal(state.viewData.scanResult?.incompleteReason, undefined);
	assert.ok(state.breakdown);
});

test('metricsPanelReducer: noRoot clears breakdown', () => {
	const scanA = makeScanResult({ rootPath: '/repo', endTime: 1000 });
	let state = metricsPanelReducer(initialMetricsPanelState, {
		type: 'message',
		message: { type: 'update', data: { isScanning: false, scanResult: scanA } },
	});
	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'deepScanResult', data: { rootPath: scanA.rootPath, parents: [] } },
	});
	assert.ok(state.breakdown);

	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'noRoot' },
	});
	assert.equal(state.breakdown, null);
	assert.equal(state.isCalculatingLOC, false);
});

test('metricsPanelReducer: locScanCancelled clears isCalculatingLOC and preserves existing locResult', () => {
	const locResult = { totalLines: 1000, scannedFiles: 50, skippedFiles: 2, byLanguage: {}, topFiles: [] };

	let state = metricsPanelReducer(initialMetricsPanelState, {
		type: 'message',
		message: { type: 'locResult', data: locResult },
	});
	assert.equal(state.isCalculatingLOC, false);
	assert.deepEqual(state.locResult, locResult);

	// Start a new scan.
	state = metricsPanelReducer(state, { type: 'message', message: { type: 'locScanStart' } });
	assert.equal(state.isCalculatingLOC, true);

	// Cancel arrives.
	state = metricsPanelReducer(state, { type: 'message', message: { type: 'locScanCancelled' } });
	assert.equal(state.isCalculatingLOC, false);
	assert.deepEqual(state.locResult, locResult); // previous result preserved
});

test('metricsPanelReducer: locScanCancelled when no prior result leaves locResult null', () => {
	let state = metricsPanelReducer(initialMetricsPanelState, {
		type: 'message',
		message: { type: 'locScanStart' },
	});
	assert.equal(state.isCalculatingLOC, true);

	state = metricsPanelReducer(state, { type: 'message', message: { type: 'locScanCancelled' } });
	assert.equal(state.isCalculatingLOC, false);
	assert.equal(state.locResult, null);
});

test('metricsPanelReducer: noRoot clears isCalculatingLOC', () => {
	let state = metricsPanelReducer(initialMetricsPanelState, {
		type: 'message',
		message: { type: 'locScanStart' },
	});
	assert.equal(state.isCalculatingLOC, true);

	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'noRoot' },
	});
	assert.equal(state.isCalculatingLOC, false);
});
