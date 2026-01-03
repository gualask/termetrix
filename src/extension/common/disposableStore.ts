import type * as vscode from 'vscode';

/**
 * Minimal disposable container that disposes items in reverse order of registration.
 */
export class DisposableStore implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];

	/**
	 * Registers a disposable and returns it for convenience.
	 * @param disposable - Disposable to register.
	 * @returns The same disposable.
	 */
	add<T extends vscode.Disposable>(disposable: T): T {
		this.disposables.push(disposable);
		return disposable;
	}

	/**
	 * Disposes and clears all tracked disposables.
	 * @returns void
	 */
	clear(): void {
		// Dispose in reverse order to match typical "create -> dispose" lifetimes.
		while (this.disposables.length) {
			this.disposables.pop()?.dispose();
		}
	}

	/**
	 * Disposes and clears all tracked disposables.
	 * @returns void
	 */
	dispose(): void {
		this.clear();
	}
}
