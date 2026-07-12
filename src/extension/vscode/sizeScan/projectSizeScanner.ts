import * as vscode from 'vscode';
import { ScanRoot } from '../../../core/shared/pathing/scanRoot';
import type { DirectoryMetricsSnapshot } from '../../../core/sizeScan/types';
import { PROGRESS_THROTTLE_MS } from '../../support/constants';
import { logger } from '../../support/logger';
import type { ExtendedScanResult, ProgressData, ScanResult } from '../../types';
import { AutoRefreshController } from './controller/autoRefreshController';
import { ScanEventEmitter } from './controller/scanEventEmitter';
import { executeSizeScan } from './services/executeSizeScan';
import { RootLifecycleService } from './services/rootLifecycleService';
import { ScanLifecycleService } from './services/scanLifecycleService';
import { ScanCache } from './state/scanCache';

/**
 * High-level project size scanner (VS Code-facing orchestrator).
 * Wraps the pure scan engine with root tracking, cancellation, caching, and progress events.
 */
export class ProjectSizeScanner {
	private readonly rootLifecycle: RootLifecycleService;
	private readonly autoRefreshController: AutoRefreshController;
	private readonly scanEvents: ScanEventEmitter;
	private readonly scanLifecycle: ScanLifecycleService;

	// Private event emitters (used internally to fire events)
	private readonly _onScanStart = new vscode.EventEmitter<string>();
	private readonly _onProgress = new vscode.EventEmitter<ProgressData>();
	private readonly _onScanEnd = new vscode.EventEmitter<void>();
	private readonly _onRootChanged = new vscode.EventEmitter<string | undefined>();

	// Public readonly events (consumers subscribe to these)
	readonly onScanStart: vscode.Event<string> = this._onScanStart.event;
	readonly onProgress: vscode.Event<ProgressData> = this._onProgress.event;
	readonly onScanEnd: vscode.Event<void> = this._onScanEnd.event;
	readonly onRootChanged: vscode.Event<string | undefined> = this._onRootChanged.event;

	private readonly cache = new ScanCache();

	constructor() {
		this.scanEvents = new ScanEventEmitter(
			(rootPath) => this._onScanStart.fire(rootPath),
			(progress) => this._onProgress.fire(progress),
			() => this._onScanEnd.fire(),
			PROGRESS_THROTTLE_MS,
		);

		this.scanLifecycle = new ScanLifecycleService({
			cache: this.cache,
			scanEvents: this.scanEvents,
			executeScan: (params) =>
				executeSizeScan({
					...params,
					onProgress: (progress) => this.scanEvents.onProgress(progress),
				}),
		});

		this.rootLifecycle = new RootLifecycleService({
			// Root changes can arrive in bursts (multi-root + editor switching).
			// Cancel early so we don't waste IO on a root that is no longer relevant.
			onRootChangeScheduled: () => this.cancelCurrentScan(),
			// When the root stabilizes, notify consumers and (optionally) refresh totals.
			onRootChanged: (rootPath) => this._onRootChanged.fire(rootPath),
			onRootChangedAutoScan: (rootPath) => this.backgroundScan(rootPath),
		});
		this.rootLifecycle.initialize();

		this.autoRefreshController = new AutoRefreshController({
			isScanning: () => this.isScanInProgress(),
			getCurrentRoot: () => this.getCurrentRoot(),
			refresh: () => this.backgroundScan(),
		});
		this.autoRefreshController.start();
	}

	/** Runs a scan in the background, logging any unexpected errors instead of propagating them. */
	private backgroundScan(rootPath?: string): void {
		void this.scan(rootPath).catch((err) =>
			logger.error(`Background scan error: ${err instanceof Error ? err.message : String(err)}`),
		);
	}

	/**
	 * Disposes timers, cancels any in-flight scans, and clears listeners.
	 * @returns void
	 */
	dispose(): void {
		this.autoRefreshController.dispose();
		this.cancelCurrentScan();
		this.rootLifecycle.dispose();
		this._onScanStart.dispose();
		this._onProgress.dispose();
		this._onScanEnd.dispose();
		this._onRootChanged.dispose();
	}

	/**
	 * Returns the cached scan result for a given root path, if available.
	 * @param rootPath - Root path to look up.
	 * @returns Cached scan result or undefined.
	 */
	getCachedResult(rootPath: string): ScanResult | undefined {
		return this.cache.get(rootPath);
	}

	/**
	 * Returns the cached directory metrics for a given root path, if available.
	 * @param rootPath - Root path to look up.
	 * @returns Cached directory metrics or undefined.
	 */
	getCachedDirectoryMetrics(rootPath: string): DirectoryMetricsSnapshot | undefined {
		return this.cache.getDirectoryMetrics(rootPath);
	}

	/**
	 * Returns the current project root.
	 * @returns Root path or undefined.
	 */
	getCurrentRoot(): string | undefined {
		return this.rootLifecycle.getCurrentRoot();
	}

	/**
	 * Returns true when a scan is currently in progress.
	 * @returns True when scanning.
	 */
	isScanInProgress(): boolean {
		return this.scanLifecycle.isScanInProgress();
	}

	/**
	 * Handles active editor changes (used for multi-root workspaces).
	 * @param editor - Active editor.
	 * @returns void
	 */
	handleEditorChange(editor: vscode.TextEditor): void {
		this.rootLifecycle.handleEditorChange(editor);
	}

	/**
	 * Runs a full project scan.
	 * @param rootOverride - Optional root override.
	 * @returns Scan result, or undefined when there is no root.
	 */
	async scan(rootOverride?: string): Promise<ExtendedScanResult | undefined> {
		const root = ScanRoot.fromPath(rootOverride ?? this.getCurrentRoot());
		if (!root) return undefined;
		return this.scanLifecycle.runScan(root.path);
	}

	/**
	 * Cancels the current scan (best-effort).
	 * @returns void
	 */
	cancelCurrentScan(): void {
		// Cancellation is best-effort; the engine checks the token frequently to stop quickly.
		this.scanLifecycle.cancelCurrentScan();
	}
}
