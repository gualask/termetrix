import type { ProgressData } from '../../../types';
import { PROGRESS_THROTTLE_MS } from '../../../support/constants';

type FireStartFn = (rootPath: string) => void;
type FireProgressFn = (progress: ProgressData) => void;
type FireEndFn = () => void;

/**
 * Emits scan lifecycle and progress events with throttling.
 * Single responsibility: event emission policy (throttle + payload shaping).
 * Uses typed fire functions from VSCode EventEmitter for type safety.
 */
export class ScanEventEmitter {
	private lastProgressUpdate = 0;

	constructor(
		private readonly fireStart: FireStartFn,
		private readonly fireProgress: FireProgressFn,
		private readonly fireEnd: FireEndFn,
		private readonly progressThrottleMs: number = PROGRESS_THROTTLE_MS
	) {}

	onScanState(rootPath: string, isScanning: boolean): void {
		if (isScanning) {
			this.fireStart(rootPath);
			this.lastProgressUpdate = Date.now();
		} else {
			this.fireEnd();
		}
	}

	onProgress(progress: ProgressData): void {
		const now = Date.now();
		if (now - this.lastProgressUpdate < this.progressThrottleMs) return;

		this.fireProgress(progress);
		this.lastProgressUpdate = now;
	}
}
