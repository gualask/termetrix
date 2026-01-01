import type { ProjectSizeScanner } from '../features/sizeScan/projectSizeScanner';
import type { ScanProgress } from '../types';

export interface ScanEventHandlers {
	onScanStart?: (progress: ScanProgress) => void;
	onProgress?: (progress: ScanProgress) => void;
	onScanEnd?: (progress: ScanProgress) => void;
}

type ScanProgressHandler = (progress: ScanProgress) => void;

const noop: ScanProgressHandler = () => {};

/**
 * Manages scanner event subscriptions with proper cleanup
 * Single responsibility: event subscription lifecycle
 */
export class ScannerEventSubscription {
	private readonly onScanStart: ScanProgressHandler;
	private readonly onProgress: ScanProgressHandler;
	private readonly onScanEnd: ScanProgressHandler;

	constructor(
		private scanner: ProjectSizeScanner,
		handlers: ScanEventHandlers
	) {
		this.onScanStart = handlers.onScanStart ?? noop;
		this.onProgress = handlers.onProgress ?? noop;
		this.onScanEnd = handlers.onScanEnd ?? noop;

		this.subscribe();
	}

	private subscribe(): void {
		this.scanner.on('scanStart', this.onScanStart);
		this.scanner.on('progress', this.onProgress);
		this.scanner.on('scanEnd', this.onScanEnd);
	}

	dispose(): void {
		this.scanner.off('scanStart', this.onScanStart);
		this.scanner.off('progress', this.onProgress);
		this.scanner.off('scanEnd', this.onScanEnd);
	}
}
