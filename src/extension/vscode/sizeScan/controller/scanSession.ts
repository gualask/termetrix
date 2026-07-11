import * as vscode from 'vscode';

export interface CancellableProgressSession<T> {
	cancellationSource: vscode.CancellationTokenSource;
	run: () => Promise<T>;
	dispose: () => void;
}

/**
 * Creates a cancellable session wrapping a task with a VS Code cancellation token.
 * @param task - Task to execute with the internal cancellation token.
 * @returns Session handle with run/dispose.
 */
export function createCancellableSession<T>(
	task: (cancellationToken: vscode.CancellationToken) => Promise<T>,
): CancellableProgressSession<T> {
	const cancellationSource = new vscode.CancellationTokenSource();
	return {
		cancellationSource,
		run: () => task(cancellationSource.token),
		dispose: () => cancellationSource.dispose(),
	};
}
