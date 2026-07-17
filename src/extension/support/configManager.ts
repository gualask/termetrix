import * as vscode from 'vscode';
import type { SizeScanConfig } from '../../core/sizeScan/engine/scanEngineTypes';
import type { AutoScanMode as SettingsAutoScanMode } from '../../shared/contracts/settingsDefaults';
import { TERMETRIX_SETTINGS_DEFAULTS } from '../../shared/contracts/settingsDefaults';
import { SIZE_SCAN_DEFAULTS } from '../../shared/contracts/sizeScanDefaults';
import { CONFIG_KEYS, CONFIG_SECTION_IDS } from './constants';

export type AutoScanMode = SettingsAutoScanMode;

export function shouldAutoScanOnStartup(mode: AutoScanMode): boolean {
	return mode === 'startup+rootChange';
}

export function shouldAutoScanOnRootChange(mode: AutoScanMode): boolean {
	return mode === 'startup+rootChange' || mode === 'rootChange';
}

function toAutoScanMode(value: unknown, fallback: AutoScanMode): AutoScanMode {
	if (value === 'startup+rootChange' || value === 'rootChange' || value === 'off') return value;
	return fallback;
}

interface ScanSettings {
	autoScanMode: AutoScanMode;
	maxDurationSeconds: number;
	maxDirectories: number;
}

interface AutoRefreshConfig {
	enabled: boolean;
	minutes: number;
}

interface StatusBarConfig {
	showTerminalButton: boolean;
	showSelectionLineCount: boolean;
}

interface PanelConfig {
	autoScanLoc: boolean;
}

/**
 * Centralized configuration manager
 * Single responsibility: reading and caching extension settings
 */
class ConfigManager {
	private static instance: ConfigManager;

	private constructor() {}

	private readSetting<T>(
		config: vscode.WorkspaceConfiguration,
		key: string,
		guard: (value: unknown) => value is T,
		fallback: T,
	): T {
		const value = config.get<unknown>(key);
		if (guard(value)) return value;

		const defaultValue = config.inspect<unknown>(key)?.defaultValue;
		if (guard(defaultValue)) return defaultValue;

		return fallback;
	}

	private readNumber(config: vscode.WorkspaceConfiguration, key: string, fallback: number): number {
		return this.readSetting(
			config,
			key,
			(value): value is number => typeof value === 'number' && Number.isFinite(value),
			fallback,
		);
	}

	private readBoolean(config: vscode.WorkspaceConfiguration, key: string, fallback: boolean): boolean {
		return this.readSetting(config, key, (value): value is boolean => typeof value === 'boolean', fallback);
	}

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
	 * Reads and returns scan-related settings (extension policy + engine knobs).
	 * @returns Extension scan settings.
	 */
	getScanSettings(): ScanSettings {
		// Read settings on demand so changes apply immediately without restarting the extension.
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION_IDS.scan);
		const defaultAutoScanMode = toAutoScanMode(
			config.inspect<unknown>(CONFIG_KEYS.scan.autoScanMode)?.defaultValue,
			TERMETRIX_SETTINGS_DEFAULTS.scan.autoScanMode,
		);
		return {
			autoScanMode: toAutoScanMode(config.get<unknown>(CONFIG_KEYS.scan.autoScanMode), defaultAutoScanMode),
			maxDurationSeconds: this.readNumber(
				config,
				CONFIG_KEYS.scan.maxDurationSeconds,
				TERMETRIX_SETTINGS_DEFAULTS.scan.maxDurationSeconds,
			),
			maxDirectories: this.readNumber(
				config,
				CONFIG_KEYS.scan.maxDirectories,
				TERMETRIX_SETTINGS_DEFAULTS.scan.maxDirectories,
			),
		};
	}

	/**
	 * Returns only the config fields used by the pure scan engines.
	 * Keeps the boundary explicit so core code is never coupled to extension-only policy settings.
	 */
	getCoreScanConfig(): SizeScanConfig {
		const settings = this.getScanSettings();
		return {
			maxDurationSeconds: settings.maxDurationSeconds,
			maxDirectories: settings.maxDirectories,
			fsConcurrency: SIZE_SCAN_DEFAULTS.fsConcurrency,
		};
	}

	/**
	 * Reads and returns auto-refresh configuration.
	 * @returns Auto-refresh configuration.
	 */
	getAutoRefreshConfig(): AutoRefreshConfig {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION_IDS.autoRefresh);
		return {
			enabled: this.readBoolean(
				config,
				CONFIG_KEYS.autoRefresh.enabled,
				TERMETRIX_SETTINGS_DEFAULTS.autoRefresh.enabled,
			),
			minutes: this.readNumber(
				config,
				CONFIG_KEYS.autoRefresh.minutes,
				TERMETRIX_SETTINGS_DEFAULTS.autoRefresh.minutes,
			),
		};
	}

	/**
	 * Reads and returns status bar-related configuration.
	 * @returns Status bar configuration.
	 */
	getStatusBarConfig(): StatusBarConfig {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION_IDS.statusBar);
		return {
			showTerminalButton: this.readBoolean(
				config,
				CONFIG_KEYS.statusBar.showTerminalButton,
				TERMETRIX_SETTINGS_DEFAULTS.statusBar.showTerminalButton,
			),
			showSelectionLineCount: this.readBoolean(
				config,
				CONFIG_KEYS.statusBar.showSelectionLineCount,
				TERMETRIX_SETTINGS_DEFAULTS.statusBar.showSelectionLineCount,
			),
		};
	}

	/**
	 * Reads and returns panel-related configuration.
	 * @returns Panel configuration.
	 */
	getPanelConfig(): PanelConfig {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION_IDS.panel);
		return {
			autoScanLoc: this.readBoolean(
				config,
				CONFIG_KEYS.panel.autoScanLoc,
				TERMETRIX_SETTINGS_DEFAULTS.panel.autoScanLoc,
			),
		};
	}

	/**
	 * Returns true when verbose logging is enabled.
	 * @returns True when verbose logging is enabled.
	 */
	isVerboseLoggingEnabled(): boolean {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION_IDS.logging);
		return this.readBoolean(config, CONFIG_KEYS.logging.verbose, TERMETRIX_SETTINGS_DEFAULTS.logging.verbose);
	}

	/**
	 * Watch for configuration changes.
	 * @param callback - Callback invoked when Termetrix configuration changes.
	 * @returns Disposable subscription.
	 */
	onConfigChange(callback: () => void): vscode.Disposable {
		return vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(CONFIG_SECTION_IDS.root)) {
				callback();
			}
		});
	}

	/**
	 * Applies config immediately and subscribes to future changes.
	 * Combines the common pattern of "apply now + watch for changes".
	 * @param applyConfig - Function to apply configuration.
	 * @returns Disposable subscription.
	 */
	subscribeAndApply(applyConfig: () => void): vscode.Disposable {
		applyConfig();
		return this.onConfigChange(applyConfig);
	}
}

// Singleton instance for convenience
export const configManager = ConfigManager.getInstance();
