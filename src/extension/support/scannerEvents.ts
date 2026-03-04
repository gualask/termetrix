import type * as vscode from 'vscode';
import type { ProjectSizeScanner } from '../vscode/sizeScan/projectSizeScanner';
import type { ProgressData } from '../types';
import { DisposableStore } from './disposableStore';

export interface ScanEventHandlers {
	onScanStart?: (rootPath: string) => void;
	onProgress?: (progress: ProgressData) => void;
	onScanEnd?: () => void;
}

/**
 * Manages scanner event subscriptions with proper cleanup.
 * Single responsibility: event subscription lifecycle.
 * Uses VSCode Disposable pattern for automatic cleanup.
 */
export class ScannerEventSubscription implements vscode.Disposable {
	private readonly disposables = new DisposableStore();

	/**
	 * Subscribes to scanner events and forwards them to the provided handlers.
	 * @param scanner - Scanner with VSCode typed events.
	 * @param handlers - Optional event callbacks.
	 */
	constructor(scanner: ProjectSizeScanner, handlers: ScanEventHandlers) {
		if (handlers.onScanStart) {
			this.disposables.add(scanner.onScanStart(handlers.onScanStart));
		}
		if (handlers.onProgress) {
			this.disposables.add(scanner.onProgress(handlers.onProgress));
		}
		if (handlers.onScanEnd) {
			this.disposables.add(scanner.onScanEnd(handlers.onScanEnd));
		}
	}

	/** Disposes all active event subscriptions. */
	dispose(): void {
		this.disposables.dispose();
	}
}
