import * as vscode from 'vscode';
import { createCancellableSession } from './scanSession';
import { logger } from '../../../support/logger';

/**
 * Runs cancellable scan tasks and manages scan lifecycle state.
 * Single responsibility: cancellation + session lifecycle for scans.
 */
export class ScanRunner<T> {
	private currentCancellation: vscode.CancellationTokenSource | undefined;
	private isRunning = false;

	/** Returns `true` when a scan task is currently executing. */
	isScanInProgress(): boolean {
		return this.isRunning;
	}

	/** Cancels the active scan (best-effort). No-op when no scan is running. */
	cancel(): void {
		const cancellationSource = this.currentCancellation;
		if (!cancellationSource) return;
		cancellationSource.cancel();
	}

	/**
	 * Executes a cancellable task, managing scan lifecycle and post-processing.
	 * Cancels any previously running task before starting.
	 * @param params.task - Async work to run with a cancellation token.
	 * @param params.onResult - Optional hook called with the result before the runner transitions to idle.
	 * @param params.onScanState - Optional callback fired when running state changes.
	 * @returns The task result, or `undefined` if cancelled or superseded.
	 */
	async run(params: {
		task: (cancellationToken: vscode.CancellationToken) => Promise<T>;
		/**
		 * Optional hook invoked with the task result before the runner transitions to "not running".
		 * Useful for post-processing that must happen before "scanEnd" observers run.
		 */
		onResult?: (result: T) => void | Promise<void>;
		onScanState?: (isRunning: boolean) => void;
	}): Promise<T | undefined> {
		const { task, onResult, onScanState } = params;

		this.cancel();
		this.isRunning = true;
		onScanState?.(true);

		const session = createCancellableSession(task);
		this.currentCancellation = session.cancellationSource;

		try {
			const result = await session.run();
			if (onResult) {
				try {
					await onResult(result);
				} catch (error) {
					// Keep scan lifecycle stable even if post-processing fails.
					logger.error(`ScanRunner onResult failed: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
			return result;
		} finally {
			const isActiveSession = this.currentCancellation === session.cancellationSource;
			if (isActiveSession) this.currentCancellation = undefined;
			session.dispose();
			// Only the active (latest) run is allowed to transition the runner to "not running".
			// Prevents stale runs from flipping state/events when a newer run has already started.
			if (isActiveSession) {
				this.isRunning = false;
				onScanState?.(false);
			}
		}
	}
}
