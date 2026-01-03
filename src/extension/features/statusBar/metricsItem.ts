import * as vscode from 'vscode';
import { ProjectSizeScanner } from '../sizeScan/projectSizeScanner';
import { ScanCache } from '../sizeScan/scanCache';
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

	private createScannerSubscription(): vscode.Disposable {
		return new ScannerEventSubscription(this.scanner, {
			onScanStart: (progress) => this.setProgress(progress),
			onProgress: (progress) => this.setProgress(progress),
			onScanEnd: () => this.setProgress(undefined),
		});
	}

	private createSelectionListener(): vscode.Disposable {
		return vscode.window.onDidChangeTextEditorSelection((e) => {
			if (!this.updateSelectedLinesFromSelections(e.selections)) return;
			this.render();
		});
	}

	private createActiveEditorListener(): vscode.Disposable {
		return vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (!this.updateSelectedLinesFromEditor(editor)) return;
			this.render();
		});
	}

	private render(): void {
		if (this.currentProgress) return this.renderWithProgress();
		this.renderIdle();
	}

	private setProgress(progress: ScanProgress | undefined): void {
		this.currentProgress = progress;
		this.render();
	}

	private updateSelectedLinesFromEditor(editor: vscode.TextEditor | undefined): boolean {
		const next = getSelectedLineCount(editor);
		if (next === this.selectedLines) return false;
		this.selectedLines = next;
		return true;
	}

	private updateSelectedLinesFromSelections(selections: readonly vscode.Selection[]): boolean {
		const next = getSelectedLineCountFromSelections(selections);
		if (next === this.selectedLines) return false;
		this.selectedLines = next;
		return true;
	}

	private getSelectedLinesSuffix(): string {
		return this.selectedLines > 0 ? `   $(list-selection) ${this.selectedLines}` : '';
	}

	/**
	 * Update with progress (during scanning)
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
	 * Update project size display (idle)
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
	 */
	update(): void {
		this.render();
	}

	dispose(): void {
		this.disposables.dispose();
	}
}
