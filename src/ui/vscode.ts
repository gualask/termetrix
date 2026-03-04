import type { MessageToExtension } from './types';

declare function acquireVsCodeApi(): {
	postMessage(message: unknown): void;
};

type VsCodeApi = ReturnType<typeof acquireVsCodeApi>;

let cachedApi: VsCodeApi | undefined;

function getVsCodeApi(): VsCodeApi {
	if (cachedApi) return cachedApi;

	// Unit tests (Node) and non-webview environments won't define `acquireVsCodeApi`.
	if (typeof acquireVsCodeApi !== 'function') {
		return { postMessage: () => undefined };
	}

	cachedApi = acquireVsCodeApi();
	return cachedApi;
}

export function postToExtension(message: MessageToExtension) {
	getVsCodeApi().postMessage(message);
}

export function postReady(): void {
	postToExtension({ command: 'ready' });
}

export function postRefresh(): void {
	postToExtension({ command: 'refresh' });
}

export function postCancelScan(target: 'size' | 'loc'): void {
	postToExtension({ command: 'cancelScan', target });
}

export function postCalculateLOC(): void {
	postToExtension({ command: 'calculateLOC' });
}

export function postRevealInExplorer(path: string): void {
	postToExtension({ command: 'revealInExplorer', path });
}

export function postOpenFile(path: string): void {
	postToExtension({ command: 'openFile', path });
}

export function postReset(): void {
	postToExtension({ command: 'reset' });
}
