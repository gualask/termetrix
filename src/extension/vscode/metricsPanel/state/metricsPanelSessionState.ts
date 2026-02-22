import type * as vscode from 'vscode';
import type { MetricsTab, ScanResult } from '../../../types';
import { ScanRoot } from '../../../../core/shared/pathing/scanRoot';
import type { DirectoryMetricsSnapshot } from '../../../../core/sizeScan/types';

export type PanelTabScanState = 'never' | 'running' | 'success' | 'error';
const INITIAL_TAB_STATE: Record<MetricsTab, PanelTabScanState> = { size: 'never', loc: 'never' };

/**
 * Panel session state that should live only for the lifetime of an open webview panel.
 * Single responsibility: track ephemeral panel state (internals + user editor column).
 */
export class MetricsPanelSessionState {
	private root: ScanRoot | null = null;
	// Memory-heavy internals retained only for the lifetime of an open webview session.
	// These fields are not persisted in `ScanCache`.
	private sizeBreakdownSource: DirectoryMetricsSnapshot | null = null;
	private tabState: Record<MetricsTab, PanelTabScanState> = { ...INITIAL_TAB_STATE };
	private sizeScanResult: ScanResult | undefined;
	/** Last known editor column used by the user (non-webview), for opening files outside the webview column */
	private preferredEditorColumn: vscode.ViewColumn | undefined;

	/**
	 * Remembers the user's editor column so that opening files from the webview doesn't steal focus.
	 * @param editor - Active editor (if any).
	 * @returns void
	 */
	updatePreferredEditorColumnFrom(editor: vscode.TextEditor | undefined): void {
		if (!editor) return;
		const scheme = editor.document.uri.scheme;
		if (scheme !== 'file' && scheme !== 'untitled') return;
		// Remember the column so "openFile" from the webview doesn't steal focus from where the user works.
		this.preferredEditorColumn = editor.viewColumn;
	}

	getPreferredEditorColumn(): vscode.ViewColumn | undefined {
		return this.preferredEditorColumn;
	}

	syncPanelRootPath(rootPath: string): void {
		const nextRoot = ScanRoot.fromPath(rootPath);
		if (!nextRoot) return;
		if (this.root === null) {
			this.root = nextRoot;
			return;
		}
		if (this.root.equals(nextRoot)) return;
		this.resetForRoot(nextRoot);
	}

	getTabState(tab: MetricsTab): PanelTabScanState {
		return this.tabState[tab];
	}

	canStartTabRun(tab: MetricsTab, force = false): boolean {
		const state = this.tabState[tab];
		if (state === 'running') return false;
		if (force) return true;
		return state === 'never' || state === 'error';
	}

	beginTabRun(tab: MetricsTab, force = false): boolean {
		if (!this.canStartTabRun(tab, force)) return false;
		this.tabState[tab] = 'running';
		return true;
	}

	completeTabRunSuccess(tab: MetricsTab): void {
		this.tabState[tab] = 'success';
	}

	completeTabRunError(tab: MetricsTab): void {
		this.tabState[tab] = 'error';
	}

	restoreTabAfterCancel(tab: MetricsTab, hasPreviousData: boolean): void {
		this.tabState[tab] = hasPreviousData ? 'success' : 'never';
	}

	hasSuccessfulTabRun(tab: MetricsTab): boolean {
		return this.tabState[tab] === 'success';
	}

	getSizeScanResult(): ScanResult | undefined {
		return this.sizeScanResult;
	}

	setSizeScanResult(result: ScanResult | undefined): void {
		this.sizeScanResult = result;
	}

	getSizeBreakdownSource(): DirectoryMetricsSnapshot | null {
		return this.sizeBreakdownSource;
	}

	setSizeBreakdownSource(value: DirectoryMetricsSnapshot | null): void {
		this.sizeBreakdownSource = value;
	}

	/**
	 * Clears memory-heavy cached scan internals (preferred column is kept).
	 * @returns void
	 */
	clearInternals(): void {
		this.root = null;
		this.sizeBreakdownSource = null;
		this.tabState = { ...INITIAL_TAB_STATE };
		this.sizeScanResult = undefined;
	}

	/**
	 * Clears internals when the scan root changes (avoid mixing internals from different roots).
	 * @param rootPath - Root path reported by the scan event.
	 * @returns void
	 */
	invalidateInternalsIfRootChanged(rootPath: string): void {
		// Root changes invalidate all panel-derived state (avoid mixing results from different roots).
		this.syncPanelRootPath(rootPath);
	}

	private resetForRoot(root: ScanRoot): void {
		this.sizeBreakdownSource = null;
		this.tabState = { ...INITIAL_TAB_STATE };
		this.sizeScanResult = undefined;
		this.root = root;
	}
}
