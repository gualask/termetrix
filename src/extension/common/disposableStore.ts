import type * as vscode from 'vscode';

export class DisposableStore implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];

	add<T extends vscode.Disposable>(disposable: T): T {
		this.disposables.push(disposable);
		return disposable;
	}

	clear(): void {
		while (this.disposables.length) {
			this.disposables.pop()?.dispose();
		}
	}

	dispose(): void {
		this.clear();
	}
}
