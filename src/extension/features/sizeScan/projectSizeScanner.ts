import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import type { ScanProgress, ExtendedScanResult } from '../../types';
import { ScanCache } from './state/scanCache';
import { configManager } from '../../common/configManager';
import { computeSizeBreakdown } from './model/sizeBreakdown';
import { scanProjectSize } from './engine/scanEngine';
import { AutoRefreshController } from './controller/autoRefreshController';
import { ProjectRootController } from './controller/projectRootController';
import {
	createCancellableSilentSession,
	createCancellableWindowProgressSession,
	type CancellableProgressSession,
} from './controller/scanSession';
import type { SizeScanInternals } from './state/sizeScanInternals';

type RunScanOptions = {
	collectDirectorySizes: boolean;
	collectTopDirectories: boolean;
	showWindowProgress: boolean;
	emitProgressEvents: boolean;
};

/**
 * High-level project size scanner (VS Code-facing orchestrator).
 * Wraps the pure scan engine with root tracking, cancellation, caching, and progress events.
 */
export class ProjectSizeScanner extends EventEmitter {
	private currentScanCancellation: vscode.CancellationTokenSource | undefined;
	private readonly rootController: ProjectRootController;
	private readonly autoRefreshController: AutoRefreshController;
	private isScanning = false;
	private lastProgressUpdate = 0;
	private readonly progressThrottleMs = 500;

	/**
	 * Creates a project size scanner.
	 * @param cache - In-memory cache for completed scan results.
	 */
	constructor(private cache: ScanCache) {
		super();
		this.rootController = new ProjectRootController({
			// Root changes can arrive in bursts (multi-root + editor switching).
			// Cancel early so we don't waste IO on a root that is no longer relevant.
			onRootChangeScheduled: () => this.cancelCurrentScan(),
			// When the root stabilizes, refresh the fast scan so status bar/panel have fresh totals.
			onRootChanged: (rootPath) => void this.scanSummary(rootPath),
		});
		this.rootController.initializeFromActiveEditor();

		this.autoRefreshController = new AutoRefreshController({
			isScanning: () => this.isScanning,
			getCurrentRoot: () => this.getCurrentRoot(),
			// Auto-refresh should be cheap and non-intrusive: use the summary scan.
			refresh: () => void this.scanSummary(),
		});
		this.autoRefreshController.start();
	}

	/**
	 * Disposes timers, cancels any in-flight scans, and clears listeners.
	 * @returns void
	 */
	dispose(): void {
		this.autoRefreshController.dispose();
		this.cancelCurrentScan();
		this.rootController.dispose();
		this.removeAllListeners();
	}

	/**
	 * Emits a throttled progress update.
	 * @param rootPath - Root path being scanned.
	 * @param currentBytes - Current total bytes scanned.
	 * @param directoriesScanned - Number of directories scanned so far.
	 * @returns void
	 */
	private emitProgress(rootPath: string, currentBytes: number, directoriesScanned: number): void {
		const now = Date.now();
		if (now - this.lastProgressUpdate < this.progressThrottleMs) return;

		const progress: ScanProgress = { rootPath, currentBytes, directoriesScanned, isScanning: true };
		this.emit('progress', progress);
		this.lastProgressUpdate = now;
	}

	/**
	 * Emits scan start/end state events.
	 * @param rootPath - Root path being scanned.
	 * @param isScanning - Whether scanning is starting or ending.
	 * @returns void
	 */
	private emitScanState(rootPath: string, isScanning: boolean): void {
		const progress: ScanProgress = { rootPath, currentBytes: 0, directoriesScanned: 0, isScanning };
		this.emit(isScanning ? 'scanStart' : 'scanEnd', progress);

		if (isScanning) this.lastProgressUpdate = Date.now();
	}

	/**
	 * Returns the current project root.
	 * @returns Root path or undefined.
	 */
	getCurrentRoot(): string | undefined {
		return this.rootController.getCurrentRoot();
	}

	/**
	 * Returns true when a scan is currently in progress.
	 * @returns True when scanning.
	 */
	isScanInProgress(): boolean {
		return this.isScanning;
	}

	/**
	 * Handles active editor changes (used for multi-root workspaces).
	 * @param editor - Active editor.
	 * @returns void
	 */
	handleEditorChange(editor: vscode.TextEditor): void {
		const { rootSwitchDebounceMs } = configManager.getScanConfig();
		this.rootController.handleEditorChange(editor, rootSwitchDebounceMs);
	}

	/**
	 * Runs a full scan intended for the metrics panel.
	 * @param rootOverride - Optional root override.
	 * @returns Scan result (or undefined when there is no root or on failure).
	 */
	async scan(rootOverride?: string): Promise<ExtendedScanResult | undefined> {
		return this.runScan(rootOverride, {
			collectDirectorySizes: true,
			collectTopDirectories: true,
			showWindowProgress: true,
			emitProgressEvents: true,
		});
	}

	/**
	 * Perform a fast scan intended for the status bar (total size only).
	 * @param rootOverride - Optional root override.
	 * @returns Scan result (or undefined when there is no root or on failure).
	 */
	async scanSummary(rootOverride?: string): Promise<ExtendedScanResult | undefined> {
		return this.runScan(rootOverride, {
			collectDirectorySizes: false,
			collectTopDirectories: false,
			showWindowProgress: false,
			emitProgressEvents: true,
		});
	}

	/**
	 * Marks the scan as started and emits state events.
	 * @param rootPath - Root path being scanned.
	 * @returns void
	 */
	private beginScan(rootPath: string): void {
		this.cancelCurrentScan();
		this.isScanning = true;
		this.emitScanState(rootPath, true);
	}

	/**
	 * Finalizes a scan session and emits state events.
	 * @param rootPath - Root path that was scanned.
	 * @param session - Cancellable session handle.
	 * @returns void
	 */
	private endScan(rootPath: string, session: CancellableProgressSession<ExtendedScanResult>): void {
		if (this.currentScanCancellation === session.cancellationSource) {
			this.currentScanCancellation = undefined;
		}

		session.dispose();
		this.isScanning = false;
		this.emitScanState(rootPath, false);
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
		const { showWindowProgress, ...scanOptions } = options;
		const rootPath = rootOverride ?? this.getCurrentRoot();

		if (!rootPath) return undefined;

		this.beginScan(rootPath);
		// Session abstraction ensures window-progress + cancellation are wired consistently.
		const session = this.createScanSession(rootPath, showWindowProgress, scanOptions);
		this.currentScanCancellation = session.cancellationSource;

		try {
			const result = await session.run();

			// Cache only what downstream consumers need; heavy internals are stored separately (webview lifetime).
			if (result) this.cacheScanResult(rootPath, result, scanOptions.collectTopDirectories);

			return result;
		} catch (error) {
			console.error('Scan error:', error);
			return undefined;
		} finally {
			this.endScan(rootPath, session);
		}
	}

	/**
	 * Creates a cancellable scan session (with or without VS Code window progress UI).
	 * @param rootPath - Root path to scan.
	 * @param showWindowProgress - Whether to show VS Code window progress.
	 * @param options - Scan options.
	 * @returns Cancellable progress session.
	 */
	private createScanSession(
		rootPath: string,
		showWindowProgress: boolean,
		options: { collectDirectorySizes: boolean; collectTopDirectories: boolean; emitProgressEvents: boolean }
	): CancellableProgressSession<ExtendedScanResult> {
		const task = (cancellationToken: vscode.CancellationToken) =>
			this.performScan(rootPath, cancellationToken, options);

		if (showWindowProgress) {
			return createCancellableWindowProgressSession({
				title: 'Scanning project...',
				task,
			});
		}

		return createCancellableSilentSession({ task });
	}

	/**
	 * Stores scan results in the cache, optionally preserving previous top directories for summary scans.
	 * @param rootPath - Root path key.
	 * @param result - Scan result.
	 * @param collectTopDirectories - Whether this scan collected top directories.
	 * @returns void
	 */
	private cacheScanResult(
		rootPath: string,
		result: ExtendedScanResult,
		collectTopDirectories: boolean
	): void {
		if (collectTopDirectories) {
			this.cache.set(rootPath, result);
			return;
		}

		// Summary scans don't collect top directories. Keep previous values so the UI doesn't regress.
		const previous = this.cache.get(rootPath);
		if (!previous?.topDirectories.length) {
			this.cache.set(rootPath, result);
			return;
		}

		this.cache.set(rootPath, { ...result, topDirectories: previous.topDirectories });
	}

	/**
	 * Performs the actual scan by invoking the pure scan engine.
	 * @param rootPath - Root path to scan.
	 * @param cancellationToken - VS Code cancellation token.
	 * @param options - Engine options.
	 * @returns Extended scan result.
	 */
	private async performScan(
		rootPath: string,
		cancellationToken: vscode.CancellationToken,
		options: { collectDirectorySizes: boolean; collectTopDirectories: boolean; emitProgressEvents: boolean }
	): Promise<ExtendedScanResult> {
		const config = configManager.getScanConfig();
		const { emitProgressEvents, ...scanOptions } = options;
		if (!emitProgressEvents) {
			return scanProjectSize({
				rootPath,
				config,
				cancellationToken,
				options: scanOptions,
			});
		}

		return scanProjectSize({
			rootPath,
			config,
			cancellationToken,
			options: scanOptions,
			// Progress events are throttled to avoid spamming the webview/status bar.
			onProgress: ({ totalBytes, directoriesScanned }) => {
				this.emitProgress(rootPath, totalBytes, directoriesScanned);
			},
		});
	}

	/**
	 * Cancels the current scan (best-effort).
	 * @returns void
	 */
	cancelCurrentScan(): void {
		const cancellationSource = this.currentScanCancellation;
		if (!cancellationSource) return;
		// Cancellation is best-effort; the engine checks the token frequently to stop quickly.
		cancellationSource.cancel();
		this.currentScanCancellation = undefined;
	}

	/**
	 * Compute the size breakdown view model from cached scan internals.
	 * @param params - Breakdown input (root + internals).
	 * @returns Size breakdown view model.
	 */
	computeSizeBreakdown(params: { rootPath: string } & SizeScanInternals) {
		return computeSizeBreakdown(params);
	}
}
