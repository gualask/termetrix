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
 * Single responsibility: reading and caching extension configuration
 */
export class ConfigManager {
	private static instance: ConfigManager;

	private constructor() {}

	static getInstance(): ConfigManager {
		if (!ConfigManager.instance) {
			ConfigManager.instance = new ConfigManager();
		}
		return ConfigManager.instance;
	}

	getScanConfig(): ScanConfig {
		const config = vscode.workspace.getConfiguration('termetrix.scan');
		return {
			maxDurationSeconds: config.get<number>('maxDurationSeconds', 10),
			maxDirectories: config.get<number>('maxDirectories', 50000),
			concurrentOperations: config.get<number>('concurrentOperations', 64),
			rootSwitchDebounceMs: config.get<number>('rootSwitchDebounceMs', 200)
		};
	}

	getAutoRefreshConfig(): AutoRefreshConfig {
		const config = vscode.workspace.getConfiguration('termetrix.autoRefresh');
		return {
			enabled: config.get<boolean>('enabled', false),
			minutes: config.get<number>('minutes', 10)
		};
	}

	/**
	 * Watch for configuration changes
	 */
	onConfigChange(callback: () => void): vscode.Disposable {
		return vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('termetrix')) {
				callback();
			}
		});
	}
}

// Export singleton for convenience
export const configManager = ConfigManager.getInstance();
