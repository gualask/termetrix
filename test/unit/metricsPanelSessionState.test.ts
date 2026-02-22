import test from 'node:test';
import assert from 'node:assert/strict';

import { MetricsPanelSessionState } from '../../src/extension/vscode/metricsPanel/state/metricsPanelSessionState';

test('metricsPanelSessionState: begin run gates start policy and supports force restart', () => {
	const state = new MetricsPanelSessionState();

	assert.equal(state.getTabState('size'), 'never');
	assert.equal(state.beginTabRun('size'), true);
	assert.equal(state.getTabState('size'), 'running');

	assert.equal(state.beginTabRun('size'), false);

	state.completeTabRunSuccess('size');
	assert.equal(state.getTabState('size'), 'success');
	assert.equal(state.beginTabRun('size'), false);

	assert.equal(state.beginTabRun('size', true), true);
	assert.equal(state.getTabState('size'), 'running');
});

test('metricsPanelSessionState: cancel restore keeps previous success only when data exists', () => {
	const state = new MetricsPanelSessionState();

	assert.equal(state.beginTabRun('loc'), true);
	state.restoreTabAfterCancel('loc', false);
	assert.equal(state.getTabState('loc'), 'never');

	assert.equal(state.beginTabRun('loc'), true);
	state.completeTabRunSuccess('loc');
	assert.equal(state.hasSuccessfulTabRun('loc'), true);

	assert.equal(state.beginTabRun('loc', true), true);
	state.restoreTabAfterCancel('loc', true);
	assert.equal(state.getTabState('loc'), 'success');
});

test('metricsPanelSessionState: root change invalidates root-scoped tab state', () => {
	const state = new MetricsPanelSessionState();

	state.syncPanelRootPath('/tmp/termetrix-a');
	assert.equal(state.beginTabRun('size'), true);
	state.completeTabRunSuccess('size');
	assert.equal(state.getTabState('size'), 'success');

	state.syncPanelRootPath('/tmp/termetrix-b');
	assert.equal(state.getTabState('size'), 'never');
	assert.equal(state.getTabState('loc'), 'never');
});
