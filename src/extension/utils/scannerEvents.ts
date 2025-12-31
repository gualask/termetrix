import type { WorkspaceScanner } from '../scanner/workspaceScanner';
import type { ScanProgress } from '../types';

export interface ScanEventHandlers {
	onScanStart?: (progress: ScanProgress) => void;
	onProgress?: (progress: ScanProgress) => void;
	onScanEnd?: (progress: ScanProgress) => void;
}

interface BoundHandlers {
	scanStart: (progress: ScanProgress) => void;
	progress: (progress: ScanProgress) => void;
	scanEnd: (progress: ScanProgress) => void;
}

/**
 * Manages scanner event subscriptions with proper cleanup
 * Single responsibility: event subscription lifecycle
 */
export class ScannerEventSubscription {
	private boundHandlers: BoundHandlers;

	constructor(
		private scanner: WorkspaceScanner,
		handlers: ScanEventHandlers
	) {
		// Bind handlers with no-op fallbacks
		this.boundHandlers = {
			scanStart: handlers.onScanStart?.bind(handlers) ?? (() => {}),
			progress: handlers.onProgress?.bind(handlers) ?? (() => {}),
			scanEnd: handlers.onScanEnd?.bind(handlers) ?? (() => {})
		};

		this.subscribe();
	}

	private subscribe(): void {
		this.scanner.on('scanStart', this.boundHandlers.scanStart);
		this.scanner.on('progress', this.boundHandlers.progress);
		this.scanner.on('scanEnd', this.boundHandlers.scanEnd);
	}

	dispose(): void {
		this.scanner.off('scanStart', this.boundHandlers.scanStart);
		this.scanner.off('progress', this.boundHandlers.progress);
		this.scanner.off('scanEnd', this.boundHandlers.scanEnd);
	}
}

/**
 * Helper to create a subscription with automatic cleanup
 */
export function subscribeTo(
	scanner: WorkspaceScanner,
	handlers: ScanEventHandlers
): ScannerEventSubscription {
	return new ScannerEventSubscription(scanner, handlers);
}
