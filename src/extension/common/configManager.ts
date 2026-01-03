import * as vscode from 'vscode';

export interface ScanConfig {
	maxDurationSeconds: number;
	maxDirectories: number;
	concurrentOperations: number;
	rootSwitchDebounceMs: number;
}

export interface AutoRefreshConfig {
	enabled: boolean;
	minutes: number;
}

/**
 * Centralized configuration manager
 * Single responsibility: reading and caching extension settings
 */
export class ConfigManager {
	private static instance: ConfigManager;

	private constructor() {}

	/**
	 * Returns the singleton ConfigManager instance.
	 * @returns ConfigManager singleton.
	 */
	static getInstance(): ConfigManager {
		// Singleton: extension services can import `configManager` without manual wiring.
		if (!ConfigManager.instance) {
			ConfigManager.instance = new ConfigManager();
		}
		return ConfigManager.instance;
	}

	/**
	 * Reads and returns scan-related configuration.
	 * @returns Scan configuration.
	 */
	getScanConfig(): ScanConfig {
		// Read settings on demand so changes apply immediately without restarting the extension.
		const config = vscode.workspace.getConfiguration('termetrix.scan');
		return {
			maxDurationSeconds: config.get<number>('maxDurationSeconds', 10),
			maxDirectories: config.get<number>('maxDirectories', 50000),
			concurrentOperations: config.get<number>('concurrentOperations', 64),
			rootSwitchDebounceMs: config.get<number>('rootSwitchDebounceMs', 200),
			};
	}

	/**
	 * Reads and returns auto-refresh configuration.
	 * @returns Auto-refresh configuration.
	 */
	getAutoRefreshConfig(): AutoRefreshConfig {
		const config = vscode.workspace.getConfiguration('termetrix.autoRefresh');
		return {
			enabled: config.get<boolean>('enabled', false),
			minutes: config.get<number>('minutes', 10),
		};
	}

	/**
	 * Watch for configuration changes
	 * @param callback - Callback invoked when Termetrix configuration changes.
	 * @returns Disposable subscription.
	 */
	onConfigChange(callback: () => void): vscode.Disposable {
		return vscode.workspace.onDidChangeConfiguration((e) => {
			// Filter to our namespace to avoid work on unrelated settings changes.
			if (e.affectsConfiguration('termetrix')) {
				callback();
			}
		});
	}
}

// Export singleton for convenience
export const configManager = ConfigManager.getInstance();
