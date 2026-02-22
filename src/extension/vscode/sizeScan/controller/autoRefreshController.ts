import * as vscode from 'vscode';
import { configManager } from '../../../support/configManager';
import { IntervalTimer } from '../../../support/intervalTimer';

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
	private readonly timer = new IntervalTimer();
	private configSubscription: vscode.Disposable | undefined;

	/**
	 * Creates an auto-refresh controller.
	 * @param options - Auto-refresh callbacks.
	 */
	constructor(private options: AutoRefreshControllerOptions) {}

	/**
	 * Starts the auto-refresh timer and subscribes to configuration changes.
	 */
	start(): void {
		this.configSubscription?.dispose();
		this.configSubscription = configManager.subscribeAndApply(() => this.applyConfig());
	}

	/**
	 * Stops the timer and disposes the configuration subscription.
	 */
	dispose(): void {
		this.timer.stop();
		this.configSubscription?.dispose();
		this.configSubscription = undefined;
	}

	/**
	 * Reads the current configuration and applies it to the timer.
	 */
	private applyConfig(): void {
		const { enabled, minutes } = configManager.getAutoRefreshConfig();

		if (!enabled) {
			this.timer.stop();
			return;
		}

		const intervalMs = minutes * 60 * 1000;
		this.timer.start(intervalMs, () => {
			if (this.options.isScanning() || !this.options.getCurrentRoot()) return;
			this.options.refresh();
		});
	}
}
