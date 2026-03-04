import * as vscode from 'vscode';
import type { ExtendedScanResult, ProgressData, ScanResult } from '../../types';
import { logger } from '../../support/logger';
import { ScanCache } from './state/scanCache';
import { PROGRESS_THROTTLE_MS } from '../../support/constants';
import { AutoRefreshController } from './controller/autoRefreshController';
import { ScanEventEmitter } from './controller/scanEventEmitter';
import { ScanRoot } from '../../../core/shared/pathing/scanRoot';
import type { SizeScanMode } from '../../../core/sizeScan/engine/scanEngineTypes';
import { ScanExecutionService } from './services/scanExecutionService';
import { ScanLifecycleService } from './services/scanLifecycleService';
import { RootLifecycleService } from './services/rootLifecycleService';
import type { DirectoryMetricsSnapshot } from '../../../core/sizeScan/types';

type RunScanOptions = {
	mode: SizeScanMode;
	emitProgressEvents?: boolean;
};

const MAX_DIRECTORY_METRICS_CACHE_ENTRIES = 10;

/**
 * High-level project size scanner (VS Code-facing orchestrator).
 * Wraps the pure scan engine with root tracking, cancellation, caching, and progress events.
 */
export class ProjectSizeScanner {
	private readonly rootLifecycle: RootLifecycleService;
	private readonly autoRefreshController: AutoRefreshController;
	private readonly scanEvents: ScanEventEmitter;
	private readonly scanExecution: ScanExecutionService;
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
	private readonly directoryMetricsCache = new Map<string, DirectoryMetricsSnapshot>();

	constructor() {
		this.scanEvents = new ScanEventEmitter(
			(rootPath) => this._onScanStart.fire(rootPath),
			(progress) => this._onProgress.fire(progress),
			() => this._onScanEnd.fire(),
			PROGRESS_THROTTLE_MS
		);

		this.scanExecution = new ScanExecutionService((progress) => this.scanEvents.onProgress(progress));

		this.scanLifecycle = new ScanLifecycleService({
			cache: this.cache,
			scanEvents: this.scanEvents,
			executeScan: (params) => this.scanExecution.execute(params),
			onDirectoryMetrics: (rootPath, metrics) => this.setDirectoryMetrics(rootPath, metrics),
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
			logger.error(`Background scan error: ${err instanceof Error ? err.message : String(err)}`)
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
		const root = ScanRoot.fromPath(rootPath);
		if (!root) return undefined;
		return this.directoryMetricsCache.get(root.key);
	}

	private setDirectoryMetrics(rootPath: string, metrics: DirectoryMetricsSnapshot): void {
		const root = ScanRoot.fromPath(rootPath);
		if (!root) return;
		// Simple LRU-ish behavior: refresh insertion order on updates.
		if (this.directoryMetricsCache.has(root.key)) this.directoryMetricsCache.delete(root.key);
		this.directoryMetricsCache.set(root.key, metrics);
		// Bound memory usage for long-lived VS Code sessions (e.g. frequent root switches).
		while (this.directoryMetricsCache.size > MAX_DIRECTORY_METRICS_CACHE_ENTRIES) {
			const oldestKey = this.directoryMetricsCache.keys().next().value as string | undefined;
			if (!oldestKey) break;
			this.directoryMetricsCache.delete(oldestKey);
		}
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
	 * Runs a full scan intended for the metrics panel.
	 * @param rootOverride - Optional root override.
	 * @returns Scan result (or undefined when there is no root or on failure).
	 */
	async scan(rootOverride?: string): Promise<ExtendedScanResult | undefined> {
		return this.runScan(rootOverride, { mode: 'full', emitProgressEvents: true });
	}

	/**
	 * Runs a scan for the current root with the given options.
	 * @param rootOverride - Optional root override.
	 * @param options - Scan options.
	 * @returns Scan result (or undefined when there is no root or on failure).
	 */
	private async runScan(
		rootOverride: string | undefined,
		options: RunScanOptions
	): Promise<ExtendedScanResult | undefined> {
		const root = ScanRoot.fromPath(rootOverride ?? this.getCurrentRoot());
		if (!root) return undefined;

		return this.scanLifecycle.runScan({
			rootPath: root.path,
			mode: options.mode,
			emitProgressEvents: options.emitProgressEvents ?? true,
		});
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
