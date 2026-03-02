import test from 'node:test';
import assert from 'node:assert/strict';

import { MetricsPanelSessionState } from '../../src/extension/vscode/metricsPanel/state/metricsPanelSessionState';

test('metricsPanelSessionState: begin run gates start policy and supports force restart', () => {
	const state = new MetricsPanelSessionState();

	assert.equal(state.getScanState('size'), 'never');
	assert.equal(state.beginRun('size'), true);
	assert.equal(state.getScanState('size'), 'running');

	assert.equal(state.beginRun('size'), false);

	state.completeRunSuccess('size');
	assert.equal(state.getScanState('size'), 'success');
	assert.equal(state.beginRun('size'), false);

	assert.equal(state.beginRun('size', true), true);
	assert.equal(state.getScanState('size'), 'running');
});

test('metricsPanelSessionState: cancel restore keeps previous success only when data exists', () => {
	const state = new MetricsPanelSessionState();

	assert.equal(state.beginRun('loc'), true);
	state.restoreAfterCancel('loc', false);
	assert.equal(state.getScanState('loc'), 'never');

	assert.equal(state.beginRun('loc'), true);
	state.completeRunSuccess('loc');
	assert.equal(state.getScanState('loc'), 'success');

	assert.equal(state.beginRun('loc', true), true);
	state.restoreAfterCancel('loc', true);
	assert.equal(state.getScanState('loc'), 'success');
});

test('metricsPanelSessionState: root change invalidates root-scoped tab state', () => {
	const state = new MetricsPanelSessionState();

	state.syncPanelRootPath('/tmp/termetrix-a');
	assert.equal(state.beginRun('size'), true);
	state.completeRunSuccess('size');
	assert.equal(state.getScanState('size'), 'success');

	state.syncPanelRootPath('/tmp/termetrix-b');
	assert.equal(state.getScanState('size'), 'never');
	assert.equal(state.getScanState('loc'), 'never');
});
