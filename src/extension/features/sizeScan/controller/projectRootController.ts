import * as vscode from 'vscode';

export interface ProjectRootControllerOptions {
	onRootChangeScheduled?: () => void;
	onRootChanged: (rootPath: string) => void;
}

/**
 * Tracks the current project root and handles debounced switching when the active editor changes.
 * Single responsibility: root selection + debounce lifecycle.
 */
export class ProjectRootController {
	private currentRoot: string | undefined;
	private debounceTimer: NodeJS.Timeout | undefined;

	/**
	 * Creates a project root controller.
	 * @param options - Callbacks invoked on root change events.
	 */
	constructor(private options: ProjectRootControllerOptions) {}

	/**
	 * Initializes the root from the current active editor, falling back to the first workspace folder.
	 * @returns void
	 */
	initializeFromActiveEditor(): void {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			// Fallback: when no editor is active, default to the first workspace folder.
			this.currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			return;
		}

		this.currentRoot = this.getRootForEditor(editor);
	}

	/**
	 * Returns the current root path (if any).
	 * @returns Current root path.
	 */
	getCurrentRoot(): string | undefined {
		return this.currentRoot;
	}

	/**
	 * Handles active editor changes and emits a debounced root change when needed.
	 * @param editor - Active editor.
	 * @param debounceMs - Debounce time in milliseconds.
	 * @returns void
	 */
	handleEditorChange(editor: vscode.TextEditor, debounceMs: number): void {
		const newRoot = this.getRootForEditor(editor);

		if (!newRoot || newRoot === this.currentRoot) return;

		// Let callers cancel work early (useful when scans are already in-flight).
		this.options.onRootChangeScheduled?.();

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			// Only commit the new root after the editor settles to avoid thrashing on fast switches.
			this.currentRoot = newRoot;
			this.options.onRootChanged(newRoot);
			}, debounceMs);
	}

	/**
	 * Disposes internal timers.
	 * @returns void
	 */
	dispose(): void {
		if (!this.debounceTimer) return;
		clearTimeout(this.debounceTimer);
		this.debounceTimer = undefined;
	}

	/**
	 * Returns the workspace folder root for a given editor.
	 * @param editor - Active editor.
	 * @returns Root folder path or undefined.
	 */
	private getRootForEditor(editor: vscode.TextEditor): string | undefined {
		const projectFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
		return projectFolder?.uri.fsPath;
	}
}
