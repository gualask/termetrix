import type * as vscode from 'vscode';
import { configManager, shouldAutoScanOnRootChange } from '../../../support/configManager';
import { ProjectRootController } from '../controller/projectRootController';

export interface RootLifecycleServiceOptions {
	onRootChangeScheduled?: () => void;
	onRootChanged: (rootPath: string) => void;
	onRootChangedAutoScan?: (rootPath: string) => void;
}

/**
 * Owns root selection lifecycle and root-change policies.
 * Single responsibility: root tracking + root-change scan policy.
 */
export class RootLifecycleService {
	private readonly rootController: ProjectRootController;

	constructor(private readonly options: RootLifecycleServiceOptions) {
		this.rootController = new ProjectRootController({
			onRootChangeScheduled: this.options.onRootChangeScheduled,
			onRootChanged: (rootPath) => this.handleRootChanged(rootPath),
		});
	}

	initialize(): void {
		this.rootController.initializeFromActiveEditor();
	}

	dispose(): void {
		this.rootController.dispose();
	}

	getCurrentRoot(): string | undefined {
		return this.rootController.getCurrentRoot();
	}

	handleEditorChange(editor: vscode.TextEditor): void {
		const { rootSwitchDebounceMs } = configManager.getScanSettings();
		this.rootController.handleEditorChange(editor, rootSwitchDebounceMs);
	}

	private handleRootChanged(rootPath: string): void {
		this.options.onRootChanged(rootPath);
		if (!this.shouldAutoScanOnRootChange()) return;
		this.options.onRootChangedAutoScan?.(rootPath);
	}

	private shouldAutoScanOnRootChange(): boolean {
		const { autoScanMode } = configManager.getScanSettings();
		return shouldAutoScanOnRootChange(autoScanMode);
	}
}
