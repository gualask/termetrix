import * as vscode from 'vscode';
import { configManager } from '../../../common/configManager';

export interface AutoRefreshControllerOptions {
	isScanning: () => boolean;
	getCurrentRoot: () => string | undefined;
	refresh: () => void;
}

/**
 * Manages the auto-refresh timer and configuration subscription.
 * Single responsibility: auto-refresh lifecycle.
 */
export class AutoRefreshController {
	private timer: NodeJS.Timeout | undefined;
	private configSubscription: vscode.Disposable | undefined;

	/**
	 * Creates an auto-refresh controller.
	 * @param options - Auto-refresh callbacks.
	 */
	constructor(private options: AutoRefreshControllerOptions) {}

	/**
	 * Starts the auto-refresh timer and subscribes to configuration changes.
	 * @returns void
	 */
	start(): void {
		// Apply immediately so the first timer reflects current config.
		this.applyConfig();

		this.configSubscription?.dispose();
		this.configSubscription = configManager.onConfigChange(() => {
			// Reconfigure the timer when settings change.
			this.applyConfig();
			});
	}

	/**
	 * Stops the timer and disposes the configuration subscription.
	 * @returns void
	 */
	dispose(): void {
		this.stopTimer();
		this.configSubscription?.dispose();
		this.configSubscription = undefined;
	}

	/**
	 * Reads the current configuration and applies it to the timer.
	 * @returns void
	 */
	private applyConfig(): void {
		const { enabled, minutes } = configManager.getAutoRefreshConfig();

		if (!enabled) {
			// Disabled: ensure the timer is stopped.
			this.stopTimer();
			return;
		}

		this.startTimer(minutes);
	}

	/**
	 * Starts the periodic refresh timer.
	 * @param minutes - Interval in minutes.
	 * @returns void
	 */
	private startTimer(minutes: number): void {
		this.stopTimer();

		const intervalMs = minutes * 60 * 1000;
		this.timer = setInterval(() => {
			// Avoid overlapping scans; refresh is best-effort and should stay quiet.
			if (this.options.isScanning() || !this.options.getCurrentRoot()) return;
			this.options.refresh();
			}, intervalMs);
	}

	/**
	 * Stops the periodic refresh timer if it is running.
	 * @returns void
	 */
	private stopTimer(): void {
		if (!this.timer) return;
		clearInterval(this.timer);
		this.timer = undefined;
	}
}
