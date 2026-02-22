/**
 * Extension host constants.
 */

export const COMMAND_IDS = {
	// Historical command id (kept for user keybindings + backward compatibility).
	openMetricsPanel: 'termetrix.openScanPanel',
	refreshScan: 'termetrix.refreshScan',
	cancelScan: 'termetrix.cancelScan',
	openTerminal: 'termetrix.openTerminal',
} as const;

export const OUTPUT_CHANNEL_NAME = 'Termetrix' as const;

export const METRICS_PANEL_VIEW_TYPE = 'termetrixMetricsPanel' as const;
export const METRICS_PANEL_TITLE = 'Termetrix Metrics' as const;

export const VSCODE_COMMAND_IDS = {
	revealInExplorer: 'revealInExplorer',
	focusTerminal: 'workbench.action.terminal.focus',
} as const;

export const CONFIG_SECTION_IDS = {
	root: 'termetrix',
	scan: 'termetrix.scan',
	autoRefresh: 'termetrix.autoRefresh',
	statusBar: 'termetrix.statusBar',
	logging: 'termetrix.logging',
} as const;

/**
 * Setting keys (suffixes) used under the configuration sections above.
 * Keep these centralized to avoid drift with `package.json` contributes.configuration.properties.
 */
export const CONFIG_KEYS = {
	scan: {
		autoScanMode: 'autoScanMode',
		maxDurationSeconds: 'maxDurationSeconds',
		maxDirectories: 'maxDirectories',
		concurrentOperations: 'concurrentOperations',
		rootSwitchDebounceMs: 'rootSwitchDebounceMs',
	},
	autoRefresh: {
		enabled: 'enabled',
		minutes: 'minutes',
	},
	statusBar: {
		showTerminalButton: 'showTerminalButton',
		showSelectionLineCount: 'showSelectionLineCount',
	},
	logging: {
		verbose: 'verbose',
	},
} as const;

/**
 * LOC scans intentionally run with lower concurrency than size scans.
 * This divisor defines how LOC concurrency is derived from `scan.concurrentOperations`.
 */
export const LOC_CONCURRENCY_DIVISOR = 4;

/**
 * Throttle interval for progress events (in milliseconds).
 * Progress updates are sent to the UI at most once per this interval to avoid overwhelming the webview.
 */
export const PROGRESS_THROTTLE_MS = 500;

/**
 * Shared user-facing label used while a scan is in progress.
 */
export const SCANNING_PROJECT_LABEL = 'Scanning project...';
