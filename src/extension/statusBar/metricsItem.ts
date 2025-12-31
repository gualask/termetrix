import * as vscode from 'vscode';
import { WorkspaceScanner } from '../scanner/workspaceScanner';
import { ScanCache } from '../cache/scanCache';
import { ScanProgress } from '../types';
import { formatBytes } from '../utils/formatters';
import { buildMetricsTooltip, getTooltipOptionsFromConfig } from '../utils/tooltipBuilder';
import { ScannerEventSubscription } from '../utils/scannerEvents';

/**
 * Metrics status bar item - shows workspace size and selected LOC count
 */
export class MetricsStatusBarItem implements vscode.Disposable {
	private statusBarItem: vscode.StatusBarItem;
	private selectedLines: number = 0;
	private currentProgress: ScanProgress | undefined;
	private eventSubscription: ScannerEventSubscription;

	constructor(
		private scanner: WorkspaceScanner,
		private cache: ScanCache
	) {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			999
		);
		this.statusBarItem.command = 'termetrix.openScanPanel';

		// Subscribe to scanner events using shared utility
		this.eventSubscription = new ScannerEventSubscription(scanner, {
			onScanStart: this.handleScanStart.bind(this),
			onProgress: this.handleProgress.bind(this),
			onScanEnd: this.handleScanEnd.bind(this)
		});

		this.update();
		this.statusBarItem.show();
	}

	private handleScanStart(progress: ScanProgress): void {
		this.currentProgress = progress;
		this.updateWithProgress();
	}

	private handleProgress(progress: ScanProgress): void {
		this.currentProgress = progress;
		this.updateWithProgress();
	}

	private handleScanEnd(_progress: ScanProgress): void {
		this.currentProgress = undefined;
		this.update();
	}

	/**
	 * Update with progress (during scanning)
	 */
	private updateWithProgress(): void {
		if (!this.currentProgress) {
			this.update();
			return;
		}

		// Build status bar text with spinning indicator
		let text = `$(database) ${formatBytes(this.currentProgress.currentBytes)} $(loading~spin)`;

		// Add selected lines if any
		if (this.selectedLines > 0) {
			text += `   $(list-selection) ${this.selectedLines}`;
		}

		this.statusBarItem.text = text;
		// Simple static tooltip during scanning (no flickering)
		this.statusBarItem.tooltip = 'Scanning workspace...';
	}

	/**
	 * Update workspace size display
	 */
	update(): void {
		const rootPath = this.scanner.getCurrentRoot();

		if (!rootPath) {
			this.statusBarItem.text = '$(database) —';
			this.statusBarItem.tooltip = 'No workspace root detected';
			return;
		}

		const scanResult = this.cache.get(rootPath);

		if (!scanResult) {
			this.statusBarItem.text = '$(database) ...';
			this.statusBarItem.tooltip = 'Scanning workspace...';
			return;
		}

		// Build status bar text
		let text = `$(database) ${formatBytes(scanResult.totalBytes)}`;

		// Add incomplete indicator
		if (scanResult.incomplete) {
			text += ' $(warning)';
		}

		// Add selected lines if any
		if (this.selectedLines > 0) {
			text += `   $(list-selection) ${this.selectedLines}`;
		}

		this.statusBarItem.text = text;
		this.statusBarItem.tooltip = buildMetricsTooltip(
			rootPath,
			scanResult,
			this.cache,
			getTooltipOptionsFromConfig()
		);
	}

	/**
	 * Update selected lines count
	 */
	updateSelection(): void {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.selection.isEmpty) {
			this.selectedLines = 0;
		} else {
			const start = editor.selection.start.line;
			const end = editor.selection.end.line;
			this.selectedLines = Math.abs(end - start) + 1;
		}
		this.update();
	}

	dispose(): void {
		this.eventSubscription.dispose();
		this.statusBarItem.dispose();
	}
}
