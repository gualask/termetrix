/**
 * Shared cancellation token contract used across scan engines.
 */
export interface CancellationToken {
	readonly isCancellationRequested: boolean;
}
