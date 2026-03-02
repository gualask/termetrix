import { SIZE_SCAN_DEFAULTS } from './sizeScanDefaults';

export type AutoScanModeDefault = 'startup+rootChange' | 'rootChange' | 'off';
export type AutoScanMode = AutoScanModeDefault;

/**
 * Default values for user-facing settings as defined in `package.json`.
 * Keep these centralized to avoid drift between:
 * - `package.json` contributes.configuration.properties defaults
 * - `ConfigManager` fallbacks
 * - unit tests
 *
 * Note: these settings are extension-host concerns (not used by core scan engines).
 */
export const TERMETRIX_SETTINGS_DEFAULTS: {
	autoRefresh: { enabled: boolean; minutes: number };
	scan: {
		autoScanMode: AutoScanMode;
		maxDurationSeconds: number;
		maxDirectories: number;
		concurrentOperations: number;
		rootSwitchDebounceMs: number;
	};
	statusBar: { showTerminalButton: boolean; showSelectionLineCount: boolean };
	logging: { verbose: boolean };
	panel: { autoScanLoc: boolean };
} = {
	autoRefresh: {
		enabled: false,
		minutes: 10,
	},
	scan: {
		autoScanMode: 'startup+rootChange',
		maxDurationSeconds: SIZE_SCAN_DEFAULTS.maxDurationSeconds,
		maxDirectories: SIZE_SCAN_DEFAULTS.maxDirectories,
		concurrentOperations: SIZE_SCAN_DEFAULTS.fsConcurrency,
		rootSwitchDebounceMs: 200,
	},
	statusBar: {
		showTerminalButton: true,
		showSelectionLineCount: true,
	},
	logging: {
		verbose: false,
	},
	panel: {
		autoScanLoc: true,
	},
};
