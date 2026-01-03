import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import type { ScanProgress, ExtendedScanResult } from '../../types';
import { ScanCache } from './scanCache';
import { configManager } from '../../common/configManager';
import { computeSizeBreakdown } from './sizeBreakdown';
import { scanProjectSize } from './scanEngine';
import { AutoRefreshController } from './autoRefreshController';
import { ProjectRootController } from './projectRootController';
import { createCancellableSilentSession, createCancellableWindowProgressSession, type CancellableProgressSession } from './scanSession';
import type { SizeScanInternals } from './sizeScanInternals';

type RunScanOptions = {
	collectDirectorySizes: boolean;
	collectTopDirectories: boolean;
	showWindowProgress: boolean;
	emitProgressEvents: boolean;
};

/**
 * Project size scanner with soft limits and controlled concurrency
 */
export class ProjectSizeScanner extends EventEmitter {
	private currentScanCancellation: vscode.CancellationTokenSource | undefined;
	private readonly rootController: ProjectRootController;
	private readonly autoRefreshController: AutoRefreshController;
	private isScanning = false;
	private lastProgressUpdate = 0;
	private readonly progressThrottleMs = 500;

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
	 * Dispose and cleanup
	 */
	dispose(): void {
		this.autoRefreshController.dispose();
		this.cancelCurrentScan();
		this.rootController.dispose();
		this.removeAllListeners();
	}

	/**
	 * Emit progress update (throttled)
	 */
	private emitProgress(rootPath: string, currentBytes: number, directoriesScanned: number): void {
		const now = Date.now();
		if (now - this.lastProgressUpdate < this.progressThrottleMs) return;

		const progress: ScanProgress = { rootPath, currentBytes, directoriesScanned, isScanning: true };
		this.emit('progress', progress);
		this.lastProgressUpdate = now;
	}

	private emitScanState(rootPath: string, isScanning: boolean): void {
		const progress: ScanProgress = { rootPath, currentBytes: 0, directoriesScanned: 0, isScanning };
		this.emit(isScanning ? 'scanStart' : 'scanEnd', progress);

		if (isScanning) this.lastProgressUpdate = Date.now();
	}

	/**
	 * Get current project root
	 */
	getCurrentRoot(): string | undefined {
		return this.rootController.getCurrentRoot();
	}

	/**
	 * Check if a scan is currently in progress
	 */
	isScanInProgress(): boolean {
		return this.isScanning;
	}

	/**
	 * Handle editor change (multi-root projects)
	 */
	handleEditorChange(editor: vscode.TextEditor): void {
		const { rootSwitchDebounceMs } = configManager.getScanConfig();
		this.rootController.handleEditorChange(editor, rootSwitchDebounceMs);
	}

	/**
	 * Perform project scan
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
	 */
	async scanSummary(rootOverride?: string): Promise<ExtendedScanResult | undefined> {
		return this.runScan(rootOverride, {
			collectDirectorySizes: false,
			collectTopDirectories: false,
			showWindowProgress: false,
			emitProgressEvents: true,
		});
	}

	private beginScan(rootPath: string): void {
		this.cancelCurrentScan();
		this.isScanning = true;
		this.emitScanState(rootPath, true);
	}

	private endScan(rootPath: string, session: CancellableProgressSession<ExtendedScanResult>): void {
		if (this.currentScanCancellation === session.cancellationSource) {
			this.currentScanCancellation = undefined;
		}

		session.dispose();
		this.isScanning = false;
		this.emitScanState(rootPath, false);
	}

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
	 * Perform the actual scan
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
	 * Cancel current scan
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
	 */
	computeSizeBreakdown(params: { rootPath: string } & SizeScanInternals) {
		return computeSizeBreakdown(params);
	}
}
