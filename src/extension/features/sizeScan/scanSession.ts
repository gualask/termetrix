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

type CancellableTask<T> = (cancellationToken: vscode.CancellationToken) => Promise<T>;

function runWithCancellableWindowProgress<T>(
	title: string,
	cancellationSource: vscode.CancellationTokenSource,
	task: CancellableTask<T>
): Thenable<T> {
	return vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Window,
			title,
			cancellable: true,
		},
		async (_progress, uiToken) => {
			// Bridge the UI cancellation token to our internal token source.
			const cancellationBridge = uiToken.onCancellationRequested(() => {
				cancellationSource.cancel();
			});

			try {
				return await task(cancellationSource.token);
			} finally {
				cancellationBridge.dispose();
			}
		}
	);
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
		run: () => runWithCancellableWindowProgress(title, cancellationSource, task),
		dispose: () => cancellationSource.dispose(),
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
		dispose: () => cancellationSource.dispose(),
	};
}
