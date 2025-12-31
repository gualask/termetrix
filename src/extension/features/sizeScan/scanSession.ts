import * as vscode from 'vscode';

export interface CancellableProgressSessionOptions<T> {
	title: string;
	task: (cancellationToken: vscode.CancellationToken) => Promise<T>;
}

export interface CancellableProgressSession<T> {
	cancellationSource: vscode.CancellationTokenSource;
	run: () => Thenable<T>;
	dispose: () => void;
}

/**
 * Creates a cancellable VS Code window progress session that links the UI cancellation token
 * to an internal CancellationTokenSource.
 *
 * Single responsibility: withProgress + cancellation wiring.
 */
export function createCancellableWindowProgressSession<T>({
	title,
	task,
}: CancellableProgressSessionOptions<T>): CancellableProgressSession<T> {
	const cancellationSource = new vscode.CancellationTokenSource();

	return {
		cancellationSource,
		run: () =>
			vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Window,
					title,
					cancellable: true,
				},
				async (_progress, token) => {
					token.onCancellationRequested(() => {
						cancellationSource.cancel();
					});

					return await task(cancellationSource.token);
				}
			),
		dispose: () => {
			cancellationSource.dispose();
		},
	};
}

/**
 * Creates a cancellable session without showing any VS Code UI.
 *
 * Useful for background refreshes where we still want cancellation support,
 * but want to avoid the overhead and noise of window progress notifications.
 */
export function createCancellableSilentSession<T>({
	task,
}: Pick<CancellableProgressSessionOptions<T>, 'task'>): CancellableProgressSession<T> {
	const cancellationSource = new vscode.CancellationTokenSource();

	return {
		cancellationSource,
		run: () => task(cancellationSource.token),
		dispose: () => {
			cancellationSource.dispose();
		},
	};
}
