import type { MessageFromExtension, ScanKind } from '../../../types';
import { logger } from '../../../support/logger';
import { resolvePanelTargetPath } from './panelTargetPath';
import type { PanelCommandErrorSpec } from './errors';
import { createErrorMessage, createNoRootMessage } from '../messages';

type PanelStateDeps = {
	isPanelOpen: () => boolean;
	scanner: { getCurrentRoot: () => string | undefined };
};

type PanelScanDeps = PanelStateDeps & {
	sendMessage: (message: MessageFromExtension) => void;
	sessionState: {
		syncPanelRootPath: (rootPath: string) => void;
		beginRun: (kind: ScanKind, force?: boolean) => boolean;
	};
};

/**
 * Returns the current root path for the panel, or undefined when the panel is not open.
 * @param deps - Minimal dependencies required to determine the current panel root.
 * @returns Root path when available.
 */
export function getPanelRootPath(deps: PanelStateDeps): string | undefined {
	// Defensive: commands can arrive while the panel is closing.
	if (!deps.isPanelOpen()) return undefined;
	return deps.scanner.getCurrentRoot();
}

/**
 * Resolves a potentially relative path requested by the webview and validates it stays within the current root.
 * @param deps - Minimal dependencies required to validate panel state and root.
 * @param targetPath - Parsed path received from the webview.
 * @returns An absolute path within the root, or undefined when invalid/unavailable.
 */
export function resolvePanelPath(deps: PanelStateDeps, targetPath: string | undefined): string | undefined {
	const rootPath = getPanelRootPath(deps);
	if (!rootPath || !targetPath) return undefined;
	// Security: never allow the webview to request paths outside the project root.
	return resolvePanelTargetPath(rootPath, targetPath);
}

/**
 * Returns the synced root path for the panel, sending a `noRoot` message and returning
 * `undefined` when no root is available.
 * @param deps - Panel state and messaging dependencies.
 */
export function getSyncedPanelRootOrSendNoRoot(deps: PanelScanDeps): string | undefined {
	const rootPath = getPanelRootPath(deps);
	if (!rootPath) {
		deps.sendMessage(createNoRootMessage());
		return undefined;
	}
	deps.sessionState.syncPanelRootPath(rootPath);
	return rootPath;
}

/**
 * Sends a recoverable error message to the webview.
 * @param deps - Messaging dependency.
 * @param message - Human-readable message.
 * @param code - Stable error code string.
 * @returns void
 */
export function sendPanelError(
	deps: { sendMessage: (message: MessageFromExtension) => void },
	message: string,
	code: string
): void {
	deps.sendMessage(
		createErrorMessage({
			message,
			code,
			recoverable: true,
		})
	);
}

interface RunPanelParams<TResult> {
	deps: {
		isPanelOpen: () => boolean;
		sendMessage: (message: MessageFromExtension) => void;
	};
	error: PanelCommandErrorSpec;
	run: () => Promise<TResult>;
	onBeforeRun?: () => void;
	onSuccess?: (result: TResult) => void;
	onError?: (error: unknown) => void;
}

interface RunPanelScanParams<TResult> {
	deps: PanelScanDeps;
	scanKind: ScanKind;
	force?: boolean;
	error: PanelCommandErrorSpec;
	run: (rootPath: string) => Promise<TResult>;
	onBeforeRun?: (rootPath: string) => void;
	onSuccess?: (result: TResult, rootPath: string) => void;
	onError?: (rootPath: string, error: unknown) => void;
}

/**
 * Executes a plain command handler and reports failures back to the webview.
 * @returns Promise resolving once the handler completes.
 */
export async function runPanelCommand<TResult>(params: RunPanelParams<TResult>): Promise<void> {
	if (!params.deps.isPanelOpen()) return;
	params.onBeforeRun?.();
	try {
		const result = await params.run();
		if (!params.deps.isPanelOpen()) return;
		params.onSuccess?.(result);
	} catch (error) {
		if (!params.deps.isPanelOpen()) return;
		logger.error(`${params.error.logLabel}: ${error instanceof Error ? error.message : String(error)}`);
		sendPanelError(params.deps, params.error.message, params.error.code);
		params.onError?.(error);
	}
}

/**
 * Executes a scan-scoped command handler: resolves root, gates on scan lifecycle, and reports
 * failures back to the webview.
 * @returns Promise resolving once the handler completes.
 */
export async function runPanelScanCommand<TResult>(params: RunPanelScanParams<TResult>): Promise<void> {
	if (!params.deps.isPanelOpen()) return;
	const rootPath = getSyncedPanelRootOrSendNoRoot(params.deps);
	if (!rootPath) return;
	if (!params.deps.sessionState.beginRun(params.scanKind, params.force)) return;
	params.onBeforeRun?.(rootPath);
	try {
		const result = await params.run(rootPath);
		if (!params.deps.isPanelOpen()) return;
		params.onSuccess?.(result, rootPath);
	} catch (error) {
		if (!params.deps.isPanelOpen()) return;
		logger.error(`${params.error.logLabel}: ${error instanceof Error ? error.message : String(error)}`);
		sendPanelError(params.deps, params.error.message, params.error.code);
		params.onError?.(rootPath, error);
	}
}
