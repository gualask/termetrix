import type { MessageToExtension } from './types';

declare function acquireVsCodeApi(): {
	postMessage(message: unknown): void;
};

const vscode = acquireVsCodeApi();

export function postToExtension(message: MessageToExtension) {
	vscode.postMessage(message);
}

