import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CONFIG_KEYS, CONFIG_SECTION_IDS } from '../../src/extension/support/constants';
import { TERMETRIX_SETTINGS_DEFAULTS } from '../../src/shared/contracts/settingsDefaults';
import { SIZE_SCAN_DEFAULTS } from '../../src/shared/contracts/sizeScanDefaults';

type PackageJson = {
	contributes?: {
		configuration?: {
			properties?: Record<string, { default?: unknown }>;
		};
	};
};

function readPackageJson(): PackageJson {
	const raw = fs.readFileSync('package.json', 'utf8');
	return JSON.parse(raw) as PackageJson;
}

function getDefault(props: Record<string, { default?: unknown }>, fullKey: string): unknown {
	const entry = props[fullKey];
	assert.ok(entry, `Expected package.json to define contributes.configuration.properties['${fullKey}']`);
	return entry.default;
}

test('package.json scan defaults match SIZE_SCAN_DEFAULTS', () => {
	const pkg = readPackageJson();
	const props = pkg.contributes?.configuration?.properties;
	assert.ok(props, 'Expected package.json contributes.configuration.properties');

	const maxDurationDefault = getDefault(props, 'termetrix.scan.maxDurationSeconds');
	const maxDirectoriesDefault = getDefault(props, 'termetrix.scan.maxDirectories');

	assert.equal(maxDurationDefault, SIZE_SCAN_DEFAULTS.maxDurationSeconds);
	assert.equal(maxDirectoriesDefault, SIZE_SCAN_DEFAULTS.maxDirectories);
});

test('package.json settings defaults match TERMETRIX_SETTINGS_DEFAULTS', () => {
	const pkg = readPackageJson();
	const props = pkg.contributes?.configuration?.properties;
	assert.ok(props, 'Expected package.json contributes.configuration.properties');

	const scan = CONFIG_SECTION_IDS.scan;
	assert.equal(
		getDefault(props, `${scan}.${CONFIG_KEYS.scan.autoScanMode}`),
		TERMETRIX_SETTINGS_DEFAULTS.scan.autoScanMode,
	);
	assert.equal(
		getDefault(props, `${scan}.${CONFIG_KEYS.scan.maxDurationSeconds}`),
		TERMETRIX_SETTINGS_DEFAULTS.scan.maxDurationSeconds,
	);
	assert.equal(
		getDefault(props, `${scan}.${CONFIG_KEYS.scan.maxDirectories}`),
		TERMETRIX_SETTINGS_DEFAULTS.scan.maxDirectories,
	);
	const autoRefresh = CONFIG_SECTION_IDS.autoRefresh;
	assert.equal(
		getDefault(props, `${autoRefresh}.${CONFIG_KEYS.autoRefresh.enabled}`),
		TERMETRIX_SETTINGS_DEFAULTS.autoRefresh.enabled,
	);
	assert.equal(
		getDefault(props, `${autoRefresh}.${CONFIG_KEYS.autoRefresh.minutes}`),
		TERMETRIX_SETTINGS_DEFAULTS.autoRefresh.minutes,
	);

	const statusBar = CONFIG_SECTION_IDS.statusBar;
	assert.equal(
		getDefault(props, `${statusBar}.${CONFIG_KEYS.statusBar.showTerminalButton}`),
		TERMETRIX_SETTINGS_DEFAULTS.statusBar.showTerminalButton,
	);
	assert.equal(
		getDefault(props, `${statusBar}.${CONFIG_KEYS.statusBar.showSelectionLineCount}`),
		TERMETRIX_SETTINGS_DEFAULTS.statusBar.showSelectionLineCount,
	);

	const logging = CONFIG_SECTION_IDS.logging;
	assert.equal(
		getDefault(props, `${logging}.${CONFIG_KEYS.logging.verbose}`),
		TERMETRIX_SETTINGS_DEFAULTS.logging.verbose,
	);
});
