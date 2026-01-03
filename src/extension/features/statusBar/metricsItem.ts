import * as vscode from 'vscode';
import { ProjectSizeScanner } from '../sizeScan/projectSizeScanner';
import { ScanCache } from '../sizeScan/state/scanCache';
import { ScanProgress } from '../../types';
import { formatBytes } from '../../common/formatters';
import { ScannerEventSubscription } from '../../common/scannerEvents';
import { DisposableStore } from '../../common/disposableStore';
import { getSelectedLineCount, getSelectedLineCountFromSelections } from './selectionLineCounter';

/**
 * Status bar item showing project size and selected line count.
 */
export class MetricsStatusBarItem implements vscode.Disposable {
	private readonly statusBarItem: vscode.StatusBarItem;
	private selectedLines = 0;
	private currentProgress: ScanProgress | undefined;
	private readonly disposables = new DisposableStore();

	/**
	 * Creates the metrics status bar item and wires event subscriptions.
	 * @param scanner - Scanner providing root/progress information.
	 * @param cache - Cache used to display the last completed scan result.
	 */
	constructor(
		private readonly scanner: ProjectSizeScanner,
		private readonly cache: ScanCache
	) {
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 999);
		this.statusBarItem.command = 'termetrix.openScanPanel';

		const scannerSubscription = this.createScannerSubscription();
		const selectionListener = this.createSelectionListener();
		const activeEditorListener = this.createActiveEditorListener();

		this.disposables.add(
			vscode.Disposable.from(
				this.statusBarItem,
				scannerSubscription,
				selectionListener,
				activeEditorListener
			)
		);

		// Keep selected line count in sync with editor state.
		this.selectedLines = getSelectedLineCount(vscode.window.activeTextEditor);

			this.render();
			this.statusBarItem.show();
		}

	/**
	 * Creates a subscription that maps scan events into status bar updates.
	 * @returns A disposable subscription.
	 */
	private createScannerSubscription(): vscode.Disposable {
		return new ScannerEventSubscription(this.scanner, {
			onScanStart: (progress) => this.setProgress(progress),
			onProgress: (progress) => this.setProgress(progress),
			onScanEnd: () => this.setProgress(undefined),
		});
	}

	/**
	 * Creates a subscription to keep selection line counts updated.
	 * @returns A disposable subscription.
	 */
	private createSelectionListener(): vscode.Disposable {
		return vscode.window.onDidChangeTextEditorSelection((e) => {
			if (!this.updateSelectedLinesFromSelections(e.selections)) return;
			this.render();
		});
	}

	/**
	 * Creates a subscription to keep selection line counts updated when the active editor changes.
	 * @returns A disposable subscription.
	 */
	private createActiveEditorListener(): vscode.Disposable {
		return vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (!this.updateSelectedLinesFromEditor(editor)) return;
			this.render();
		});
	}

	/**
	 * Renders the current status bar state.
	 * @returns void
	 */
	private render(): void {
		if (this.currentProgress) return this.renderWithProgress();
		this.renderIdle();
	}

	/**
	 * Stores scan progress and triggers a render.
	 * @param progress - Current scan progress (or undefined when a scan ends).
	 * @returns void
	 */
	private setProgress(progress: ScanProgress | undefined): void {
		this.currentProgress = progress;
		this.render();
	}

	/**
	 * Updates the selected line count based on the active editor.
	 * @param editor - Active editor (if any).
	 * @returns True when the value changed and a re-render is needed.
	 */
	private updateSelectedLinesFromEditor(editor: vscode.TextEditor | undefined): boolean {
		const next = getSelectedLineCount(editor);
		if (next === this.selectedLines) return false;
		this.selectedLines = next;
		return true;
	}

	/**
	 * Updates the selected line count based on current selections.
	 * @param selections - Editor selections.
	 * @returns True when the value changed and a re-render is needed.
	 */
	private updateSelectedLinesFromSelections(selections: readonly vscode.Selection[]): boolean {
		const next = getSelectedLineCountFromSelections(selections);
		if (next === this.selectedLines) return false;
		this.selectedLines = next;
		return true;
	}

	/**
	 * Returns the status bar suffix representing the current selection count.
	 * @returns A formatted suffix string (or empty string when no lines are selected).
	 */
	private getSelectedLinesSuffix(): string {
		return this.selectedLines > 0 ? `   $(list-selection) ${this.selectedLines}` : '';
	}

	/**
	 * Renders the status bar when a scan is in progress.
	 * @returns void
	 */
	private renderWithProgress(): void {
		if (!this.currentProgress) return this.renderIdle();

		// During scans, show the currently accumulated bytes (not the cached total).
		const bytesText =
			this.currentProgress.currentBytes > 0
				? formatBytes(this.currentProgress.currentBytes)
				: '...';
		const text = `$(database) ${bytesText}${this.getSelectedLinesSuffix()}`;

		this.statusBarItem.text = text;
		this.statusBarItem.tooltip = 'Scanning project...';
	}

	/**
	 * Renders the idle status bar using the cached scan result.
	 * @returns void
	 */
	private renderIdle(): void {
		const rootPath = this.scanner.getCurrentRoot();

		if (!rootPath) {
			this.statusBarItem.text = '$(database) —';
			this.statusBarItem.tooltip = 'No project root detected';
			return;
		}

		// Read cached values; do not trigger scans from the status bar.
		const scanResult = this.cache.get(rootPath);

		if (!scanResult) {
			this.statusBarItem.text = '$(database) ...';
			this.statusBarItem.tooltip = 'Scanning project...';
			return;
		}

		// Build status bar text
		let text = `$(database) ${formatBytes(scanResult.totalBytes)}`;

		// Add incomplete indicator
		if (scanResult.incomplete) {
			text += ' $(warning)';
		}

		text += this.getSelectedLinesSuffix();

		this.statusBarItem.text = text;
		// Keep tooltip minimal to avoid extra work and keep UX focused on the panel.
		this.statusBarItem.tooltip = 'Click to open metrics panel';
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
