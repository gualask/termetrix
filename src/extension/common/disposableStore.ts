import type * as vscode from 'vscode';

export class DisposableStore implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];

	add<T extends vscode.Disposable>(disposable: T): T {
		this.disposables.push(disposable);
		return disposable;
	}

	clear(): void {
		// Dispose in reverse order to match typical "create -> dispose" lifetimes.
		while (this.disposables.length) {
			this.disposables.pop()?.dispose();
		}
	}

	dispose(): void {
		this.clear();
	}
}
