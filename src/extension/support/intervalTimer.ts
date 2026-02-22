/**
 * Simple interval timer with automatic cleanup on restart.
 * Single responsibility: interval lifecycle management.
 *
 * Lives under `extension/support` (host-side only).
 */
export class IntervalTimer {
	private timer: NodeJS.Timeout | undefined;

	/**
	 * Starts the interval timer, stopping any existing timer first.
	 * @param intervalMs - Interval in milliseconds.
	 * @param callback - Function to call on each interval.
	 */
	start(intervalMs: number, callback: () => void): void {
		this.stop();
		this.timer = setInterval(callback, intervalMs);
	}

	/**
	 * Stops the interval timer if running.
	 */
	stop(): void {
		if (!this.timer) return;
		clearInterval(this.timer);
		this.timer = undefined;
	}
}
