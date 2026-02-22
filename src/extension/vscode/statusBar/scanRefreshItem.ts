import * as vscode from 'vscode';
import { ProjectSizeScanner } from '../sizeScan/projectSizeScanner';
import { ScannerEventSubscription } from '../../support/scannerEvents';
import { DisposableStore } from '../../support/disposableStore';
import { COMMAND_IDS } from '../../support/constants';

/**
 * Status bar item for triggering or cancelling a scan without opening the metrics panel.
 * Shows a refresh icon when idle and a spinning icon when a scan is in progress.
 */
export class ScanRefreshStatusBarItem implements vscode.Disposable {
	private readonly statusBarItem: vscode.StatusBarItem;
	private readonly disposables = new DisposableStore();
	private isScanning = false;

	/**
	 * Creates the scan refresh status bar item and wires scan event subscriptions.
	 * @param scanner - Scanner providing scan state events.
	 */
	constructor(scanner: ProjectSizeScanner) {
		// Sits immediately to the right of the metrics item (priority 999).
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 998);

		const subscription = new ScannerEventSubscription(scanner, {
			onScanStart: () => this.setScanning(true),
			onScanEnd: () => this.setScanning(false),
		});

		this.disposables.add(vscode.Disposable.from(this.statusBarItem, subscription));

		this.render();
		this.statusBarItem.show();
	}

	private setScanning(isScanning: boolean): void {
		this.isScanning = isScanning;
		this.render();
	}

	private render(): void {
		if (this.isScanning) {
			this.statusBarItem.text = '$(sync~spin)';
			this.statusBarItem.tooltip = 'Cancel scan';
			this.statusBarItem.command = COMMAND_IDS.cancelScan;
		} else {
			this.statusBarItem.text = '$(sync)';
			this.statusBarItem.tooltip = 'Refresh scan';
			this.statusBarItem.command = COMMAND_IDS.refreshScan;
		}
	}

	dispose(): void {
		this.disposables.dispose();
	}
}
