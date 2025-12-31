import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { ScanProgress, ExtendedScanResult } from '../../types';
import { ScanCache } from './scanCache';
import { configManager } from '../../common/configManager';
import { computeDeepScan } from './deepScan';
import { scanProjectSize } from './scanEngine';
import { AutoRefreshController } from './autoRefreshController';
import { ProjectRootController } from './projectRootController';
import { createCancellableWindowProgressSession } from './scanSession';

/**
 * Project size scanner with soft limits and controlled concurrency
 */
export class ProjectSizeScanner extends EventEmitter {
	private currentScanCancellation: vscode.CancellationTokenSource | undefined;
	private readonly rootController: ProjectRootController;
	private readonly autoRefreshController: AutoRefreshController;
	private isScanning = false;
	private lastProgressUpdate = 0;
	private readonly PROGRESS_THROTTLE_MS = 200; // Update max 5 times/second

	constructor(private cache: ScanCache) {
		super();
		this.rootController = new ProjectRootController({
			onRootChangeScheduled: () => this.cancelCurrentScan(),
			onRootChanged: (rootPath) => void this.scan(rootPath),
		});
		this.rootController.initializeFromActiveEditor();

		this.autoRefreshController = new AutoRefreshController({
			isScanning: () => this.isScanning,
			getCurrentRoot: () => this.getCurrentRoot(),
			refresh: () => void this.scan(),
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
		if (now - this.lastProgressUpdate >= this.PROGRESS_THROTTLE_MS) {
			const progress: ScanProgress = {
				rootPath,
				currentBytes,
				directoriesScanned,
				isScanning: true
			};
			this.emit('progress', progress);
			this.lastProgressUpdate = now;
		}
	}

	/**
	 * Emit scan start
	 */
	private emitScanStart(rootPath: string): void {
		const progress: ScanProgress = {
			rootPath,
			currentBytes: 0,
			directoriesScanned: 0,
			isScanning: true
		};
		this.emit('scanStart', progress);
		this.lastProgressUpdate = Date.now();
	}

	/**
	 * Emit scan end
	 */
	private emitScanEnd(rootPath: string): void {
		const progress: ScanProgress = {
			rootPath,
			currentBytes: 0,
			directoriesScanned: 0,
			isScanning: false
		};
		this.emit('scanEnd', progress);
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
		const rootPath = rootOverride || this.getCurrentRoot();

		if (!rootPath) {
			return undefined;
		}

		// Cancel previous scan
		this.cancelCurrentScan();

		// Mark as scanning
		this.isScanning = true;

		// Emit scan start
		this.emitScanStart(rootPath);

		const session = createCancellableWindowProgressSession({
			title: 'Scanning project...',
			task: (cancellationToken) => this.performScan(rootPath, cancellationToken),
		});
		this.currentScanCancellation = session.cancellationSource;

		try {
			const result = await session.run();

			if (result) {
				this.cache.set(rootPath, result);
			}

			return result;
		} catch (error) {
			console.error('Scan error:', error);
			return undefined;
		} finally {
			if (this.currentScanCancellation === session.cancellationSource) {
				this.currentScanCancellation = undefined;
			}
			session.dispose();
			this.isScanning = false;
			// Emit scan end
			this.emitScanEnd(rootPath);
		}
	}

	/**
	 * Perform the actual scan
	 */
	private async performScan(
		rootPath: string,
		cancellationToken: vscode.CancellationToken
	): Promise<ExtendedScanResult> {
		const config = configManager.getScanConfig();
		return await scanProjectSize({
			rootPath,
			config,
			cancellationToken,
			onProgress: ({ totalBytes, directoriesScanned }) => {
				this.emitProgress(rootPath, totalBytes, directoriesScanned);
			},
		});
	}

	/**
	 * Cancel current scan
	 */
	cancelCurrentScan(): void {
		if (this.currentScanCancellation) {
			this.currentScanCancellation.cancel();
			this.currentScanCancellation = undefined;
		}
	}

	/**
	 * Compute deep scan with cumulative sizes from cached directorySizes
	 */
	computeDeepScan(
		directorySizes: Record<string, number>,
		rootPath: string
	): Array<{ path: string; absolutePath: string; bytes: number }> {
		return computeDeepScan(directorySizes, rootPath);
	}
}
