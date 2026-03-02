import * as vscode from 'vscode';
import { ProjectSizeScanner } from '../sizeScan/projectSizeScanner';
import type { ProgressData } from '../../types';
import { formatBytes } from '../../../shared/formatters';
import { ScannerEventSubscription } from '../../support/scannerEvents';
import { DisposableStore } from '../../support/disposableStore';
import { MetricsStatusBarRenderer } from './render/metricsStatusBarRenderer';
import { COMMAND_IDS } from '../../support/constants';

/**
 * Status bar item showing project size.
 */
export class MetricsStatusBarItem implements vscode.Disposable {
	private readonly statusBarItem: vscode.StatusBarItem;
	private isScanning = false;
	private currentProgress: ProgressData | undefined;
	private readonly disposables = new DisposableStore();
	private readonly renderer = new MetricsStatusBarRenderer(formatBytes);

	constructor(private readonly scanner: ProjectSizeScanner) {
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 999);
		this.statusBarItem.command = COMMAND_IDS.openMetricsPanel;

		const scannerSubscription = this.createScannerSubscription();
		const rootChangedListener = this.scanner.onRootChanged(() => this.render());

		this.disposables.add(
			vscode.Disposable.from(
				this.statusBarItem,
				scannerSubscription,
				rootChangedListener
			)
		);

		this.render();
		this.statusBarItem.show();
	}

	/**
	 * Creates a subscription that maps scan events into status bar updates.
	 * @returns A disposable subscription.
	 */
	private createScannerSubscription(): vscode.Disposable {
		return new ScannerEventSubscription(this.scanner, {
			onScanStart: () => this.setScanning(true),
			onProgress: (progress) => this.setProgress(progress),
			onScanEnd: () => this.setScanning(false),
		});
	}

	/**
	 * Renders the current status bar state.
	 * @returns void
	 */
	private render(): void {
		const rootPath = this.scanner.getCurrentRoot();
		const scanResult = rootPath ? this.scanner.getCachedResult(rootPath) : undefined;

		const { text, tooltip } = this.renderer.render({
			rootPath,
			scanResult,
			isScanning: this.isScanning,
			progress: this.currentProgress,
		});

		this.statusBarItem.text = text;
		this.statusBarItem.tooltip = tooltip;
	}

	/**
	 * Stores scan progress and triggers a render.
	 * @param progress - Current scan progress (or undefined when a scan ends).
	 * @returns void
	 */
	private setProgress(progress: ProgressData | undefined): void {
		this.isScanning = progress !== undefined;
		this.currentProgress = progress;
		this.render();
	}

	private setScanning(isScanning: boolean): void {
		this.isScanning = isScanning;
		if (!isScanning) this.currentProgress = undefined;
		this.render();
	}

	/**
	 * Force a refresh of the current display.
	 * @returns void
	 */
	update(): void {
		this.render();
	}

	/**
	 * Disposes event subscriptions and the underlying status bar item.
	 * @returns void
	 */
	dispose(): void {
		this.disposables.dispose();
	}
}
