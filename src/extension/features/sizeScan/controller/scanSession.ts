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

/**
 * Runs a task under VS Code window progress, wiring UI cancellation to the provided token source.
 * @param title - Progress title shown in VS Code.
 * @param cancellationSource - Token source used by the task implementation.
 * @param task - Task to run.
 * @returns Thenable resolving to the task result.
 */
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
 * @param options - Session options.
 * @param options.title - Progress title shown in VS Code.
 * @param options.task - Task to execute with the internal cancellation token.
 * @returns Session handle with run/dispose.
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
 * @param options - Session options.
 * @param options.task - Task to execute with the internal cancellation token.
 * @returns Session handle with run/dispose.
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
