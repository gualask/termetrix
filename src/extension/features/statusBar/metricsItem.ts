import * as vscode from 'vscode';
import { ProjectSizeScanner } from '../sizeScan/projectSizeScanner';
import { ScanCache } from '../sizeScan/scanCache';
import { ScanProgress } from '../../types';
import { formatBytes } from '../../common/formatters';
import { ScannerEventSubscription } from '../../common/scannerEvents';
import { DisposableStore } from '../../common/disposableStore';
import { getSelectedLineCount, getSelectedLineCountFromSelections } from './selectionLineCounter';

/**
 * Metrics status bar item - shows project size and selected LOC count
 */
export class MetricsStatusBarItem implements vscode.Disposable {
	private statusBarItem: vscode.StatusBarItem;
	private selectedLines = 0;
	private currentProgress: ScanProgress | undefined;
	private eventSubscription: ScannerEventSubscription;
	private readonly disposables = new DisposableStore();

	constructor(
		private scanner: ProjectSizeScanner,
		private cache: ScanCache
		) {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			999
		);
		this.statusBarItem.command = 'termetrix.openScanPanel';

		// Subscribe to scanner events using shared utility
		this.eventSubscription = new ScannerEventSubscription(scanner, {
			onScanStart: this.handleScanStart.bind(this),
			onProgress: this.handleProgress.bind(this),
			onScanEnd: this.handleScanEnd.bind(this)
		});

		// Keep selected line count in sync with editor state.
		this.selectedLines = getSelectedLineCount(vscode.window.activeTextEditor);
		this.disposables.add(
			vscode.window.onDidChangeTextEditorSelection((e) => {
				this.updateSelectedLinesFromSelections(e.selections);
				this.render();
			})
		);
		this.disposables.add(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				this.updateSelectedLinesFromEditor(editor);
				this.render();
			})
		);

		this.render();
		this.statusBarItem.show();
	}

	private handleScanStart(progress: ScanProgress): void {
		this.setProgress(progress);
	}

	private handleProgress(progress: ScanProgress): void {
		this.setProgress(progress);
	}

	private handleScanEnd(_progress: ScanProgress): void {
		this.setProgress(undefined);
	}

	private render(): void {
		if (this.currentProgress) return this.renderWithProgress();
		this.renderIdle();
	}

	private setProgress(progress: ScanProgress | undefined): void {
		this.currentProgress = progress;
		this.render();
	}

	private updateSelectedLinesFromEditor(editor: vscode.TextEditor | undefined): void {
		this.selectedLines = getSelectedLineCount(editor);
	}

	private updateSelectedLinesFromSelections(selections: readonly vscode.Selection[]): void {
		this.selectedLines = getSelectedLineCountFromSelections(selections);
	}

	private getSelectedLinesSuffix(): string {
		return this.selectedLines > 0 ? `   $(list-selection) ${this.selectedLines}` : '';
	}

	/**
	 * Update with progress (during scanning)
	 */
	private renderWithProgress(): void {
		if (!this.currentProgress) return this.renderIdle();

		// Build status bar text with spinning indicator
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
		this.eventSubscription.dispose();
		this.disposables.dispose();
		this.statusBarItem.dispose();
	}
}
