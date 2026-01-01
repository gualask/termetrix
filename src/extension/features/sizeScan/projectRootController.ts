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

	constructor(private options: ProjectRootControllerOptions) {}

	initializeFromActiveEditor(): void {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			this.currentRoot = this.getRootForEditor(editor);
			return;
		}
		this.currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	}

	getCurrentRoot(): string | undefined {
		return this.currentRoot;
	}

		handleEditorChange(editor: vscode.TextEditor, debounceMs: number): void {
			const newRoot = this.getRootForEditor(editor);

			if (!newRoot || newRoot === this.currentRoot) return;

			this.options.onRootChangeScheduled?.();

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.currentRoot = newRoot;
			this.options.onRootChanged(newRoot);
		}, debounceMs);
	}

	dispose(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = undefined;
		}
	}

	private getRootForEditor(editor: vscode.TextEditor): string | undefined {
		const projectFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
		return projectFolder?.uri.fsPath;
	}
}
