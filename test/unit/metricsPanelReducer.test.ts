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

test('metricsPanelReducer: requests deep scan only when scan result changes or breakdown missing', () => {
	const scanA = makeScanResult({ rootPath: '/repo', endTime: 1000 });
	const scanB = makeScanResult({ rootPath: '/repo', endTime: 2000 });

	// First update with a scan result should trigger deep scan.
	let state = metricsPanelReducer(initialMetricsPanelState, {
		type: 'message',
		message: { type: 'update', data: { isScanning: false, scanResult: scanA } },
	});
	assert.equal(state.isDeepScanning, true);
	assert.equal(state.breakdown, null);

	// Deep scan completes.
	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'deepScanResult', data: { rootPath: scanA.rootPath, parents: [] } },
	});
	assert.equal(state.isDeepScanning, false);
	assert.ok(state.breakdown);

	// Re-sending the same scan result should not clear the breakdown nor re-trigger deep scan.
	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'update', data: { isScanning: false, scanResult: { ...scanA } } },
	});
	assert.equal(state.isDeepScanning, false);
	assert.ok(state.breakdown);

	// A new scan result should clear stale breakdown and trigger deep scan.
	state = metricsPanelReducer(state, {
		type: 'message',
		message: { type: 'update', data: { isScanning: false, scanResult: scanB } },
	});
	assert.equal(state.isDeepScanning, true);
	assert.equal(state.breakdown, null);
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
	assert.equal(state.isDeepScanning, false);
	assert.equal(state.viewData.scanResult?.incomplete, false);
	assert.equal(state.viewData.scanResult?.incompleteReason, undefined);
	assert.ok(state.breakdown);
});

test('metricsPanelReducer: noRoot clears breakdown and stops deep scanning', () => {
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
	assert.equal(state.isDeepScanning, false);
});
