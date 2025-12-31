import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ScanProgress, ExtendedScanResult } from '../types';
import { ScanCache } from '../cache/scanCache';
import { Semaphore } from './semaphore';
import { configManager } from '../utils/configManager';

/**
 * Workspace scanner with soft limits and controlled concurrency
 */
export class WorkspaceScanner extends EventEmitter {
	private currentRoot: string | undefined;
	private currentScanCancellation: vscode.CancellationTokenSource | undefined;
	private debounceTimer: NodeJS.Timeout | undefined;
	private autoRefreshTimer: NodeJS.Timeout | undefined;
	private isScanning = false;
	private lastProgressUpdate = 0;
	private readonly PROGRESS_THROTTLE_MS = 200; // Update max 5 times/second

	constructor(private cache: ScanCache) {
		super();
		this.updateCurrentRoot();
		this.setupAutoRefresh();
	}

	/**
	 * Setup auto-refresh if enabled
	 */
	private setupAutoRefresh(): void {
		const { enabled } = configManager.getAutoRefreshConfig();

		if (enabled) {
			this.startAutoRefresh();
		}

		// Watch for config changes
		configManager.onConfigChange(() => {
			const { enabled: newEnabled } = configManager.getAutoRefreshConfig();
			if (newEnabled) {
				this.startAutoRefresh();
			} else {
				this.stopAutoRefresh();
			}
		});
	}

	/**
	 * Start auto-refresh timer
	 */
	private startAutoRefresh(): void {
		this.stopAutoRefresh();

		const { minutes } = configManager.getAutoRefreshConfig();
		const intervalMs = minutes * 60 * 1000;

		this.autoRefreshTimer = setInterval(() => {
			if (!this.isScanning && this.currentRoot) {
				this.scan();
			}
		}, intervalMs);
	}

	/**
	 * Stop auto-refresh timer
	 */
	private stopAutoRefresh(): void {
		if (this.autoRefreshTimer) {
			clearInterval(this.autoRefreshTimer);
			this.autoRefreshTimer = undefined;
		}
	}

	/**
	 * Dispose and cleanup
	 */
	dispose(): void {
		this.stopAutoRefresh();
		this.cancelCurrentScan();
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
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
	 * Get current workspace root
	 */
	getCurrentRoot(): string | undefined {
		return this.currentRoot;
	}

	/**
	 * Check if a scan is currently in progress
	 */
	isScanInProgress(): boolean {
		return this.isScanning;
	}

	/**
	 * Handle editor change (multi-root workspace)
	 */
	handleEditorChange(editor: vscode.TextEditor): void {
		const newRoot = this.getRootForEditor(editor);

		if (newRoot && newRoot !== this.currentRoot) {
			// Cancel previous scan
			this.cancelCurrentScan();

			// Debounce scan for new root
			this.debounceScan(newRoot);
		}
	}

	/**
	 * Perform workspace scan
	 */
	async scan(rootOverride?: string): Promise<ExtendedScanResult | undefined> {
		const rootPath = rootOverride || this.currentRoot;

		if (!rootPath) {
			return undefined;
		}

		// Cancel previous scan
		this.cancelCurrentScan();

		// Mark as scanning
		this.isScanning = true;

		// Emit scan start
		this.emitScanStart(rootPath);

		// Create new cancellation token
		const cancellationSource = new vscode.CancellationTokenSource();
		this.currentScanCancellation = cancellationSource;

		try {
			const result = await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Window,
					title: 'Scanning workspace...',
					cancellable: true
				},
				async (_progress, token) => {
					// Link external cancellation to internal
					token.onCancellationRequested(() => {
						cancellationSource.cancel();
					});

					return await this.performScan(rootPath, cancellationSource.token);
				}
			);

			if (result) {
				this.cache.set(rootPath, result);
			}

			return result;
		} catch (error) {
			console.error('Scan error:', error);
			return undefined;
		} finally {
			if (this.currentScanCancellation === cancellationSource) {
				this.currentScanCancellation = undefined;
			}
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
		const startTime = Date.now();

		const semaphore = new Semaphore(config.concurrentOperations);
		const dirSizes = new Map<string, number>();
		let totalBytes = 0;
		let directoriesScanned = 0;
		let skippedCount = 0;
		let incomplete = false;
		let incompleteReason: 'cancelled' | 'time_limit' | 'dir_limit' | undefined;

		// BFS queue
		const queue: string[] = [rootPath];

		while (queue.length > 0) {
			// Check cancellation
			if (cancellationToken.isCancellationRequested) {
				incomplete = true;
				incompleteReason = 'cancelled';
				break;
			}

			// Check time limit
			const elapsed = Date.now() - startTime;
			if (elapsed > config.maxDurationSeconds * 1000) {
				incomplete = true;
				incompleteReason = 'time_limit';
				break;
			}

			// Check directory limit
			if (directoriesScanned >= config.maxDirectories) {
				incomplete = true;
				incompleteReason = 'dir_limit';
				break;
			}

			const currentPath = queue.shift()!;
			directoriesScanned++;

			// Emit progress update (throttled)
			this.emitProgress(rootPath, totalBytes, directoriesScanned);

			try {
				await semaphore.execute(async () => {
					try {
						const entries = await fs.readdir(currentPath, { withFileTypes: true });

						for (const entry of entries) {
							const fullPath = path.join(currentPath, entry.name);

							if (entry.isSymbolicLink()) {
								// Ignore symlinks
								continue;
							}

							if (entry.isDirectory()) {
								queue.push(fullPath);
							} else if (entry.isFile()) {
								try {
									const stats = await fs.stat(fullPath);
									const size = stats.size;

									// Add to total
									totalBytes += size;

									// Add to THIS directory only (direct size, not cumulative)
									const currentSize = dirSizes.get(currentPath) || 0;
									dirSizes.set(currentPath, currentSize + size);
								} catch {
									// Ignore stat errors on individual files
								}
							}
						}
					} catch (readdirError) {
						if ((readdirError as NodeJS.ErrnoException).code === 'EACCES' ||
						    (readdirError as NodeJS.ErrnoException).code === 'EPERM') {
							skippedCount++;
						}
						// Continue scan despite errors
					}
				});
			} catch {
				// Semaphore error, skip this directory
				continue;
			}
		}

		const endTime = Date.now();

		// Convert to array and get top directories
		const allDirs: Array<{ path: string; absolutePath: string; bytes: number }> = [];
		const directorySizes: Record<string, number> = {};

		for (const [dirPath, bytes] of dirSizes.entries()) {
			directorySizes[dirPath] = bytes;
			if (dirPath === rootPath) continue;
			const relativePath = path.relative(rootPath, dirPath);
			allDirs.push({ path: relativePath, absolutePath: dirPath, bytes });
		}

		const topDirectories = allDirs.sort((a, b) => b.bytes - a.bytes).slice(0, 5);

		return {
			rootPath,
			totalBytes,
			directorySizes,
			topDirectories,
			metadata: {
				startTime,
				endTime,
				duration: endTime - startTime,
				directoriesScanned
			},
			incomplete,
			incompleteReason,
			skippedCount
		};
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
	 * Debounce scan for new root
	 */
	private debounceScan(newRoot: string): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		const { rootSwitchDebounceMs } = configManager.getScanConfig();
		this.debounceTimer = setTimeout(() => {
			this.currentRoot = newRoot;
			this.scan(newRoot);
		}, rootSwitchDebounceMs);
	}

	/**
	 * Update current root based on active editor
	 */
	private updateCurrentRoot(): void {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			this.currentRoot = this.getRootForEditor(editor);
		} else {
			this.currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		}
	}

	/**
	 * Get root folder for an editor
	 */
	private getRootForEditor(editor: vscode.TextEditor): string | undefined {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
		return workspaceFolder?.uri.fsPath;
	}

	/**
	 * Compute deep scan with cumulative sizes from cached directorySizes
	 */
	computeDeepScan(
		directorySizes: Record<string, number>,
		rootPath: string
	): Array<{ path: string; absolutePath: string; bytes: number }> {
		const cumulativeSizes = new Map<string, number>();

		// For each directory with files, propagate its size up to all ancestors
		for (const [dirPath, directSize] of Object.entries(directorySizes)) {
			// Add direct size to this directory
			const current = cumulativeSizes.get(dirPath) || 0;
			cumulativeSizes.set(dirPath, current + directSize);

			// Propagate up to all ancestors
			let currentPath = dirPath;
			while (true) {
				const parentPath = path.dirname(currentPath);
				if (parentPath === currentPath || !parentPath.startsWith(rootPath) || parentPath.length < rootPath.length) {
					break;
				}
				const parentCumulative = cumulativeSizes.get(parentPath) || 0;
				cumulativeSizes.set(parentPath, parentCumulative + directSize);
				currentPath = parentPath;
			}
		}

		// Build all directories from cumulative sizes
		const allDirectories: Array<{ path: string; absolutePath: string; bytes: number }> = [];
		for (const [dirPath, bytes] of cumulativeSizes.entries()) {
			if (dirPath === rootPath) continue;
			const relativePath = path.relative(rootPath, dirPath);
			allDirectories.push({ path: relativePath, absolutePath: dirPath, bytes });
		}

		return allDirectories.sort((a, b) => b.bytes - a.bytes);
	}
}
