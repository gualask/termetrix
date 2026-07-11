import type * as vscode from 'vscode';
import { ScanRoot } from '../../../../core/shared/pathing/scanRoot';
import type { ScanKind } from '../../../types';

export type ScanRunState = 'never' | 'running' | 'success' | 'error';
const INITIAL_SCAN_STATE: Record<ScanKind, ScanRunState> = { size: 'never', loc: 'never' };

/**
 * Panel session state that should live only for the lifetime of an open webview panel.
 * Single responsibility: track ephemeral panel state (internals + user editor column).
 */
export class MetricsPanelSessionState {
	private root: ScanRoot | null = null;
	private scanState: Record<ScanKind, ScanRunState> = { ...INITIAL_SCAN_STATE };
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

	/** Returns the preferred editor column stored by `updatePreferredEditorColumnFrom`. */
	getPreferredEditorColumn(): vscode.ViewColumn | undefined {
		return this.preferredEditorColumn;
	}

	/**
	 * Synchronises the panel's active root path, resetting scan state when the root changes.
	 * @param rootPath - Current workspace root reported by the scanner.
	 */
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

	/**
	 * Returns the current run state for a scan kind.
	 * @param kind - Scan kind (`'size'` or `'loc'`).
	 */
	getScanState(kind: ScanKind): ScanRunState {
		return this.scanState[kind];
	}

	private canStartRun(kind: ScanKind, force = false): boolean {
		const state = this.scanState[kind];
		if (state === 'running') return false;
		if (force) return true;
		return state === 'never' || state === 'error';
	}

	/**
	 * Transitions a scan to `'running'` if allowed. Returns `false` when already running
	 * or when the scan has previously succeeded and `force` is not set.
	 * @param kind - Scan kind.
	 * @param force - When `true`, restarts even after a prior success.
	 */
	beginRun(kind: ScanKind, force = false): boolean {
		if (!this.canStartRun(kind, force)) return false;
		this.scanState[kind] = 'running';
		return true;
	}

	/**
	 * Marks a scan as successfully completed.
	 * @param kind - Scan kind.
	 */
	completeRunSuccess(kind: ScanKind): void {
		this.scanState[kind] = 'success';
	}

	/**
	 * Marks a scan as failed.
	 * @param kind - Scan kind.
	 */
	completeRunError(kind: ScanKind): void {
		this.scanState[kind] = 'error';
	}

	/**
	 * Restores scan state after a cancellation: `'success'` when prior data exists, `'never'` otherwise.
	 * @param kind - Scan kind.
	 * @param hasPreviousData - Whether a previous successful result is available.
	 */
	restoreAfterCancel(kind: ScanKind, hasPreviousData: boolean): void {
		this.scanState[kind] = hasPreviousData ? 'success' : 'never';
	}

	/**
	 * Clears memory-heavy cached scan internals (preferred column is kept).
	 * @returns void
	 */
	clearInternals(): void {
		this.root = null;
		this.scanState = { ...INITIAL_SCAN_STATE };
	}

	private resetForRoot(root: ScanRoot): void {
		this.scanState = { ...INITIAL_SCAN_STATE };
		this.root = root;
	}
}
