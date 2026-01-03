import * as vscode from 'vscode';
import { configManager } from '../../common/configManager';

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

	constructor(private options: AutoRefreshControllerOptions) {}

	start(): void {
		// Apply immediately so the first timer reflects current config.
		this.applyConfig();

		this.configSubscription?.dispose();
		this.configSubscription = configManager.onConfigChange(() => {
			// Reconfigure the timer when settings change.
			this.applyConfig();
		});
	}

	dispose(): void {
		this.stopTimer();
		this.configSubscription?.dispose();
		this.configSubscription = undefined;
	}

	private applyConfig(): void {
		const { enabled, minutes } = configManager.getAutoRefreshConfig();

		if (!enabled) {
			// Disabled: ensure the timer is stopped.
			this.stopTimer();
			return;
		}

		this.startTimer(minutes);
	}

	private startTimer(minutes: number): void {
		this.stopTimer();

		const intervalMs = minutes * 60 * 1000;
		this.timer = setInterval(() => {
			// Avoid overlapping scans; refresh is best-effort and should stay quiet.
			if (this.options.isScanning() || !this.options.getCurrentRoot()) return;
			this.options.refresh();
		}, intervalMs);
	}

	private stopTimer(): void {
		if (!this.timer) return;
		clearInterval(this.timer);
		this.timer = undefined;
	}
}
